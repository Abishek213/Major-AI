const logger = require('../../../config/logger');
const ranker = require('./ranker');

class EventRecommendationAgent {
  constructor() {
    this.name = 'event-recommendation-agent';
    this.version = '1.0.0';
    this.logger = logger;
  }
  
  async initialize() {
    this.logger.agent(this.name, 'Initializing agent');
    return true;
  }
  
  async getRecommendations(userId, limit = 10) {
    try {
      this.logger.agent(this.name, 'Getting recommendations for user:', userId);
      
      // 1. Get user preferences (in production, from database)
      const userPreferences = await this.getUserPreferences(userId);
      
      // 2. Get available events (in production, from database)
      const availableEvents = await this.getAvailableEvents();
      
      // 3. Rank events based on user preferences
      const rankedEvents = await this.rankEvents(userPreferences, availableEvents, limit);
      
      // 4. Format response
      const recommendations = this.formatRecommendations(rankedEvents, userId);
      
      this.logger.success(`Generated ${recommendations.length} recommendations for user ${userId}`);
      
      return recommendations;
    } catch (error) {
      this.logger.error(`Error in getRecommendations: ${error.message}`);
      
      // Fallback: Return popular events
      return await this.getFallbackRecommendations(limit);
    }
  }
  
  async getUserPreferences(userId) {
    // Mock user preferences - in production, fetch from database
    return {
      userId,
      preferences: {
        categories: ['music', 'conference', 'workshop'],
        price_range: { min: 0, max: 5000 },
        locations: ['Kathmandu', 'Pokhara'],
        interests: ['technology', 'business', 'entertainment']
      },
      history: [
        { eventId: 'event1', type: 'conference', rating: 4 },
        { eventId: 'event2', type: 'workshop', rating: 5 }
      ]
    };
  }
  
  async getAvailableEvents() {
    // Mock events - in production, fetch from database
    return [
      {
        _id: 'event001',
        event_name: 'Tech Conference 2024',
        description: 'Annual technology conference featuring industry leaders',
        category: 'conference',
        price: 2500,
        location: 'Kathmandu',
        date: '2024-06-15',
        tags: ['technology', 'business', 'networking'],
        registered_count: 150,
        capacity: 300
      },
      {
        _id: 'event002',
        event_name: 'Jazz Music Festival',
        description: 'Weekend jazz festival with international artists',
        category: 'music',
        price: 1500,
        location: 'Pokhara',
        date: '2024-07-20',
        tags: ['music', 'entertainment', 'festival'],
        registered_count: 450,
        capacity: 500
      },
      {
        _id: 'event003',
        event_name: 'Startup Workshop',
        description: 'Hands-on workshop for aspiring entrepreneurs',
        category: 'workshop',
        price: 1200,
        location: 'Kathmandu',
        date: '2024-05-30',
        tags: ['business', 'workshop', 'entrepreneurship'],
        registered_count: 80,
        capacity: 100
      },
      {
        _id: 'event004',
        event_name: 'Food Festival',
        description: 'Culinary festival featuring local and international cuisines',
        category: 'food',
        price: 800,
        location: 'Lalitpur',
        date: '2024-08-10',
        tags: ['food', 'festival', 'cultural'],
        registered_count: 300,
        capacity: 500
      }
    ];
  }
  
  async rankEvents(userPreferences, events, limit) {
    this.logger.agent(this.name, 'Ranking events for user:', userPreferences.userId);
    
    // Use the ranker utility
    const ranked = ranker.rankEvents(events, userPreferences);
    
    // Return top N events
    return ranked.slice(0, limit);
  }
  
  formatRecommendations(rankedEvents, userId) {
    return rankedEvents.map(event => ({
      event_id: event._id,
      event_name: event.event_name,
      description: event.description,
      category: event.category,
      price: event.price,
      location: event.location,
      date: event.date,
      confidence_score: event.final_score || 0.5,
      recommendation_reason: this.generateReason(event, rankedEvents.indexOf(event) + 1),
      tags: event.tags || [],
      match_factors: event.scoring_factors || {},
      generated_for: userId,
      generated_at: new Date().toISOString()
    }));
  }
  
  generateReason(event, rank) {
    const reasons = [
      `Rank #${rank} based on your preferences`,
      `Matches your interest in ${event.tags ? event.tags[0] : event.category}`,
      `Popular event with ${event.registered_count} registrations`,
      `Located in ${event.location} which matches your preferences`,
      `Price of Rs. ${event.price} fits your budget range`
    ];
    
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
  
  async getFallbackRecommendations(limit) {
    this.logger.agent(this.name, 'Using fallback recommendations');
    
    const events = await this.getAvailableEvents();
    
    // Sort by popularity (registered_count)
    const popularEvents = events
      .sort((a, b) => b.registered_count - a.registered_count)
      .slice(0, limit);
    
    return this.formatRecommendations(popularEvents, 'fallback');
  }
  
  async trainModel() {
    this.logger.agent(this.name, 'Training recommendation model');
    // Model training logic would go here
    return { status: 'training_started', timestamp: new Date().toISOString() };
  }
}

module.exports = EventRecommendationAgent;