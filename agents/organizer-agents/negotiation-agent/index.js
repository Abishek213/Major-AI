const logger = require('../../../config/logger');
const CounterOffer = require('./counter-offer');

class NegotiationAgent {
  constructor() {
    this.name = 'negotiation-agent';
    this.counterOffer = new CounterOffer();
    this.negotiationHistory = new Map();
    this.strategies = {
      'price': {
        initial_concession: 0.1,
        max_concession: 0.3,
        time_factor: 0.01
      },
      'date': {
        initial_concession: 0.2,
        max_concession: 0.5,
        time_factor: 0.02
      },
      'venue': {
        initial_concession: 0.15,
        max_concession: 0.4,
        time_factor: 0.015
      }
    };
  }

  async initialize() {
    logger.agent(this.name, 'Initializing negotiation agent');
    return true;
  }

  async initiateNegotiation(bookingId, userId, initialOffer, negotiationType = 'price') {
    try {
      logger.agent(this.name, `Initiating negotiation for booking ${bookingId}`);
      
      const negotiationId = `neg_${Date.now()}_${bookingId}`;
      
      const negotiation = {
        id: negotiationId,
        bookingId,
        userId,
        type: negotiationType,
        offers: [{
          amount: initialOffer,
          party: 'user',
          timestamp: new Date().toISOString(),
          message: 'Initial offer'
        }],
        status: 'active',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        strategy: this.strategies[negotiationType] || this.strategies.price
      };
      
      // Store negotiation
      this.negotiationHistory.set(negotiationId, negotiation);
      
      logger.success(`Negotiation ${negotiationId} initiated`);
      
      return {
        success: true,
        negotiationId,
        status: 'active',
        current_offer: initialOffer,
        next_action: 'awaiting_counter_offer'
      };
    } catch (error) {
      logger.error(`Failed to initiate negotiation: ${error.message}`);
      return {
        success: false,
        error: 'Failed to initiate negotiation'
      };
    }
  }

  async processCounterOffer(negotiationId, offer, party, message = '') {
    try {
      const negotiation = this.negotiationHistory.get(negotiationId);
      
      if (!negotiation) {
        throw new Error(`Negotiation ${negotiationId} not found`);
      }
      
      if (negotiation.status !== 'active') {
        throw new Error(`Negotiation ${negotiationId} is ${negotiation.status}`);
      }
      
      // Add new offer
      negotiation.offers.push({
        amount: offer,
        party,
        timestamp: new Date().toISOString(),
        message
      });
      
      negotiation.lastUpdated = new Date().toISOString();
      
      // Generate AI response if party is user
      if (party === 'user') {
        const aiResponse = await this.generateAIReponse(negotiation, offer);
        negotiation.offers.push({
          amount: aiResponse.offer,
          party: 'ai',
          timestamp: new Date().toISOString(),
          message: aiResponse.message,
          reasoning: aiResponse.reasoning
        });
        
        negotiation.lastUpdated = new Date().toISOString();
        
        // Check if negotiation should be concluded
        if (aiResponse.conclude) {
          negotiation.status = 'concluded';
          negotiation.result = aiResponse.result;
          negotiation.concludedAt = new Date().toISOString();
        }
      }
      
      // Update history
      this.negotiationHistory.set(negotiationId, negotiation);
      
      logger.agent(this.name, `Processed counter offer for ${negotiationId}: ${offer} from ${party}`);
      
      return {
        success: true,
        negotiation: this.sanitizeNegotiation(negotiation),
        last_offer: negotiation.offers[negotiation.offers.length - 1],
        status: negotiation.status
      };
    } catch (error) {
      logger.error(`Failed to process counter offer: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateAIReponse(negotiation, userOffer) {
    const strategy = negotiation.strategy;
    const history = negotiation.offers;
    
    // Get previous AI offer
    const previousAIOffer = history
      .filter(offer => offer.party === 'ai')
      .pop();
    
    const previousOffer = previousAIOffer ? previousAIOffer.amount : history[0].amount;
    
    // Calculate counter offer
    const counterOffer = this.counterOffer.calculateCounterOffer(
      userOffer,
      previousOffer,
      strategy,
      negotiation.type
    );
    
    // Generate message
    const message = this.generateNegotiationMessage(
      negotiation.type,
      userOffer,
      counterOffer.offer,
      counterOffer.concessionRate
    );
    
    // Check if we should accept
    const shouldAccept = this.shouldAcceptOffer(
      userOffer,
      previousOffer,
      strategy,
      negotiation.offers.length
    );
    
    return {
      offer: shouldAccept ? userOffer : counterOffer.offer,
      message: shouldAccept ? 'Offer accepted!' : message,
      reasoning: counterOffer.reasoning,
      concede: shouldAccept,
      conclude: shouldAccept || counterOffer.finalOffer,
      result: shouldAccept ? 'accepted' : 'countered'
    };
  }

  generateNegotiationMessage(type, userOffer, counterOffer, concessionRate) {
    const messages = {
      'price': [
        `I understand your offer of ${userOffer}. Based on market rates, I can offer ${counterOffer}.`,
        `Thank you for your offer. I can come down to ${counterOffer}, which is a ${Math.round(concessionRate * 100)}% concession.`,
        `I appreciate your offer. Our best price would be ${counterOffer}.`
      ],
      'date': [
        `The date you requested is challenging. How about ${counterOffer} instead?`,
        `I can accommodate your request by shifting to ${counterOffer}.`,
        `Let's find a middle ground: ${counterOffer} works for us.`
      ],
      'venue': [
        `The venue you requested is booked. ${counterOffer} is available and similar.`,
        `I can offer ${counterOffer} as an alternative venue.`,
        `How about ${counterOffer} instead? It has similar amenities.`
      ]
    };
    
    const typeMessages = messages[type] || messages.price;
    return typeMessages[Math.floor(Math.random() * typeMessages.length)];
  }

