const logger = require('../../../config/logger');

class CounterOffer {
  constructor() {
    // Updated for Nepal prices in NPR
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
        'engagement': 300000
      },
      // Nepal event seasons (multipliers for pricing)
      seasonal_multipliers: {
        'wedding_season': 1.3,      // Nov-Feb
        'festival_season': 1.2,     // Sep-Oct (Dashain, Tihar)
        'off_season': 0.8,          // Jun-Aug (monsoon)
        'normal': 1.0
      },
      // Location adjustments (Kathmandu most expensive)
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
  }

  // ✅ UPDATED: Event request specific calculation
  calculateEventRequestCounter(userOffer, organizerOffer, eventType, location) {
    // Get market average for this event type
    const marketAvg = this.marketData.average_prices_npr[eventType] || 100000;
    
    // Get location multiplier
    const locKey = location ? Object.keys(this.marketData.location_multipliers)
      .find(loc => location.toLowerCase().includes(loc)) : 'default';
    const locationMultiplier = this.marketData.location_multipliers[locKey] || 1.0;
    
    // Get season multiplier
    const season = this.getCurrentSeason();
    const seasonMultiplier = this.marketData.seasonal_multipliers[season];
    
    // Calculate adjusted market price
    const adjustedMarketPrice = marketAvg * locationMultiplier * seasonMultiplier;
    
    // Calculate gaps
    const gapFromOrganizer = Math.abs(userOffer - organizerOffer);
    const gapFromMarket = Math.abs(userOffer - adjustedMarketPrice);
    
    // Rule 1: If user offer is within 20% of organizer offer, meet in middle
    if (gapFromOrganizer / organizerOffer < 0.2) {
      const middle = (userOffer + organizerOffer) / 2;
      return {
        offer: Math.round(middle),
        concessionRate: (organizerOffer - middle) / organizerOffer,
        reasoning: `Meeting halfway between your offer and organizer's proposal.`,
        finalOffer: false
      };
    }
    
    // Rule 2: If user offer is close to market price, accept with small adjustment
    if (gapFromMarket / adjustedMarketPrice < 0.15) {
      const adjustedOffer = userOffer * 0.98; // 2% adjustment
      return {
        offer: Math.round(adjustedOffer),
        concessionRate: 0.02,
        reasoning: `Close to market rate for ${eventType} in ${location}. Accepting with minor adjustment.`,
        finalOffer: true
      };
    }
    
    // Rule 3: Make standard concession (10-25% of the gap)
    const concessionPercent = 0.15 + (Math.random() * 0.1); // 15-25%
    const concession = gapFromOrganizer * concessionPercent;
    const newOffer = organizerOffer - concession;
    
    // Don't go below 70% of market price
    const minPrice = adjustedMarketPrice * 0.7;
    const finalOffer = Math.max(newOffer, minPrice);
    
    return {
      offer: Math.round(finalOffer),
      concessionRate: concession / organizerOffer,
      reasoning: `Considering ${eventType} in ${location}. Offering ${Math.round(concessionPercent * 100)}% concession.`,
      finalOffer: (concession / organizerOffer) >= 0.25 // Final if concession >= 25%
    };
  }

  // ✅ NEW: Get current Nepal season
  getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    
    // Nepal seasons
    if (month >= 11 || month <= 2) {
      return 'wedding_season';      // Nov-Feb: Wedding season
    } else if (month >= 9 && month <= 10) {
      return 'festival_season';     // Sep-Oct: Dashain, Tihar
    } else if (month >= 6 && month <= 8) {
      return 'off_season';          // Jun-Aug: Monsoon
    }
    return 'normal';
  }

  // ✅ NEW: Get price recommendations for event type
  getEventTypePriceRecommendation(eventType, location, guestCount = 100) {
    const basePrice = this.marketData.average_prices_npr[eventType] || 100000;
    const locKey = location ? Object.keys(this.marketData.location_multipliers)
      .find(loc => location.toLowerCase().includes(loc)) : 'default';
    const locationMultiplier = this.marketData.location_multipliers[locKey] || 1.0;
    const seasonMultiplier = this.marketData.seasonal_multipliers[this.getCurrentSeason()];
    
    const estimatedPrice = basePrice * locationMultiplier * seasonMultiplier;
    
    return {
      eventType,
      location,
      basePrice: Math.round(basePrice),
      locationMultiplier,
      season: this.getCurrentSeason(),
      seasonMultiplier,
      estimatedPrice: Math.round(estimatedPrice),
      perPerson: Math.round(estimatedPrice / guestCount),
      recommendations: this.getPriceRecommendations(eventType, estimatedPrice)
    };
  }

  getPriceRecommendations(eventType, estimatedPrice) {
    const recommendations = [];
    
    if (eventType === 'wedding') {
      recommendations.push('Wedding season (Nov-Feb) prices are 30% higher');
      recommendations.push('Consider weekday weddings for 20% discount');
      recommendations.push('Package deals available for 100+ guests');
    } else if (eventType === 'conference') {
      recommendations.push('Corporate rates available for multi-day events');
      recommendations.push('AV equipment included in base price');
    } else if (eventType === 'birthday') {
      recommendations.push('Themed decorations available at extra cost');
      recommendations.push('Catering packages starting from NPR 500 per person');
    }
    
    return recommendations;
  }

  // ✅ NEW: Validate if user offer is reasonable
  validateOffer(userOffer, eventType, location) {
    const recommendation = this.getEventTypePriceRecommendation(eventType, location);
    const minReasonable = recommendation.estimatedPrice * 0.6;
    const maxReasonable = recommendation.estimatedPrice * 1.5;
    
    return {
      userOffer,
      estimatedMarketPrice: recommendation.estimatedPrice,
      isReasonable: userOffer >= minReasonable && userOffer <= maxReasonable,
      minReasonable: Math.round(minReasonable),
      maxReasonable: Math.round(maxReasonable),
      suggestion: userOffer < minReasonable ? 
        `Consider increasing budget to at least NPR ${Math.round(minReasonable)}` :
        userOffer > maxReasonable ?
        `Negotiate for better rate, market max is NPR ${Math.round(maxReasonable)}` :
        'Offer is within reasonable range'
    };
  }
}

module.exports = CounterOffer;