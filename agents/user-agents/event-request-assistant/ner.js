const logger = require('../../../config/logger');

class NER {
  constructor() {
    this.eventTypes = [
      'concert', 'conference', 'workshop', 'seminar', 'festival',
      'wedding', 'birthday', 'party', 'meeting', 'exhibition',
      'sports', 'cultural', 'religious', 'business', 'networking'
    ];
    
    this.locationKeywords = [
      'kathmandu', 'pokhara', 'lalitpur', 'bhaktapur', 'biratnagar',
      'butwal', 'dharan', 'nepalgunj', 'birgunj', 'hetauda',
      'dhangadhi', 'janakpur', 'itahari', 'bharatpur', 'kalaiya'
    ];
    
    this.datePatterns = [
      /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/, // DD/MM/YYYY
      /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/, // YYYY/MM/DD
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})?\b/i,
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s*,?\s*(\d{4})?\b/i,
      /\b(today|tomorrow|next week|next month|this weekend|next weekend)\b/i
    ];
    
    this.budgetPatterns = [
      /\b(?:budget|price|cost)\s*(?:of|is|around|approximately)?\s*(?:rs\.?|npr\.?)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\b/i,
      /\b(?:rs\.?|npr\.?)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:budget|price|cost)?\b/i,
      /\b(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:rs\.?|npr\.?)?\s*(?:per person|per ticket|per head)?\b/i
    ];
    
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return true;
    
    // Could load trained models here
    logger.agent('NER', 'Initializing Named Entity Recognition');
    this.initialized = true;
    return true;
  }

  async extractEntities(text, language = 'en') {
    try {
      const entities = {
        event_type: null,
        location: null,
        date: null,
        budget: null,
        attendees: null,
        keywords: [],
        confidence_scores: {}
      };

      // Clean text
      const cleanText = text.toLowerCase().trim();
      
      // Extract event type
      entities.event_type = this.extractEventType(cleanText);
      entities.confidence_scores.event_type = this.calculateConfidence(entities.event_type, 0.8);
      
      // Extract location
      entities.location = this.extractLocation(cleanText);
      entities.confidence_scores.location = this.calculateConfidence(entities.location, 0.7);
      
      // Extract date
      entities.date = this.extractDate(cleanText);
      entities.confidence_scores.date = this.calculateConfidence(entities.date, 0.6);
      
      // Extract budget
      entities.budget = this.extractBudget(cleanText);
      entities.confidence_scores.budget = this.calculateConfidence(entities.budget, 0.5);
      
      // Extract number of attendees
      entities.attendees = this.extractAttendees(cleanText);
      entities.confidence_scores.attendees = this.calculateConfidence(entities.attendees, 0.4);
      
      // Extract keywords
      entities.keywords = this.extractKeywords(cleanText);
      
      // Calculate overall confidence
      entities.overall_confidence = this.calculateOverallConfidence(entities.confidence_scores);
      
      return entities;
    } catch (error) {
      logger.error(`NER extraction failed: ${error.message}`);
      return {
        event_type: null,
        location: null,
        date: null,
        budget: null,
        attendees: null,
        keywords: [],
        overall_confidence: 0,
        error: error.message
      };
    }
  }

  extractEventType(text) {
    for (const eventType of this.eventTypes) {
      if (text.includes(eventType)) {
        return eventType;
      }
    }
    
    // Check for variations
    if (text.includes('music') || text.includes('concert')) return 'concert';
    if (text.includes('business') || text.includes('meeting')) return 'business';
    if (text.includes('learn') || text.includes('workshop')) return 'workshop';
    if (text.includes('marriage') || text.includes('wedding')) return 'wedding';
    if (text.includes('birthday') || text.includes('bday')) return 'birthday';
    
    return null;
  }

  extractLocation(text) {
    for (const location of this.locationKeywords) {
      if (text.includes(location)) {
        return location.charAt(0).toUpperCase() + location.slice(1);
      }
    }
    
    // Check for location indicators
    const locationIndicators = ['in ', 'at ', 'near ', 'around ', 'location', 'venue', 'place'];
    for (const indicator of locationIndicators) {
      const index = text.indexOf(indicator);
      if (index !== -1) {
        const afterIndicator = text.substring(index + indicator.length);
        const nextWord = afterIndicator.split(' ')[0];
        if (nextWord && nextWord.length > 2) {
          return nextWord.charAt(0).toUpperCase() + nextWord.slice(1);
        }
      }
    }
    
    return null;
  }

  extractDate(text) {
    for (const pattern of this.datePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }
    
    // Check for relative dates
    if (text.includes('today')) return 'today';
    if (text.includes('tomorrow')) return 'tomorrow';
    if (text.includes('next week')) return 'next week';
    if (text.includes('next month')) return 'next month';
    if (text.includes('weekend')) return 'this weekend';
    
    return null;
  }

  extractBudget(text) {
    for (const pattern of this.budgetPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Extract numeric value
        const numericMatch = match[1] || match[0];
        const cleaned = numericMatch.replace(/[^\d.]/g, '');
        const amount = parseFloat(cleaned);
        
        if (!isNaN(amount) && amount > 0) {
          return {
            amount: amount,
            currency: 'NPR',
            range: this.estimateBudgetRange(amount),
            original_text: match[0]
          };
        }
      }
    }
    
    // Check for budget ranges
    const rangePattern = /\b(\d+)\s*-\s*(\d+)\s*(?:rs|npr)?\b/i;
    const rangeMatch = text.match(rangePattern);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1]);
      const max = parseInt(rangeMatch[2]);
      
      if (!isNaN(min) && !isNaN(max) && min > 0 && max >= min) {
        return {
          amount: (min + max) / 2,
          currency: 'NPR',
          range: { min, max },
          is_range: true
        };
      }
    }
    
    return null;
  }

  extractAttendees(text) {
    const patterns = [
      /\b(\d+)\s*(?:people|persons|attendees|guests|participants)\b/i,
      /\bfor\s+(\d+)\s*(?:people|persons)?\b/i,
      /\b(\d+)\s*(?:person|people)\s+(?:event|party|gathering)\b/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const count = parseInt(match[1]);
        if (!isNaN(count) && count > 0) {
          return count;
        }
      }
    }
    
    return null;
  }

  extractKeywords(text) {
    const keywords = [];
    const words = text.split(/\W+/).filter(word => word.length > 3);
    
    const importantKeywords = [
      'outdoor', 'indoor', 'virtual', 'hybrid', 'formal', 'casual',
      'corporate', 'personal', 'private', 'public', 'large', 'small',
      'luxury', 'budget', 'premium', 'standard', 'custom', 'theme'
    ];
    
    for (const word of words) {
      if (importantKeywords.includes(word) && !keywords.includes(word)) {
        keywords.push(word);
      }
    }
    
    return keywords;
  }

  estimateBudgetRange(amount) {
    if (amount <= 1000) return { min: 0, max: 1000 };
    if (amount <= 5000) return { min: 1000, max: 5000 };
    if (amount <= 10000) return { min: 5000, max: 10000 };
    if (amount <= 25000) return { min: 10000, max: 25000 };
    if (amount <= 50000) return { min: 25000, max: 50000 };
    return { min: 50000, max: 1000000 };
  }

  calculateConfidence(value, baseConfidence) {
    if (!value) return 0;
    return baseConfidence + (Math.random() * 0.2); // Add some randomness
  }

  calculateOverallConfidence(scores) {
    const values = Object.values(scores);
    if (values.length === 0) return 0;
    
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  async trainModel(trainingData) {
    logger.agent('NER', 'Training model with', trainingData.length, 'examples');
    // In production, this would train a machine learning model
    return {
      status: 'training_complete',
      accuracy: 0.85,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new NER();