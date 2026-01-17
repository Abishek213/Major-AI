const logger = require('../../../config/logger');

class Matcher {
  constructor() {
    this.eventDatabase = null;
    this.categories = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return true;
    
    // Simulate loading event database
    this.eventDatabase = await this.loadEventDatabase();
    this.categories = await this.loadCategories();
    
    this.initialized = true;
    logger.agent('Matcher', 'Initialized with', this.eventDatabase.length, 'events');
    return true;
  }

  async loadEventDatabase() {
    // In production, this would load from MongoDB
    return [
      {
        id: 'event_001',
        name: 'Tech Conference 2024',
        type: 'conference',
        category: 'technology',
        location: 'Kathmandu',
        date: '2024-06-15',
        price: 2500,
        tags: ['technology', 'business', 'networking']
      },
      {
        id: 'event_002',
        name: 'Jazz Music Festival',
        type: 'concert',
        category: 'music',
        location: 'Pokhara',
        date: '2024-07-20',
        price: 1500,
        tags: ['music', 'entertainment', 'festival']
      },
      {
        id: 'event_003',
        name: 'Business Workshop',
        type: 'workshop',
        category: 'business',
        location: 'Kathmandu',
        date: '2024-05-30',
        price: 1200,
        tags: ['business', 'workshop', 'entrepreneurship']
      },
      {
        id: 'event_004',
        name: 'Food Festival',
        type: 'festival',
        category: 'food',
        location: 'Lalitpur',
        date: '2024-08-10',
        price: 800,
        tags: ['food', 'festival', 'cultural']
      },
      {
        id: 'event_005',
        name: 'Wedding Expo',
        type: 'exhibition',
        category: 'wedding',
        location: 'Biratnagar',
        date: '2024-09-05',
        price: 500,
        tags: ['wedding', 'exhibition', 'planning']
      }
    ];
  }

  async loadCategories() {
    return [
      { id: 'music', name: 'Music', subcategories: ['concert', 'festival'] },
      { id: 'business', name: 'Business', subcategories: ['conference', 'workshop', 'seminar'] },
      { id: 'social', name: 'Social', subcategories: ['wedding', 'birthday', 'party'] },
      { id: 'cultural', name: 'Cultural', subcategories: ['festival', 'exhibition'] },
      { id: 'sports', name: 'Sports', subcategories: ['tournament', 'match'] }
    ];
  }

  async findMatches(entities) {
    await this.initialize();
    
    const exactMatches = [];
    const similarMatches = [];
    
    // Score each event based on entity matching
    for (const event of this.eventDatabase) {
      const score = this.calculateMatchScore(event, entities);
      
      if (score >= 0.8) {
        exactMatches.push({
          event: event,
          match_score: score,
          match_reasons: this.getMatchReasons(event, entities)
        });
      } else if (score >= 0.5) {
        similarMatches.push({
          event: event,
          match_score: score,
          match_reasons: this.getMatchReasons(event, entities)
        });
      }
    }
    
    // Sort by match score
    exactMatches.sort((a, b) => b.match_score - a.match_score);
    similarMatches.sort((a, b) => b.match_score - a.match_score);
    
    // Find category matches if no direct matches
    const categoryMatches = this.findCategoryMatches(entities);
    
    return {
      exact_matches: exactMatches,
      similar_matches: similarMatches,
      category_matches: categoryMatches,
      total_found: exactMatches.length + similarMatches.length,
      match_quality: this.evaluateMatchQuality(exactMatches, similarMatches)
    };
  }

  calculateMatchScore(event, entities) {
    let score = 0;
    let totalPossible = 0;
    
    // Event type match (40% weight)
    if (entities.event_type) {
      totalPossible += 40;
      if (event.type === entities.event_type) {
        score += 40;
      } else if (this.areRelatedTypes(event.type, entities.event_type)) {
        score += 20;
      }
    }
    
    // Location match (30% weight)
    if (entities.location) {
      totalPossible += 30;
      if (event.location.toLowerCase().includes(entities.location.toLowerCase())) {
        score += 30;
      } else if (this.areNearbyLocations(event.location, entities.location)) {
        score += 15;
      }
    }
    
    // Date match (20% weight)
    if (entities.date) {
      totalPossible += 20;
      // Simple date matching - in production would parse and compare dates
      if (this.isDateCompatible(event.date, entities.date)) {
        score += 20;
      }
    }
    
    // Budget match (10% weight)
    if (entities.budget && entities.budget.amount) {
      totalPossible += 10;
      if (event.price <= entities.budget.amount * 1.5) { // Within 150% of budget
        score += 10;
      } else if (event.price <= entities.budget.amount * 2) { // Within 200% of budget
        score += 5;
      }
    }
    
    // If no entities provided, give baseline score
    if (totalPossible === 0) {
      return 0.3; // Baseline for popular events
    }
    
    return score / totalPossible;
  }

