const logger = require('../../../config/logger');

class CounterOffer {
  constructor() {
    this.marketData = {
      average_prices: {
        'conference': 2500,
        'workshop': 1200,
        'concert': 1500,
        'festival': 800,
        'wedding': 5000,
        'birthday': 2000
      },
      seasonal_multipliers: {
        'high': 1.3,
        'medium': 1.0,
        'low': 0.7
      }
    };
  }

  calculateCounterOffer(userOffer, previousOffer, strategy, negotiationType) {
    // Calculate base counter offer
    let baseOffer;
    
    if (negotiationType === 'price') {
      baseOffer = this.calculatePriceCounterOffer(userOffer, previousOffer, strategy);
    } else if (negotiationType === 'date') {
      baseOffer = this.calculateDateCounterOffer(userOffer, previousOffer, strategy);
    } else {
      baseOffer = this.calculateGenericCounterOffer(userOffer, previousOffer, strategy);
    }
    
    // Apply market adjustments
    const adjustedOffer = this.applyMarketAdjustments(baseOffer, negotiationType);
    
    // Calculate concession rate
    const concessionRate = this.calculateConcessionRate(previousOffer, adjustedOffer);
    
    return {
      offer: adjustedOffer,
      concessionRate: concessionRate,
      reasoning: this.generateReasoning(userOffer, adjustedOffer, negotiationType, concessionRate),
      finalOffer: concessionRate >= strategy.max_concession
    };
  }

  calculatePriceCounterOffer(userOffer, previousOffer, strategy) {
    const gap = previousOffer - userOffer;
    const acceptableGap = previousOffer * strategy.initial_concession;
    
    if (gap <= 0) {
      // User offer is higher than ours (rare) - accept or slightly increase
      return userOffer * 0.95;
    }
    
    if (gap <= acceptableGap) {
      // Small gap - meet halfway
      return previousOffer - (gap * 0.5);
    }
    
    // Larger gap - make conservative concession
    const concession = Math.min(gap * 0.3, previousOffer * strategy.initial_concession);
    return previousOffer - concession;
  }

  calculateDateCounterOffer(userOffer, previousOffer, strategy) {
    // For dates, we're dealing with date strings or timestamps
    // This is simplified - in production would parse dates
    
    const gap = this.calculateDateGap(userOffer, previousOffer);
    const maxGap = 7; // 7 days max concession
    
    if (gap <= maxGap * 0.3) {
      // Small date change - accept
      return userOffer;
    }
    
    // Find middle ground
    return this.findMiddleDate(userOffer, previousOffer);
  }

  calculateGenericCounterOffer(userOffer, previousOffer, strategy) {
    // Generic counter offer for venue, terms, etc.
    const difference = Math.abs(previousOffer - userOffer);
    
    if (difference < 0.1 * previousOffer) {
      // Less than 10% difference - meet in middle
      return (previousOffer + userOffer) / 2;
    }
    
    // Larger difference - make standard concession
    const concession = previousOffer * strategy.initial_concession;
    
    if (userOffer < previousOffer) {
      return previousOffer - concession;
    } else {
      return previousOffer + concession;
    }
  }

  applyMarketAdjustments(offer, negotiationType) {
    if (negotiationType !== 'price') return offer;
    
    // Get current season
    const season = this.getCurrentSeason();
    const multiplier = this.marketData.seasonal_multipliers[season];
    
    // Adjust based on market averages if available
    const eventType = this.inferEventType(offer);
    if (eventType && this.marketData.average_prices[eventType]) {
      const marketAvg = this.marketData.average_prices[eventType];
      
      // Don't go below 70% of market average
      const minPrice = marketAvg * 0.7;
      if (offer < minPrice) {
        logger.warning(`Offer ${offer} below market minimum ${minPrice}, adjusting`);
        return Math.max(offer, minPrice);
      }
      
      // Don't go above 150% of market average without reason
      const maxPrice = marketAvg * 1.5;
      if (offer > maxPrice) {
        logger.warning(`Offer ${offer} above market maximum ${maxPrice}, adjusting`);
        return Math.min(offer, maxPrice);
      }
    }
    
    return offer * multiplier;
  }

  getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    
    // Nepal seasons: High (Oct-Nov, Mar-Apr), Medium (Dec-Feb), Low (May-Sep)
    if (month === 10 || month === 11 || month === 3 || month === 4) {
      return 'high';
    } else if (month >= 5 && month <= 9) {
      return 'low';
    } else {
      return 'medium';
    }
  }

  inferEventType(price) {
    // Infer event type based on price range
    if (price >= 4000) return 'wedding';
    if (price >= 2000) return 'conference';
    if (price >= 1200) return 'concert';
    if (price >= 800) return 'workshop';
    if (price >= 500) return 'festival';
    return 'other';
  }

  calculateConcessionRate(previousOffer, newOffer) {
    if (previousOffer === 0) return 0;
    
    const concession = Math.abs(previousOffer - newOffer);
    return concession / previousOffer;
  }

  generateReasoning(userOffer, counterOffer, negotiationType, concessionRate) {
    const reasonTemplates = {
      'price': [
        `Market rates suggest ${counterOffer} is fair for this event type.`,
        `Considering your offer of ${userOffer}, I'm offering a ${Math.round(concessionRate * 100)}% concession.`,
        `This price includes all amenities and services.`
      ],
      'date': [
        `This date accommodates venue availability.`,
        `Alternative dates may incur additional costs.`,
        `This timing aligns with optimal attendance.`
      ],
      'venue': [
        `The venue offers similar capacity and facilities.`,
        `This location has better accessibility.`,
        `Venue includes additional amenities.`
      ]
    };
    
    const templates = reasonTemplates[negotiationType] || reasonTemplates.price;
    return templates[Math.floor(Math.random() * templates.length)];
  }

  calculateDateGap(date1, date2) {
    // Simplified date gap calculation
    // In production, parse dates and calculate difference
    return Math.abs(parseInt(date1) - parseInt(date2)) || 0;
  }

  findMiddleDate(date1, date2) {
    // Simplified middle date calculation
    const d1 = parseInt(date1) || 0;
    const d2 = parseInt(date2) || 0;
    return Math.round((d1 + d2) / 2).toString();
  }

  async updateMarketData(newData) {
    this.marketData = {
      ...this.marketData,
      ...newData
    };
    
    logger.agent('CounterOffer', 'Market data updated');
    return this.marketData;
  }

  getMarketInsights() {
    return {
      average_prices: this.marketData.average_prices,
      current_season: this.getCurrentSeason(),
      seasonal_multiplier: this.marketData.seasonal_multipliers[this.getCurrentSeason()],
      recommendations: this.generateRecommendations()
    };
  }

  generateRecommendations() {
    const season = this.getCurrentSeason();
    const recommendations = [];
    
    if (season === 'high') {
      recommendations.push('High season - prices can be 30% higher');
      recommendations.push('Book venues well in advance');
    } else if (season === 'low') {
      recommendations.push('Low season - negotiate for better rates');
      recommendations.push('More venue availability');
    }
    
    return recommendations;
  }
}

module.exports = CounterOffer;