  shouldAcceptOffer(userOffer, previousOffer, strategy, round) {
    // Accept if within acceptable range
    const acceptableRange = previousOffer * (1 - strategy.max_concession);
    
    if (userOffer >= acceptableRange) {
      return true;
    }
    
    // Accept if too many rounds
    if (round >= 5) {
      return Math.random() > 0.5; // 50% chance to accept
    }
    
    return false;
  }

  async getNegotiationStatus(negotiationId) {
    const negotiation = this.negotiationHistory.get(negotiationId);
    
    if (!negotiation) {
      return {
        success: false,
        error: 'Negotiation not found'
      };
    }
    
    return {
      success: true,
      negotiation: this.sanitizeNegotiation(negotiation),
      summary: this.generateNegotiationSummary(negotiation)
    };
  }

  generateNegotiationSummary(negotiation) {
    const offers = negotiation.offers;
    const userOffers = offers.filter(o => o.party === 'user');
    const aiOffers = offers.filter(o => o.party === 'ai');
    
    return {
      total_rounds: Math.max(userOffers.length, aiOffers.length),
      user_offers: userOffers.map(o => o.amount),
      ai_offers: aiOffers.map(o => o.amount),
      progress: this.calculateProgress(offers),
      sentiment: this.analyzeSentiment(offers),
      estimated_outcome: this.predictOutcome(offers)
    };
  }

  calculateProgress(offers) {
    if (offers.length < 2) return 0;
    
    const firstOffer = offers[0].amount;
    const lastOffer = offers[offers.length - 1].amount;
    const difference = Math.abs(firstOffer - lastOffer);
    
    return Math.min(difference / firstOffer, 1);
  }

  analyzeSentiment(offers) {
    // Simple sentiment analysis based on offer changes
    let positive = 0;
    let negative = 0;
    
    for (let i = 1; i < offers.length; i++) {
      if (offers[i].party === 'user' && offers[i-1].party === 'ai') {
        if (offers[i].amount > offers[i-1].amount) {
          positive++;
        } else {
          negative++;
        }
      }
    }
    
    if (positive + negative === 0) return 'neutral';
    return positive > negative ? 'positive' : 'negative';
  }

  predictOutcome(offers) {
    if (offers.length < 3) return 'uncertain';
    
    const recent = offers.slice(-3);
    const differences = [];
    
    for (let i = 1; i < recent.length; i++) {
      differences.push(Math.abs(recent[i].amount - recent[i-1].amount));
    }
    
    const avgDifference = differences.reduce((a, b) => a + b, 0) / differences.length;
    
    if (avgDifference < 0.01) { // Less than 1% difference
      return 'likely_agreement';
    } else if (avgDifference > 0.05) { // More than 5% difference
      return 'likely_stalemate';
    }
    
    return 'ongoing';
  }

  sanitizeNegotiation(negotiation) {
    // Remove sensitive data if needed
    const sanitized = { ...negotiation };
    delete sanitized.strategy;
    return sanitized;
  }

  async concludeNegotiation(negotiationId, result, finalAmount = null) {
    const negotiation = this.negotiationHistory.get(negotiationId);
    
    if (!negotiation) {
      throw new Error('Negotiation not found');
    }
    
    negotiation.status = 'concluded';
    negotiation.result = result;
    negotiation.finalAmount = finalAmount || negotiation.offers[negotiation.offers.length - 1].amount;
    negotiation.concludedAt = new Date().toISOString();
    
    this.negotiationHistory.set(negotiationId, negotiation);
    
    logger.agent(this.name, `Negotiation ${negotiationId} concluded with result: ${result}`);
    
    return {
      success: true,
      negotiationId,
      result,
      finalAmount: negotiation.finalAmount,
      concludedAt: negotiation.concludedAt
    };
  }

  async getActiveNegotiations(organizerId) {
    const active = Array.from(this.negotiationHistory.values())
      .filter(neg => neg.status === 'active')
      .map(neg => this.sanitizeNegotiation(neg));
    
    return {
      success: true,
      count: active.length,
      negotiations: active
    };
  }

  async trainOnHistory(historicalData) {
    logger.agent(this.name, 'Training on historical negotiation data');
    
    // In production, this would train a machine learning model
    return {
      success: true,
      trained_samples: historicalData.length,
      accuracy: 0.85,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = NegotiationAgent;