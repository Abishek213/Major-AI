const logger = require('../../../config/logger');
const faqLoader = require('./faq-loader');
const multilingual = require('./multilingual');

class BookingSupportAgent {
  constructor() {
    this.name = 'booking-support-agent';
    this.faqData = null;
    this.multilingual = multilingual;
  }
  
  async initialize() {
    logger.agent(this.name, 'Initializing agent');
    this.faqData = await faqLoader.loadFAQs();
    logger.success('FAQ data loaded:', this.faqData.length, 'entries');
    return true;
  }
  
  async getFAQAnswer(question, language = 'en') {
    try {
      if (!this.faqData) {
        await this.initialize();
      }
      
      // Translate question to English for matching if needed
      const questionToMatch = language === 'en' 
        ? question.toLowerCase()
        : await this.multilingual.translateToEnglish(question, language);
      
      // Find best matching FAQ
      const bestMatch = this.findBestMatch(questionToMatch);
      
      // Translate answer to requested language if needed
      let answer = bestMatch.answer;
      if (language !== 'en') {
        answer = await this.multilingual.translate(answer, 'en', language);
      }
      
      return {
        question,
        answer,
        confidence: bestMatch.confidence,
        source: 'faq_database',
        language
      };
    } catch (error) {
      logger.error(`Error in getFAQAnswer: ${error.message}`);
      
      // Fallback response
      return {
        question,
        answer: 'I apologize, but I could not find a specific answer to your question. Please contact our support team for further assistance.',
        confidence: 0.1,
        source: 'fallback',
        language
      };
    }
  }
  
  findBestMatch(question) {
    let bestMatch = null;
    let highestScore = 0;
    
    for (const faq of this.faqData) {
      const score = this.calculateMatchScore(question, faq.question.toLowerCase());
      
      if (score > highestScore) {
        highestScore = score;
        bestMatch = {
          answer: faq.answer,
          confidence: score
        };
      }
    }
    
    // If no good match, use generic response
    if (highestScore < 0.3) {
      return {
        answer: 'I understand you have a question. Could you please provide more details so I can assist you better?',
        confidence: 0.3
      };
    }
    
    return bestMatch;
  }
  
  calculateMatchScore(question, faqQuestion) {
    const questionWords = new Set(question.split(/\W+/).filter(w => w.length > 2));
    const faqWords = new Set(faqQuestion.split(/\W+/).filter(w => w.length > 2));
    
    // Calculate Jaccard similarity
    const intersection = new Set([...questionWords].filter(x => faqWords.has(x)));
    const union = new Set([...questionWords, ...faqWords]);
    
    if (union.size === 0) return 0;
    
    return intersection.size / union.size;
  }
  
  async processBookingQuery(query, language = 'en') {
    logger.agent(this.name, 'Processing booking query:', query.substring(0, 50) + '...');
    
    // Check if it's an FAQ question first
    const faqResponse = await this.getFAQAnswer(query, language);
    
    if (faqResponse.confidence > 0.6) {
      return faqResponse;
    }
    
    // If not in FAQ, try to handle as a booking-specific query
    return this.handleBookingSpecificQuery(query, language);
  }
  
  async handleBookingSpecificQuery(query, language) {
    const keywords = {
      cancel: ['cancel', 'refund', 'delete booking'],
      modify: ['change', 'modify', 'update booking', 'reschedule'],
      status: ['status', 'where is', 'track', 'check booking'],
      payment: ['payment', 'pay', 'invoice', 'receipt']
    };
    
    const queryLower = query.toLowerCase();
    
    for (const [type, words] of Object.entries(keywords)) {
      for (const word of words) {
        if (queryLower.includes(word)) {
          return this.getBookingTemplateResponse(type, language);
        }
      }
    }
    
    // Default response for unrecognized booking queries
    return {
      answer: 'For booking-related inquiries, please provide your booking reference number or contact our support team directly.',
      confidence: 0.2,
      type: 'general_booking',
      language
    };
  }
  
  getBookingTemplateResponse(type, language) {
    const responses = {
      en: {
        cancel: 'To cancel your booking, please go to "My Bookings" section and select the booking you wish to cancel. Refunds are processed within 5-7 business days.',
        modify: 'To modify your booking, please contact our support team with your booking reference number and requested changes.',
        status: 'You can check your booking status in the "My Bookings" section of your account dashboard.',
        payment: 'For payment-related queries, please check the "Payment History" section or contact our billing department.'
      }
    };
    
    const langResponses = responses[language] || responses.en;
    return {
      answer: langResponses[type] || langResponses.cancel,
      confidence: 0.8,
      type: `booking_${type}`,
      language
    };
  }
}

module.exports = BookingSupportAgent;