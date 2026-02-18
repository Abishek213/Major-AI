const logger = require('../../../config/logger');
const CounterOffer = require('./counter-offer');
const axios = require('axios');
const MessageBus = require('../../../orchestrator/workflows/message-bus');

class NegotiationAgent {
  constructor() {
    this.name = 'event-request-negotiation-agent';
    this.counterOffer = new CounterOffer();
    this.messageBus = new MessageBus();
    this.BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';
    
    this.strategy = {
      max_rounds: 5,
      timeout_hours: 72,
      min_concession: 0.05,
      max_total_concession: 0.3
    };

    // Store active negotiations
    this.activeNegotiations = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return true;
    
    logger.agent(this.name, 'Initializing event request negotiation agent');
    
    try {
      // Initialize message bus
      await this.messageBus.initialize();
      
      // Setup message handlers
      await this.setupMessageHandlers();
      
      // Sync market data
      await this.counterOffer.syncMarketDataFromBackend();
      
      this.initialized = true;
      logger.success('Negotiation agent initialized');
      
      // Start periodic market data sync
      setInterval(() => {
        this.counterOffer.syncMarketDataFromBackend();
      }, 3600000); // Every hour
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize negotiation agent:', error);
      throw error;
    }
  }

  async setupMessageHandlers() {
    // Listen for organizer offers
    await this.messageBus.subscribe(
      'negotiation.organizer.offer',
      this.name,
      this.handleOrganizerOffer.bind(this)
    );

    // Listen for user counters
    await this.messageBus.subscribe(
      'negotiation.user.counter',
      this.name,
      this.handleUserCounter.bind(this)
    );

    // Listen for negotiation acceptance
    await this.messageBus.subscribe(
      'negotiation.accept',
      this.name,
      this.handleAcceptance.bind(this)
    );

    // Listen for negotiation rejection
    await this.messageBus.subscribe(
      'negotiation.reject',
      this.name,
      this.handleRejection.bind(this)
    );

    logger.info('Message handlers setup complete');
  }

  async handleOrganizerOffer(message) {
    try {
      const { eventRequestId, organizerId, organizerOffer, organizerMessage, eventDetails } = message.data;
      
      logger.agent(this.name, `Organizer offer received for ${eventRequestId}: NPR ${organizerOffer}`);

      const negotiationId = `neg_${eventRequestId}_${organizerId}_${Date.now()}`;
      
      // Store in memory
      this.activeNegotiations.set(negotiationId, {
        negotiationId,
        eventRequestId,
        organizerId,
        organizerOffer,
        organizerMessage,
        eventDetails,
        round: 1,
        status: 'active',
        history: [{
          round: 1,
          offer: organizerOffer,
          party: 'organizer',
          message: organizerMessage || 'Initial offer',
          timestamp: new Date()
        }],
        createdAt: new Date()
      });

      logger.info(`Negotiation ${negotiationId} started with offer: NPR ${organizerOffer}`);

      // Acknowledge receipt via message bus
      await this.messageBus.publish(
        `negotiation.started.${eventRequestId}`,
        {
          success: true,
          negotiationId,
          eventRequestId,
          organizerId,
          round: 1,
          status: 'active'
        },
        { sender: this.name, correlationId: message.id }
      );

    } catch (error) {
      logger.error(`Error handling organizer offer: ${error.message}`);
      
      await this.messageBus.publish(
        `negotiation.error.${message.data?.eventRequestId}`,
        { error: error.message },
        { sender: this.name, correlationId: message.id }
      );
    }
  }

  async handleUserCounter(message) {
    try {
      const { 
        eventRequestId, 
        userOffer, 
        organizerOffer, 
        eventType, 
        location, 
        currentRound,
        negotiationId,
        userId
      } = message.data;

      logger.agent(this.name, `Generating counter offer for ${eventRequestId}, round ${currentRound}`);

      // Get or create negotiation record
      let negotiation = this.activeNegotiations.get(negotiationId);
      
      if (!negotiation) {
        // Try to fetch from backend if not in memory
        try {
          const response = await axios.get(
            `${this.BACKEND_URL}/api/negotiation/${negotiationId}`
          );
          if (response.data.success) {
            negotiation = response.data.data;
            this.activeNegotiations.set(negotiationId, negotiation);
          }
        } catch (error) {
          logger.warn(`Could not fetch negotiation ${negotiationId} from backend`);
        }
      }

      // Calculate counter offer
      const counterResponse = this.counterOffer.calculateEventRequestCounter(
        userOffer,
        organizerOffer,
        eventType,
        location
      );

      // Determine if we should accept
      const shouldAccept = this.shouldAcceptOffer(
        userOffer,
        organizerOffer,
        currentRound,
        counterResponse
      );

      // Get market analysis
      const marketAnalysis = this.counterOffer.getEventTypePriceRecommendation(
        eventType, 
        location
      );

      const response = {
        success: true,
        data: {
          negotiationId,
          eventRequestId,
          userOffer,
          organizerOffer,
          aiOffer: shouldAccept ? userOffer : counterResponse.offer,
          message: shouldAccept ? 'Great! This offer is acceptable.' : counterResponse.reasoning,
          accepted: shouldAccept,
          finalOffer: counterResponse.finalOffer || shouldAccept,
          concessionRate: counterResponse.concessionRate,
          marketAnalysis: {
            estimatedPrice: marketAnalysis.estimatedPrice,
            season: marketAnalysis.season,
            seasonMultiplier: marketAnalysis.seasonMultiplier,
            locationMultiplier: marketAnalysis.locationMultiplier,
            perPerson: marketAnalysis.perPerson
          },
          round: currentRound + 1,
          timestamp: new Date().toISOString()
        }
      };

      // Update negotiation history if we have it
      if (negotiation) {
        negotiation.history.push({
          round: currentRound + 1,
          offer: response.data.aiOffer,
          party: 'ai',
          message: response.data.message,
          timestamp: new Date()
        });
        negotiation.round = currentRound + 1;
        this.activeNegotiations.set(negotiationId, negotiation);
      }

      // Publish response back
      await this.messageBus.publish(
        `negotiation.response.${eventRequestId}`,
        response,
        { sender: this.name, correlationId: message.id }
      );

      // If accepted, also publish acceptance
      if (shouldAccept) {
        await this.messageBus.publish(
          `negotiation.ai.accept.${eventRequestId}`,
          {
            negotiationId,
            eventRequestId,
            finalAmount: userOffer,
            acceptedBy: 'ai'
          },
          { sender: this.name, correlationId: message.id }
        );
      }

      logger.info(`Counter offer generated for ${eventRequestId}: NPR ${response.data.aiOffer}`);
      return response;

    } catch (error) {
      logger.error(`Error generating counter offer: ${error.message}`);
      
      // Send error response
      const errorResponse = {
        success: false,
        error: error.message,
        data: {
          offer: Math.round((message.data?.userOffer + message.data?.organizerOffer) / 2),
          message: 'AI service temporarily unavailable. Using midpoint as fallback.',
          accepted: false,
          finalOffer: false,
          fallback: true
        }
      };

      await this.messageBus.publish(
        `negotiation.response.${message.data?.eventRequestId}`,
        errorResponse,
        { sender: this.name, correlationId: message.id }
      );

      return errorResponse;
    }
  }

