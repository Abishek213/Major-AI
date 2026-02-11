const logger = require('../../../config/logger');
const CounterOffer = require('./counter-offer');

class NegotiationAgent {
  constructor() {
    this.name = 'event-request-negotiation-agent';
    this.counterOffer = new CounterOffer();
    this.eventRequestNegotiations = new Map(); // Store ONLY event request negotiations
    
    // Simplified strategy for event requests
    this.strategy = {
      max_rounds: 5,           // Max 5 negotiation rounds
      timeout_hours: 72,       // 3 days to respond
      min_concession: 0.05,    // At least 5% concession per round
      max_total_concession: 0.3 // Max 30% total concession
    };
  }

  async initialize() {
    logger.agent(this.name, 'Initializing event request negotiation agent');
    return true;
  }

  // ✅ NEW: Start negotiation when organizer responds to event request
  async startEventRequestNegotiation(eventRequestId, organizerId, organizerOffer, organizerMessage) {
    try {
      const negotiationId = `evt_req_${eventRequestId}_${organizerId}`;
      
      // Store negotiation
      const negotiation = {
        id: negotiationId,
        eventRequestId,
        organizerId,
        type: 'price',
        status: 'organizer_proposed',
        currentRound: 1,
        offers: [{
          amount: organizerOffer,
          party: 'organizer',
          timestamp: new Date().toISOString(),
          message: organizerMessage,
          round: 1
        }],
        metadata: {
          startedAt: new Date().toISOString(),
          lastUserActivity: null,
          timeoutAt: new Date(Date.now() + (this.strategy.timeout_hours * 60 * 60 * 1000))
        },
        history: []
      };
      
      this.eventRequestNegotiations.set(negotiationId, negotiation);
      
      logger.success(`Event request negotiation started: ${negotiationId}`);
      
      return {
        success: true,
        negotiationId,
        status: 'awaiting_user_response',
        organizerOffer,
        message: 'Negotiation started. User can now counter-offer.'
      };
    } catch (error) {
      logger.error(`Failed to start negotiation: ${error.message}`);
      return {
        success: false,
        error: 'Failed to start negotiation'
      };
    }
  }

