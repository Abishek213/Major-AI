const logger = require('../../../config/logger');
const NER = require('./ner');
const Matcher = require('./matcher');

class EventRequestAssistant {
  constructor() {
    this.name = 'event-request-assistant';
    this.ner = NER;
    this.matcher = Matcher;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return true;
    
    await this.ner.initialize();
    await this.matcher.initialize();
    
    this.initialized = true;
    logger.agent(this.name, 'Initialized successfully');
    return true;
  }

  async processRequest(requestText, userId, language = 'en') {
    try {
      await this.initialize();
      
      logger.agent(this.name, `Processing event request: ${requestText.substring(0, 100)}...`);
      
      // Step 1: Extract entities from request
      const entities = await this.ner.extractEntities(requestText, language);
      
      // Step 2: Match with existing events or categories
      const matches = await this.matcher.findMatches(entities);
      
      // Step 3: Generate response
      const response = this.generateResponse(entities, matches, language);
      
      // Step 4: Store request for analysis
      await this.storeRequestAnalysis(userId, requestText, entities, matches);
      
      logger.success(`Event request processed: ${entities.event_type || 'unknown'} request`);
      
      return {
        success: true,
        request_id: `req_${Date.now()}_${userId}`,
        extracted_entities: entities,
        matches: matches,
        suggestions: response.suggestions,
        next_steps: response.next_steps,
        language: language
      };
    } catch (error) {
      logger.error(`Event request processing failed: ${error.message}`);
      return {
        success: false,
        error: 'Unable to process request',
        fallback_message: this.getFallbackMessage(language)
      };
    }
  }

  generateResponse(entities, matches, language) {
    const responses = {
      'en': {
        no_matches: "I understand you're looking for an event. Could you provide more details like preferred date, location, or budget?",
        partial_matches: "Based on your request, I found some options. Would you like me to show you similar events?",
        good_matches: "Great! I found events that match your criteria. Here are my recommendations."
      },
      'ne': {
        no_matches: "म बुझ्दछु तपाईं कार्यक्रम खोज्दै हुनुहुन्छ। कृपया थप विवरण जस्तै मनपर्ने मिति, स्थान, वा बजेट प्रदान गर्नुहोस्।",
        partial_matches: "तपाईंको अनुरोधको आधारमा, मैले केही विकल्पहरू फेला पारें। के तपाईं मलाई समान कार्यक्रमहरू देखाउन चाहनुहुन्छ?",
        good_matches: "राम्रो! मैले तपाईंको मापदण्डहरूसँग मेल खाने कार्यक्रमहरू फेला पारें। यहाँ मेरो सिफारिशहरू छन्।"
      }
    };

    const langResponses = responses[language] || responses['en'];
    
    let suggestions = [];
    let next_steps = [];
    
    if (matches.exact_matches.length > 0) {
      suggestions = matches.exact_matches.slice(0, 5);
      next_steps = [
        "Browse the matched events",
        "Adjust your criteria for more options",
        "Save your preferences for future recommendations"
      ];
    } else if (matches.similar_matches.length > 0) {
      suggestions = matches.similar_matches.slice(0, 3);
      next_steps = [
        "Consider similar events",
        "Provide more specific details",
        "Adjust your budget or date range"
      ];
    } else {
      suggestions = this.generateGenericSuggestions(entities);
      next_steps = [
        "Be more specific about your needs",
        "Provide a date range",
        "Specify a budget range"
      ];
    }

    return {
      message: matches.exact_matches.length > 0 ? langResponses.good_matches : 
               matches.similar_matches.length > 0 ? langResponses.partial_matches : 
               langResponses.no_matches,
      suggestions,
      next_steps,
      match_quality: this.calculateMatchQuality(matches)
    };
  }

  generateGenericSuggestions(entities) {
    const suggestions = [];
    
    if (entities.event_type) {
      suggestions.push({
        type: 'category_browse',
        title: `Browse ${entities.event_type} events`,
        description: `Explore all ${entities.event_type} events in our catalog`
      });
    }
    
    if (entities.location) {
      suggestions.push({
        type: 'location_browse',
        title: `Events in ${entities.location}`,
        description: `Discover events happening in ${entities.location}`
      });
    }
    
    suggestions.push({
      type: 'popular',
      title: 'Popular events',
      description: 'See what others are booking'
    });
    
    return suggestions;
  }

  calculateMatchQuality(matches) {
    const totalMatches = matches.exact_matches.length + matches.similar_matches.length;
    
    if (matches.exact_matches.length >= 3) return 'excellent';
    if (matches.exact_matches.length >= 1) return 'good';
    if (matches.similar_matches.length >= 3) return 'fair';
    if (matches.similar_matches.length >= 1) return 'poor';
    return 'none';
  }

  async storeRequestAnalysis(userId, requestText, entities, matches) {
    // In production, store in database
    const analysis = {
      userId,
      requestText,
      entities,
      matches_count: {
        exact: matches.exact_matches.length,
        similar: matches.similar_matches.length
      },
      timestamp: new Date().toISOString(),
      processed_by: this.name
    };
    
    logger.agent(this.name, `Stored analysis for user ${userId}`);
    return analysis;
  }

  getFallbackMessage(language) {
    const fallbackMessages = {
      'en': "I apologize, but I'm having trouble understanding your request. Could you try rephrasing it?",
      'ne': "म माफी चाहन्छु, तर मलाई तपाईंको अनुरोध बुझ्न समस्या भइरहेको छ। के तपाईं यसलाई फेरि प्रस्तुत गर्न प्रयास गर्नुहुन्छ?",
      'hi': "म माफी चाहता हूं, लेकिन मुझे आपके अनुरोध को समझने में कठिनाई हो रही है। क्या आप इसे दोबारा लिखने का प्रयास कर सकते हैं?"
    };
    
    return fallbackMessages[language] || fallbackMessages['en'];
  }
}

module.exports = EventRequestAssistant;