  areRelatedTypes(type1, type2) {
    const relatedGroups = {
      'concert': ['music', 'festival'],
      'conference': ['workshop', 'seminar', 'business'],
      'workshop': ['seminar', 'conference'],
      'wedding': ['party', 'social'],
      'birthday': ['party', 'social']
    };
    
    return (relatedGroups[type1] && relatedGroups[type1].includes(type2)) ||
           (relatedGroups[type2] && relatedGroups[type2].includes(type1));
  }

  areNearbyLocations(loc1, loc2) {
    const locationGroups = {
      'kathmandu': ['lalitpur', 'bhaktapur'],
      'pokhara': [],
      'biratnagar': []
    };
    
    const loc1Lower = loc1.toLowerCase();
    const loc2Lower = loc2.toLowerCase();
    
    if (locationGroups[loc1Lower] && locationGroups[loc1Lower].includes(loc2Lower)) {
      return true;
    }
    
    return false;
  }

  isDateCompatible(eventDate, requestedDate) {
    // Simple date compatibility check
    // In production, would parse dates and check ranges
    if (requestedDate === 'next month' || requestedDate === 'next week') {
      return true; // Accept any future date for vague requests
    }
    
    return true; // Default to compatible for now
  }

  getMatchReasons(event, entities) {
    const reasons = [];
    
    if (entities.event_type && event.type === entities.event_type) {
      reasons.push(`Event type: ${entities.event_type}`);
    }
    
    if (entities.location && event.location.toLowerCase().includes(entities.location.toLowerCase())) {
      reasons.push(`Location: ${entities.location}`);
    }
    
    if (entities.budget && entities.budget.amount && event.price <= entities.budget.amount * 1.5) {
      reasons.push(`Within budget: NPR ${event.price}`);
    }
    
    if (reasons.length === 0) {
      reasons.push('Popular event');
    }
    
    return reasons;
  }

  findCategoryMatches(entities) {
    if (!entities.event_type) return [];
    
    const categoryMatches = [];
    
    for (const category of this.categories) {
      if (category.subcategories.includes(entities.event_type)) {
        categoryMatches.push({
          category: category.name,
          category_id: category.id,
          events_in_category: this.countEventsInCategory(category.id),
          match_reason: `Matches ${entities.event_type} category`
        });
      }
    }
    
    return categoryMatches;
  }

  countEventsInCategory(categoryId) {
    return this.eventDatabase.filter(event => {
      // Simple category matching
      if (categoryId === 'music' && ['concert', 'festival'].includes(event.type)) return true;
      if (categoryId === 'business' && ['conference', 'workshop', 'seminar'].includes(event.type)) return true;
      if (categoryId === 'social' && ['wedding', 'birthday', 'party'].includes(event.type)) return true;
      return false;
    }).length;
  }

  evaluateMatchQuality(exactMatches, similarMatches) {
    if (exactMatches.length >= 3) return 'excellent';
    if (exactMatches.length >= 1) return 'good';
    if (similarMatches.length >= 3) return 'fair';
    if (similarMatches.length >= 1) return 'limited';
    return 'none';
  }

  async findSimilarEvents(eventId, limit = 5) {
    await this.initialize();
    
    const targetEvent = this.eventDatabase.find(e => e.id === eventId);
    if (!targetEvent) return [];
    
    const similarEvents = this.eventDatabase
      .filter(e => e.id !== eventId)
      .map(event => ({
        event,
        similarity: this.calculateEventSimilarity(targetEvent, event)
      }))
      .filter(result => result.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(result => ({
        ...result.event,
        similarity_score: result.similarity
      }));
    
    return similarEvents;
  }

  calculateEventSimilarity(event1, event2) {
    let score = 0;
    
    // Same type
    if (event1.type === event2.type) score += 0.4;
    
    // Same category
    if (event1.category === event2.category) score += 0.3;
    
    // Similar location
    if (event1.location === event2.location) score += 0.2;
    
    // Similar price (within 25%)
    const priceRatio = Math.min(event1.price, event2.price) / Math.max(event1.price, event2.price);
    if (priceRatio > 0.75) score += 0.1;
    
    return score;
  }
}

module.exports = new Matcher();