  async handleAcceptance(message) {
    try {
      const { negotiationId, eventRequestId, acceptedBy, finalAmount } = message.data;
      
      logger.agent(this.name, `Negotiation ${negotiationId} accepted by ${acceptedBy}`);

      const negotiation = this.activeNegotiations.get(negotiationId);
      if (negotiation) {
        negotiation.status = 'accepted';
        negotiation.finalAmount = finalAmount;
        negotiation.acceptedBy = acceptedBy;
        negotiation.acceptedAt = new Date();
        this.activeNegotiations.set(negotiationId, negotiation);
      }

      // Could trigger post-acceptance actions here
      // Like sending congratulations, etc.

    } catch (error) {
      logger.error(`Error handling acceptance: ${error.message}`);
    }
  }

  async handleRejection(message) {
    try {
      const { negotiationId, eventRequestId, rejectedBy } = message.data;
      
      logger.agent(this.name, `Negotiation ${negotiationId} rejected by ${rejectedBy}`);

      const negotiation = this.activeNegotiations.get(negotiationId);
      if (negotiation) {
        negotiation.status = 'rejected';
        negotiation.rejectedBy = rejectedBy;
        negotiation.rejectedAt = new Date();
        this.activeNegotiations.set(negotiationId, negotiation);
      }

    } catch (error) {
      logger.error(`Error handling rejection: ${error.message}`);
    }
  }

  shouldAcceptOffer(userOffer, lastOrganizerOffer, currentRound, aiResponse) {
    // Accept if gap is very small
    const gap = Math.abs(userOffer - lastOrganizerOffer) / lastOrganizerOffer;
    if (gap <= 0.1 && currentRound >= 2) {
      return true;
    }
    
    // Accept if AI says it's final offer
    if (aiResponse.finalOffer) {
      return true;
    }
    
    // Accept if user offer is above market price
    if (aiResponse.marketPrice && userOffer >= aiResponse.marketPrice) {
      return true;
    }
    
    // Accept if we've reached max rounds
    if (currentRound >= this.strategy.max_rounds) {
      return gap <= 0.15; // Accept if close enough
    }
    
    return false;
  }

  async getPriceAnalysis(eventType, location, userBudget) {
    const analysis = this.counterOffer.validateOffer(userBudget, eventType, location);
    const recommendation = this.counterOffer.getEventTypePriceRecommendation(eventType, location);
    
    return {
      success: true,
      userBudget,
      marketAnalysis: {
        estimatedPrice: recommendation.estimatedPrice,
        basePrice: recommendation.basePrice,
        locationMultiplier: recommendation.locationMultiplier,
        season: recommendation.season,
        seasonMultiplier: recommendation.seasonMultiplier,
        perPerson: recommendation.perPerson
      },
      validation: {
        isReasonable: analysis.isReasonable,
        minReasonable: analysis.minReasonable,
        maxReasonable: analysis.maxReasonable,
        suggestion: analysis.suggestion
      },
      recommendations: recommendation.recommendations
    };
  }

  async getNegotiationStatus(negotiationId) {
    const negotiation = this.activeNegotiations.get(negotiationId);
    
    if (!negotiation) {
      return {
        success: false,
        error: 'Negotiation not found in memory'
      };
    }

    return {
      success: true,
      data: {
        negotiationId,
        eventRequestId: negotiation.eventRequestId,
        organizerId: negotiation.organizerId,
        currentRound: negotiation.round,
        status: negotiation.status,
        history: negotiation.history,
        createdAt: negotiation.createdAt,
        lastUpdated: negotiation.updatedAt || negotiation.createdAt
      }
    };
  }

  async getStats() {
    return {
      activeNegotiations: this.activeNegotiations.size,
      initialized: this.initialized,
      messageBusStats: await this.messageBus.getStats(),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }
}

module.exports = NegotiationAgent;