  // ✅ NEW: User makes counter-offer
  async processUserCounter(negotiationId, userOffer, userMessage = '') {
    try {
      const negotiation = this.eventRequestNegotiations.get(negotiationId);
      
      if (!negotiation) {
        throw new Error('Negotiation not found');
      }
      
      if (negotiation.status === 'concluded') {
        throw new Error('Negotiation already concluded');
      }
      
      if (negotiation.status === 'expired') {
        throw new Error('Negotiation expired');
      }
      
      // Add user's counter offer
      negotiation.offers.push({
        amount: userOffer,
        party: 'user',
        timestamp: new Date().toISOString(),
        message: userMessage,
        round: negotiation.currentRound
      });
      
      // Get last organizer offer
      const lastOrganizerOffer = negotiation.offers
        .filter(o => o.party === 'organizer')
        .pop();
      
      if (!lastOrganizerOffer) {
        throw new Error('No organizer offer found');
      }
      
      // Get event request details (in real app, fetch from DB)
      const eventDetails = await this.getEventRequestDetails(negotiation.eventRequestId);
      
      // Generate AI counter-offer
      const aiResponse = this.counterOffer.calculateEventRequestCounter(
        userOffer,
        lastOrganizerOffer.amount,
        eventDetails.eventType,
        eventDetails.location
      );
      
      // Check if AI recommends accepting
      const shouldAccept = this.shouldAcceptOffer(
        userOffer,
        lastOrganizerOffer.amount,
        negotiation.currentRound,
        aiResponse
      );
      
      // Add AI/organizer response
      negotiation.offers.push({
        amount: shouldAccept ? userOffer : aiResponse.offer,
        party: 'organizer_ai',
        timestamp: new Date().toISOString(),
        message: shouldAccept ? 'Deal accepted! Let\'s proceed.' : aiResponse.reasoning,
        round: negotiation.currentRound,
        isAI: true,
        metadata: {
          concessionRate: aiResponse.concessionRate,
          marketAdjusted: true
        }
      });
      
      // Update status
      if (shouldAccept || aiResponse.finalOffer) {
        negotiation.status = 'concluded';
        negotiation.result = shouldAccept ? 'user_offer_accepted' : 'final_offer_made';
        negotiation.finalAmount = shouldAccept ? userOffer : aiResponse.offer;
        negotiation.concludedAt = new Date().toISOString();
      } else {
        negotiation.currentRound += 1;
        negotiation.status = 'countered';
        
        // Check if max rounds reached
        if (negotiation.currentRound > this.strategy.max_rounds) {
          negotiation.status = 'expired';
          negotiation.result = 'max_rounds_reached';
        }
      }
      
      negotiation.metadata.lastUserActivity = new Date().toISOString();
      
      // Save to history
      negotiation.history.push({
        round: negotiation.currentRound,
        userOffer,
        aiResponse: aiResponse.offer,
        timestamp: new Date().toISOString()
      });
      
      this.eventRequestNegotiations.set(negotiationId, negotiation);
      
      logger.agent(this.name, `Round ${negotiation.currentRound} completed for ${negotiationId}`);
      
      return {
        success: true,
        negotiation: {
          id: negotiation.id,
          eventRequestId: negotiation.eventRequestId,
          currentRound: negotiation.currentRound,
          status: negotiation.status,
          lastOffer: negotiation.offers[negotiation.offers.length - 1],
          offers: negotiation.offers.slice(-3), // Last 3 offers
          progress: this.calculateProgress(negotiation.offers),
          isFinal: shouldAccept || aiResponse.finalOffer
        },
        aiResponse: {
          offer: shouldAccept ? userOffer : aiResponse.offer,
          message: shouldAccept ? 'Deal accepted!' : aiResponse.reasoning,
          accepted: shouldAccept,
          finalOffer: aiResponse.finalOffer
        }
      };
    } catch (error) {
      logger.error(`Failed to process user counter: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ✅ NEW: Simple acceptance logic
  shouldAcceptOffer(userOffer, lastOrganizerOffer, currentRound, aiResponse) {
    const gap = Math.abs(userOffer - lastOrganizerOffer) / lastOrganizerOffer;
    
    // Rule 1: Accept if within 10% and past round 2
    if (gap <= 0.1 && currentRound >= 2) {
      return true;
    }
    
    // Rule 2: Accept if AI says it's final offer
    if (aiResponse.finalOffer) {
      return true;
    }
    
    // Rule 3: 50% chance to accept after max rounds
    if (currentRound >= this.strategy.max_rounds) {
      return Math.random() > 0.5;
    }
    
    return false;
  }

  // ✅ NEW: Get event request details (mock - in real app fetch from DB)
  async getEventRequestDetails(eventRequestId) {
    // This would fetch from database
    // For now, return mock data matching your event request structure
    return {
      eventType: 'wedding', // Would be fetched from DB
      location: 'Kathmandu',
      originalBudget: 500000,
      guestCount: 150
    };
  }

  // ✅ NEW: Calculate progress percentage
  calculateProgress(offers) {
    if (offers.length < 2) return 0;
    
    const organizerOffers = offers.filter(o => o.party === 'organizer' || o.party === 'organizer_ai');
    const userOffers = offers.filter(o => o.party === 'user');
    
    if (organizerOffers.length < 2 || userOffers.length < 1) return 0;
    
    const firstOrganizer = organizerOffers[0].amount;
    const lastOrganizer = organizerOffers[organizerOffers.length - 1].amount;
    const lastUser = userOffers[userOffers.length - 1].amount;
    
    const organizerMovement = Math.abs(firstOrganizer - lastOrganizer) / firstOrganizer;
    const userMovement = userOffers.length > 1 ? 
      Math.abs(userOffers[0].amount - lastUser) / userOffers[0].amount : 0;
    
    return Math.round((organizerMovement + userMovement) * 50); // Scale to 0-100%
  }

  // ✅ NEW: Get negotiation status
  async getNegotiationStatus(negotiationId) {
    const negotiation = this.eventRequestNegotiations.get(negotiationId);
    
    if (!negotiation) {
      return {
        success: false,
        error: 'Negotiation not found'
      };
    }
    
    return {
      success: true,
      negotiation: {
        id: negotiation.id,
        eventRequestId: negotiation.eventRequestId,
        status: negotiation.status,
        currentRound: negotiation.currentRound,
        totalOffers: negotiation.offers.length,
        lastOffer: negotiation.offers[negotiation.offers.length - 1],
        progress: this.calculateProgress(negotiation.offers),
        metadata: {
          startedAt: negotiation.metadata.startedAt,
          timeoutAt: negotiation.metadata.timeoutAt,
          isActive: negotiation.status === 'organizer_proposed' || negotiation.status === 'countered'
        }
      }
    };
  }

  // ✅ NEW: Get all negotiations for an event request
  async getEventRequestNegotiations(eventRequestId) {
    const negotiations = Array.from(this.eventRequestNegotiations.values())
      .filter(neg => neg.eventRequestId === eventRequestId)
      .map(neg => ({
        id: neg.id,
        organizerId: neg.organizerId,
        status: neg.status,
        currentRound: neg.currentRound,
        lastOffer: neg.offers[neg.offers.length - 1],
        startedAt: neg.metadata.startedAt
      }));
    
    return {
      success: true,
      count: negotiations.length,
      negotiations
    };
  }

  // ✅ NEW: Accept offer manually (user accepts AI's counter)
  async acceptOffer(negotiationId, userId) {
    const negotiation = this.eventRequestNegotiations.get(negotiationId);
    
    if (!negotiation) {
      throw new Error('Negotiation not found');
    }
    
    const lastOffer = negotiation.offers[negotiation.offers.length - 1];
    
    negotiation.status = 'concluded';
    negotiation.result = 'user_accepted';
    negotiation.finalAmount = lastOffer.amount;
    negotiation.concludedBy = userId;
    negotiation.concludedAt = new Date().toISOString();
    
    this.eventRequestNegotiations.set(negotiationId, negotiation);
    
    return {
      success: true,
      negotiationId,
      finalAmount: negotiation.finalAmount,
      message: 'Offer accepted successfully'
    };
  }

  // ✅ NEW: Get price analysis for event request
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
      validation: analysis,
      suggestions: recommendation.recommendations
    };
  }
}

module.exports = NegotiationAgent;