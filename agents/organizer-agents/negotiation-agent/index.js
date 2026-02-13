const logger = require('../../../config/logger');
const CounterOffer = require('./counter-offer');
const axios = require('axios');
const MessageBus = require('../../../orchestrator/message-bus');

class NegotiationAgent {
  constructor() {
    this.name = 'event-request-negotiation-agent';
    this.counterOffer = new CounterOffer();
    this.messageBus = new MessageBus();
    this.BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4002';
    
    this.strategy = {
      max_rounds: 5,
      timeout_hours: 72,
      min_concession: 0.05,
      max_total_concession: 0.3
    };
  }

  async initialize() {
    logger.agent(this.name, 'Initializing event request negotiation agent');
    
    // Setup message bus listeners
    await this.setupMessageHandlers();
    
    logger.success('Negotiation agent initialized');
    return true;
  }

  async setupMessageHandlers() {
    // Listen for event request creations
    await this.messageBus.subscribe(
      'eventrequest.created',
      'negotiation-agent',
      this.handleNewEventRequest.bind(this)
    );

    // Listen for organizer offers
    await this.messageBus.subscribe(
      'negotiation.organizer.offer',
      'negotiation-agent',
      this.handleOrganizerOffer.bind(this)
    );

    // Listen for user counters
    await this.messageBus.subscribe(
      'negotiation.user.counter',
      'negotiation-agent',
      this.handleUserCounter.bind(this)
    );
  }

  async handleNewEventRequest(message) {
    try {
      const eventRequest = message.data;
      logger.agent(this.name, `New event request: ${eventRequest._id}`);

      // Don't need to do anything immediately - just log
      // Organizers will be notified by backend
      
    } catch (error) {
      logger.error(`Error handling new event request: ${error.message}`);
    }
  }

  async handleOrganizerOffer(message) {
    try {
      const { eventRequestId, organizerId, organizerOffer, eventDetails } = message.data;
      
      logger.agent(this.name, `Organizer offer received for ${eventRequestId}`);

      // Store in memory for quick access
      const negotiationId = `evt_req_${eventRequestId}_${organizerId}`;
      
      // Could store in Redis, but for now just log
      logger.info(`Negotiation ${negotiationId} started with offer: NPR ${organizerOffer}`);
      
    } catch (error) {
      logger.error(`Error handling organizer offer: ${error.message}`);
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
        currentRound 
      } = message.data;

      logger.agent(this.name, `Generating counter offer for ${eventRequestId}`);

      // Calculate counter offer using Nepal-specific logic
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

      const response = {
        success: true,
        data: {
          offer: shouldAccept ? userOffer : counterResponse.offer,
          message: shouldAccept ? 'Deal accepted!' : counterResponse.reasoning,
          accepted: shouldAccept,
          finalOffer: counterResponse.finalOffer,
          concessionRate: counterResponse.concessionRate,
          marketAdjusted: true,
          eventType,
          location,
          seasonalMultiplier: this.counterOffer.getCurrentSeason(),
          locationMultiplier: this.counterOffer.marketData.location_multipliers[
            Object.keys(this.counterOffer.marketData.location_multipliers)
              .find(loc => location?.toLowerCase().includes(loc)) || 'default'
          ] || 1.0
        }
      };

      // Publish response back
      await this.messageBus.publish(
        `negotiation.response.${eventRequestId}`,
        response,
        { sender: this.name, correlationId: message.id }
      );

      return response;

    } catch (error) {
      logger.error(`Error generating counter offer: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  shouldAcceptOffer(userOffer, lastOrganizerOffer, currentRound, aiResponse) {
    const gap = Math.abs(userOffer - lastOrganizerOffer) / lastOrganizerOffer;
    
    if (gap <= 0.1 && currentRound >= 2) {
      return true;
    }
    
    if (aiResponse.finalOffer) {
      return true;
    }
    
    if (currentRound >= this.strategy.max_rounds) {
      return Math.random() > 0.5;
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
        seasonMultiplier: recommendation.seasonMultiplier
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
}

module.exports = NegotiationAgent;