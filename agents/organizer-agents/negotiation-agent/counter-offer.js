const logger = require('../../../config/logger');
const axios = require('axios');

class CounterOffer {
  constructor() {
    // Initialize with Nepal market data
    this.marketData = {
      average_prices_npr: {
        'wedding': 500000,
        'conference': 150000,
        'birthday': 75000,
        'corporate': 200000,
        'party': 50000,
        'workshop': 80000,
        'seminar': 100000,
        'festival': 300000,
        'graduation': 60000,
        'engagement': 300000,
        'general': 100000
      },
      seasonal_multipliers: {
        'wedding_season': 1.3,
        'festival_season': 1.2,
        'off_season': 0.8,
        'normal': 1.0
      },
      location_multipliers: {
        'kathmandu': 1.3,
        'lalitpur': 1.2,
        'bhaktapur': 1.2,
        'pokhara': 1.1,
        'chitwan': 1.0,
        'biratnagar': 0.9,
        'default': 1.0
      }
    };

    // Event type normalization mapping
    this.eventTypeMap = {
      'wedding': 'wedding',
      'weddings': 'wedding',
      'marriage': 'wedding',
      'birthday': 'birthday',
      'birthday_party': 'birthday',
      'bday': 'birthday',
      'corporate': 'corporate',
      'corporate_event': 'corporate',
      'business': 'corporate',
      'conference': 'conference',
      'business_conference': 'conference',
      'seminar': 'seminar',
      'workshop': 'workshop',
      'party': 'party',
      'celebration': 'party',
      'festival': 'festival',
      'fest': 'festival',
      'graduation': 'graduation',
      'grad': 'graduation',
      'engagement': 'engagement',
      'general': 'general'
    };

    this.BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';
  }

  // Normalize event type
  normalizeEventType(eventType) {
    if (!eventType) return 'general';
    const lowerType = eventType.toLowerCase().trim();
    return this.eventTypeMap[lowerType] || 'general';
  }

  // Calculate counter offer
  calculateEventRequestCounter(userOffer, organizerOffer, eventType, location) {
    try {
      const normalizedType = this.normalizeEventType(eventType);
      
      // Get market average
      const marketAvg = this.marketData.average_prices_npr[normalizedType] || 100000;
      
      // Get location multiplier
      let locationMultiplier = 1.0;
      if (location) {
        const locationLower = location.toLowerCase();
        for (const [loc, mult] of Object.entries(this.marketData.location_multipliers)) {
          if (locationLower.includes(loc)) {
            locationMultiplier = mult;
            break;
          }
        }
      }
      
      // Get season multiplier
      const season = this.getCurrentSeason();
      const seasonMultiplier = this.marketData.seasonal_multipliers[season];
      
      // Calculate adjusted market price
      const adjustedMarketPrice = Math.round(marketAvg * locationMultiplier * seasonMultiplier);
      
      // Calculate gaps
      const gapFromOrganizer = Math.abs(userOffer - organizerOffer);
      const gapFromMarket = Math.abs(userOffer - adjustedMarketPrice);
      
      logger.debug(`Negotiation calc: Type=${normalizedType}, Market=${adjustedMarketPrice}, User=${userOffer}, Org=${organizerOffer}`);

      // Rule 1: If user offer is within 20% of organizer offer, meet in middle
      if (gapFromOrganizer / organizerOffer < 0.2) {
        const middle = (userOffer + organizerOffer) / 2;
        return {
          offer: Math.round(middle),
          concessionRate: (organizerOffer - middle) / organizerOffer,
          reasoning: `Meeting halfway between your offer (NPR ${userOffer.toLocaleString()}) and organizer's proposal (NPR ${organizerOffer.toLocaleString()}).`,
          finalOffer: false,
          marketPrice: adjustedMarketPrice
        };
      }
      
      // Rule 2: If user offer is close to market price, accept with small adjustment
      if (gapFromMarket / adjustedMarketPrice < 0.15) {
        const adjustedOffer = userOffer * 0.98; // 2% adjustment
        return {
          offer: Math.round(adjustedOffer),
          concessionRate: 0.02,
          reasoning: `Your offer is close to market rate (NPR ${adjustedMarketPrice.toLocaleString()}) for ${normalizedType} in ${location || 'your area'}. Accepting with minor adjustment.`,
          finalOffer: true,
          marketPrice: adjustedMarketPrice
        };
      }
      
      // Rule 3: Make standard concession (10-25% of the gap)
      const concessionPercent = 0.15 + (Math.random() * 0.1);
      const concession = gapFromOrganizer * concessionPercent;
      let newOffer = organizerOffer - concession;
      
      // Don't go below 70% of market price or above 130%
      const minPrice = adjustedMarketPrice * 0.7;
      const maxPrice = adjustedMarketPrice * 1.3;
      let finalOffer = Math.max(newOffer, minPrice);
      finalOffer = Math.min(finalOffer, maxPrice);
      
      // Ensure we're making progress
      if (userOffer < finalOffer && userOffer < organizerOffer) {
        finalOffer = Math.min(finalOffer, userOffer * 1.15); // Don't increase more than 15%
      }
      
      const isFinal = (concession / organizerOffer) >= 0.25 || 
                      Math.abs(finalOffer - userOffer) / userOffer < 0.05;
      
      return {
        offer: Math.round(finalOffer),
        concessionRate: concession / organizerOffer,
        reasoning: `Considering ${normalizedType} in ${location || 'your area'}. Market price is NPR ${adjustedMarketPrice.toLocaleString()}. Offering ${Math.round(concessionPercent * 100)}% concession.`,
        finalOffer: isFinal,
        marketPrice: adjustedMarketPrice
      };
    } catch (error) {
      logger.error('Error in calculateEventRequestCounter:', error);
      // Fallback calculation
      const fallbackOffer = Math.round((userOffer + organizerOffer) / 2);
      return {
        offer: fallbackOffer,
        concessionRate: 0.1,
        reasoning: 'Based on initial discussion, here\'s a balanced counter-offer.',
        finalOffer: false,
        marketPrice: null
      };
    }
  }

  getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    
    if (month >= 11 || month <= 2) {
      return 'wedding_season';
    } else if (month >= 9 && month <= 10) {
      return 'festival_season';
    } else if (month >= 6 && month <= 8) {
      return 'off_season';
    }
    return 'normal';
  }

  getEventTypePriceRecommendation(eventType, location, guestCount = 100) {
    const normalizedType = this.normalizeEventType(eventType);
    const basePrice = this.marketData.average_prices_npr[normalizedType] || 100000;
    
    let locationMultiplier = 1.0;
    if (location) {
      const locationLower = location.toLowerCase();
      for (const [loc, mult] of Object.entries(this.marketData.location_multipliers)) {
        if (locationLower.includes(loc)) {
          locationMultiplier = mult;
          break;
        }
      }
    }
    
    const seasonMultiplier = this.marketData.seasonal_multipliers[this.getCurrentSeason()];
    const estimatedPrice = Math.round(basePrice * locationMultiplier * seasonMultiplier);
    
    return {
      eventType: normalizedType,
      location,
      basePrice: Math.round(basePrice),
      locationMultiplier,
      season: this.getCurrentSeason(),
      seasonMultiplier,
      estimatedPrice,
      perPerson: Math.round(estimatedPrice / guestCount),
      recommendations: this.getPriceRecommendations(normalizedType, estimatedPrice)
    };
  }

  getPriceRecommendations(eventType, estimatedPrice) {
    const recommendations = [];
    
    switch(eventType) {
      case 'wedding':
        recommendations.push('Wedding season (Nov-Feb) prices are 30% higher');
        recommendations.push('Consider weekday weddings for 20% discount');
        recommendations.push('Package deals available for 100+ guests');
        break;
      case 'conference':
        recommendations.push('Corporate rates available for multi-day events');
        recommendations.push('AV equipment included in base price');
        recommendations.push('Early bird discounts for bookings 3+ months ahead');
        break;
      case 'birthday':
        recommendations.push('Themed decorations available at extra cost');
        recommendations.push('Catering packages starting from NPR 500 per person');
        recommendations.push('Weekday bookings get 15% off');
        break;
      case 'corporate':
        recommendations.push('Annual contracts get preferred pricing');
        recommendations.push('Team building activities can be customized');
        break;
      default:
        recommendations.push('Ask about seasonal discounts');
        recommendations.push('Group booking rates available');
    }
    
    return recommendations;
  }

  validateOffer(userOffer, eventType, location) {
    const recommendation = this.getEventTypePriceRecommendation(eventType, location);
    const minReasonable = Math.round(recommendation.estimatedPrice * 0.6);
    const maxReasonable = Math.round(recommendation.estimatedPrice * 1.5);
    
    let suggestion = '';
    if (userOffer < minReasonable) {
      suggestion = `Your offer is below market rate. Consider increasing budget to at least NPR ${minReasonable.toLocaleString()}`;
    } else if (userOffer > maxReasonable) {
      suggestion = `Your offer is above market rate. You can negotiate down to NPR ${maxReasonable.toLocaleString()}`;
    } else {
      suggestion = 'Your offer is within reasonable range';
    }
    
    return {
      userOffer,
      estimatedMarketPrice: recommendation.estimatedPrice,
      isReasonable: userOffer >= minReasonable && userOffer <= maxReasonable,
      minReasonable,
      maxReasonable,
      suggestion
    };
  }

  // NEW: Update market data from backend
  async syncMarketDataFromBackend() {
    try {
      const response = await axios.get(`${this.BACKEND_URL}/api/admin/market-prices`, {
        timeout: 5000
      });
      
      if (response.data && response.data.success) {
        this.marketData = {
          ...this.marketData,
          ...response.data.data
        };
        logger.success('Market data synced from backend');
      }
    } catch (error) {
      logger.warn('Could not sync market data from backend, using defaults:', error.message);
    }
  }

  // NEW: Get organizer-specific pricing if available
  async getOrganizerPricing(organizerId, eventType) {
    try {
      const response = await axios.get(
        `${this.BACKEND_URL}/api/organizers/${organizerId}/pricing/${eventType}`,
        { timeout: 3000 }
      );
      return response.data;
    } catch (error) {
      return null; // Fallback to market data
    }
  }
}

module.exports = CounterOffer;