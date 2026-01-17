const logger = require('../../../config/logger');

class MultilingualSupport {
  constructor() {
    this.supportedLanguages = {
      'en': 'English',
      'ne': 'Nepali',
      'hi': 'Hindi',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German'
    };
    
    this.translations = {
      'ne': {
        'hello': 'नमस्ते',
        'thank you': 'धन्यवाद',
        'booking': 'बुकिङ',
        'event': 'कार्यक्रम',
        'price': 'मूल्य',
        'date': 'मिति',
        'location': 'स्थान',
        'cancel': 'रद्द गर्नुहोस्',
        'refund': 'फिर्ता',
        'help': 'मद्दत'
      },
      'hi': {
        'hello': 'नमस्ते',
        'thank you': 'धन्यवाद',
        'booking': 'बुकिंग',
        'event': 'कार्यक्रम',
        'price': 'कीमत',
        'date': 'तारीख',
        'location': 'स्थान'
      }
    };

    this.greetings = {
      'en': 'Hello! How can I help you today?',
      'ne': 'नमस्ते! म तपाईंलाई कसरी मद्दत गर्न सक्छु?',
      'hi': 'नमस्ते! मैं आपकी कैसे मदद कर सकता हूं?',
      'es': '¡Hola! ¿Cómo puedo ayudarte hoy?',
      'fr': 'Bonjour ! Comment puis-je vous aider aujourd\'hui ?'
    };
  }

  detectLanguage(text) {
    // Simple language detection based on character sets
    const nepaliRegex = /[\u0900-\u097F]/;
    const devanagariRegex = /[\u0900-\u097F\uA8E0-\uA8FF]/;
    
    if (nepaliRegex.test(text)) {
      return 'ne';
    } else if (text.match(/[अ-ह]/)) {
      return 'hi';
    } else if (text.match(/[áéíóúñ]/i)) {
      return 'es';
    } else if (text.match(/[àâçéèêëîïôûùüÿœæ]/i)) {
      return 'fr';
    } else if (text.match(/[äöüß]/i)) {
      return 'de';
    }
    
    return 'en'; // Default to English
  }

  isLanguageSupported(languageCode) {
    return this.supportedLanguages.hasOwnProperty(languageCode);
  }

  getLanguageName(languageCode) {
    return this.supportedLanguages[languageCode] || 'Unknown';
  }

  translate(text, fromLang = 'en', toLang = 'en') {
    if (fromLang === toLang) return text;
    
    // Simple word-by-word translation for common phrases
    if (this.translations[toLang]) {
      const words = text.toLowerCase().split(' ');
      const translatedWords = words.map(word => {
        return this.translations[toLang][word] || word;
      });
      
      return translatedWords.join(' ');
    }
    
    // For production, integrate with translation API like Google Translate
    logger.warning(`Translation from ${fromLang} to ${toLang} not fully implemented`);
    return text;
  }

  translateToEnglish(text) {
    const detectedLang = this.detectLanguage(text);
    
    if (detectedLang === 'en') {
      return text;
    }
    
    // Reverse lookup for common phrases
    const words = text.toLowerCase().split(' ');
    const englishWords = words.map(word => {
      // Check each language's translations for this word
      for (const [lang, dict] of Object.entries(this.translations)) {
        for (const [english, foreign] of Object.entries(dict)) {
          if (foreign === word) {
            return english;
          }
        }
      }
      return word;
    });
    
    return englishWords.join(' ');
  }

  getGreeting(languageCode = 'en') {
    return this.greetings[languageCode] || this.greetings['en'];
  }

  getCommonQuestions(languageCode = 'en') {
    const questions = {
      'en': [
        "How do I book an event?",
        "Can I cancel my booking?",
        "What payment methods are accepted?",
        "How do recommendations work?",
        "Can I request a custom event?"
      ],
      'ne': [
        "मैले कसरी कार्यक्रम बुक गर्न सक्छु?",
        "के म बुकिङ रद्द गर्न सक्छु?",
        "कुन भुक्तानी विधिहरू स्वीकार्य छन्?",
        "सिफारिशहरू कसरी काम गर्छन्?",
        "के मैले अनुकूलित कार्यक्रमको अनुरोध गर्न सक्छु?"
      ]
    };
    
    return questions[languageCode] || questions['en'];
  }

  async getTranslatedFAQ(faq, targetLanguage) {
    if (targetLanguage === 'en') {
      return faq;
    }
    
    const translatedFAQ = {
      ...faq,
      question: this.translate(faq.question, 'en', targetLanguage),
      answer: this.translate(faq.answer, 'en', targetLanguage)
    };
    
    return translatedFAQ;
  }
}

module.exports = new MultilingualSupport();