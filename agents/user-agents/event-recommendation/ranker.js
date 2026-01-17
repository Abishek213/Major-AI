class EventRanker {
  constructor() {
    this.weights = {
      category_match: 0.3,
      price_match: 0.25,
      location_match: 0.2,
      popularity: 0.15,
      recency: 0.1
    };
  }
  
  rankEvents(events, userPreferences) {
    return events.map(event => {
      let score = 0;
      const factors = {};
      
      // Category match
      if (userPreferences.preferences.categories && event.category) {
        const categoryMatch = userPreferences.preferences.categories.includes(event.category) ? 1 : 0;
        score += categoryMatch * this.weights.category_match;
        factors.category_match = categoryMatch;
      }
      
      // Price match
      if (userPreferences.preferences.price_range && event.price) {
        const { min, max } = userPreferences.preferences.price_range;
        const priceMatch = this.calculatePriceMatch(event.price, min, max);
        score += priceMatch * this.weights.price_match;
        factors.price_match = priceMatch;
      }
      
      // Location match
      if (userPreferences.preferences.locations && event.location) {
        const locationMatch = this.calculateLocationMatch(event.location, userPreferences.preferences.locations);
        score += locationMatch * this.weights.location_match;
        factors.location_match = locationMatch;
      }
      
      // Popularity (registered count vs capacity)
      if (event.registered_count && event.capacity) {
        const popularity = event.registered_count / event.capacity;
        score += popularity * this.weights.popularity;
        factors.popularity = popularity;
      }
      
      // Recency (closer dates get higher score)
      if (event.date) {
        const daysUntilEvent = this.daysUntil(event.date);
        const recency = Math.max(0, 1 - (daysUntilEvent / 90)); // 90-day window
        score += recency * this.weights.recency;
        factors.recency = recency;
      }
      
      // Boost for events similar to user's history
      if (userPreferences.history) {
        const historyBoost = this.calculateHistoryBoost(event, userPreferences.history);
        score += historyBoost * 0.1; // Additional 10% boost
        factors.history_boost = historyBoost;
      }
      
      // Ensure score is between 0 and 1
      score = Math.min(Math.max(score, 0), 1);
      
      return {
        ...event,
        final_score: score,
        scoring_factors: factors
      };
    }).sort((a, b) => b.final_score - a.final_score);
  }
  
  calculatePriceMatch(price, min, max) {
    if (price >= min && price <= max) return 1.0;
    if (price < min) return 0.7; // Cheaper than preferred
    if (price > max) {
      // Calculate how much more expensive
      const overage = (price - max) / max;
      return Math.max(0, 1 - overage);
    }
    return 0.5;
  }
  
  calculateLocationMatch(eventLocation, preferredLocations) {
    const eventLocLower = eventLocation.toLowerCase();
    
    for (const prefLocation of preferredLocations) {
      if (eventLocLower.includes(prefLocation.toLowerCase())) {
        return 1.0;
      }
    }
    
    // Partial match check
    for (const prefLocation of preferredLocations) {
      const prefWords = prefLocation.toLowerCase().split(' ');
      const eventWords = eventLocLower.split(' ');
      
      for (const prefWord of prefWords) {
        for (const eventWord of eventWords) {
          if (prefWord.length > 3 && eventWord.includes(prefWord)) {
            return 0.7;
          }
        }
      }
    }
    
    return 0.3; // Default low score for no match
  }
  
  daysUntil(dateString) {
    const eventDate = new Date(dateString);
    const today = new Date();
    const diffTime = eventDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  calculateHistoryBoost(event, history) {
    let boost = 0;
    
    for (const historyItem of history) {
      // Boost for same category
      if (historyItem.type === event.category) {
        boost += 0.3;
      }
      
      // Boost for high ratings
      if (historyItem.rating >= 4) {
        boost += 0.2;
      }
    }
    
    return Math.min(boost, 1.0);
  }
}

module.exports = new EventRanker();