const { logger } = require("../../../config/logger");
const langchain = require("../../../config/langchain");

class NERProcessor {
  constructor() {
    // Don't initialize OpenAI here - do it lazily when needed
    this.entityTypes = [
      "event_type",
      "location",
      "date",
      "budget",
      "guests",
      "theme",
      "requirements",
    ];
    this.llm= null; 

  }

   getLLM() {
    if (this.llm) return this.llm;
    
    try {
      // Get Ollama model from LangChain config
      this.llm = langchain.getChatModel({
        temperature: 0.3, // Lower temperature for more consistent extraction
      });
      
      console.log("✅ LangChain Ollama model initialized");
      return this.llm;
    } catch (error) {
      console.error("❌ Failed to initialize LLM:", error.message);
      return null;
    }
  }

  /**
   * Process natural language and extract entities
   */
   async processNaturalLanguage(text) {
    try {
      // Check if we should use mock mode (from .env)
      if (process.env.USE_MOCK_AI === 'true') {
        console.log("🔧 USE_MOCK_AI=true, using fallback extraction");
        return this.fallbackExtraction(text);
      }

      const llm = this.getLLM();
      
      // If LLM not available, use fallback
      if (!llm) {
        console.log("🔧 LLM not available, using fallback extraction");
        return this.fallbackExtraction(text);
      }

      const prompt = this.buildPrompt(text);

      console.log("🦙 Calling Ollama via LangChain for entity extraction...");
      
      // Using LangChain's invoke method
      const response = await llm.invoke(prompt);
      
      // Extract content from response (handles both string and AI message objects)
      const result = typeof response === 'string' 
        ? response 
        : response?.content || String(response);
      
      console.log('📦 Ollama response received');
      
      return this.parseAndValidateEntities(result, text);

    } catch (error) {
      console.error('❌ Ollama extraction failed:', error.message);
      console.log("🔧 Falling back to rule-based extraction");
      return this.fallbackExtraction(text);
    }
  }

  /**
   * Build optimized prompt for entity extraction
   */
  buildPrompt(text) {
    const systemPrompt = langchain.createAgentPrompt('entity-extraction');
    
    return `${systemPrompt}
 
Extract the following entities from this event request in Nepal:

"${text}"

CRITICAL BUDGET CONVERSION RULES:
- In Nepal/India, "lakh" = 100,000 (1 lakh = 100,000)
- "5 lakhs" = 500,000
- "12 lakhs" = 1,200,000
- "crore" = 10,000,000 (1 crore = 100 lakhs)
- Always convert to raw numbers in the output
- Remove any commas, just output the raw number

Example conversions:
  "8 lakhs" → 800000
  "2.5 lakhs" → 250000
  "15 lakhs" → 1500000
  "1 crore" → 10000000
  "1.2 crore" → 12000000

Return ONLY valid JSON with these exact keys:
- event_type: Type of event (wedding, birthday, corporate, conference, party, anniversary, workshop, concert, festival, or general)
- locations: Array of Nepali city names mentioned (Kathmandu, Pokhara, Lalitpur, Bhaktapur, Chitwan, Biratnagar, Butwal, etc.)
- date: Preferred date in YYYY-MM-DD format if available, otherwise null
- budget: Budget amount in NPR (as raw number, e.g., 800000 for 8 lakhs, just the number, no commas or currency symbols)
- guests: Number of guests/attendees if mentioned, otherwise null
- theme: Event theme or style if mentioned (traditional, modern, etc.)
- requirements: Any special requirements mentioned
- description: A clean summary of the event request

Example response format:
{
  "event_type": "wedding",
  "locations": ["Kathmandu"],
  "date": "2024-12-15",
  "budget": 500000,
  "guests": 200,
  "theme": "traditional",
  "requirements": "need stage decoration",
  "description": "Traditional wedding in Kathmandu for 200 guests"
}`;
  }

  parseAndValidateEntities(jsonString) {
    try {
      // Try to extract JSON if it's wrapped in markdown code blocks
      let cleanJson = jsonString;
      const jsonMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        cleanJson = jsonMatch[1];
      }

      const entities = JSON.parse(cleanJson);

      const validated = {
        eventType: entities.event_type || 'general',
        locations: Array.isArray(entities.locations) ? entities.locations :
                   entities.locations ? [entities.locations] : [],
        date: this.parseDate(entities.date),
        budget: this.extractBudget(entities.budget),
        guests: this.extractNumber(entities.guests),
        theme: entities.theme || '',
        requirements: entities.requirements || '',
        description: entities.description || text
      };

      // Clean up locations
      validated.locations = validated.locations
        .map(loc => loc.trim())
        .filter(loc => loc.length > 0);

      console.log("✅ Successfully parsed entities:", {
        eventType: validated.eventType,
        locations: validated.locations,
        budget: validated.budget,
        guests: validated.guests
      });

      return validated;
    } catch (error) {
      console.error(`❌ Failed to parse NER JSON: ${error.message}`);
      console.log("Raw JSON string:", jsonString);
      return this.fallbackExtraction(jsonString);
    }
  }

  fallbackExtraction(text) {
    if (typeof text !== 'string') {
      text = String(text || '');
    }
    
    const lowerText = text.toLowerCase();
    const originalText = text;

    console.log('🔧 Running fallback extraction for:', text.substring(0, 100) + '...');
    
    const entities = {
      eventType: 'general',
      locations: [],
      date: null,
      budget: null,
      guests: null,
      theme: '',
      requirements: '',
      description: originalText
    };

    // Extract event type with better detection
    const eventKeywords = [
      { word: "wedding", type: "wedding", patterns: ["wedding", "wed", "marriage", "bihe"] },
      { word: "birthday", type: "birthday", patterns: ["birthday", "bday", "born"] },
      { word: "corporate", type: "corporate", patterns: ["corporate", "business", "company", "office"] },
      { word: "conference", type: "conference", patterns: ["conference", "seminar", "meeting"] },
      { word: "party", type: "party", patterns: ["party", "celebration"] },
      { word: "anniversary", type: "anniversary", patterns: ["anniversary"] },
      { word: "workshop", type: "workshop", patterns: ["workshop", "training"] },
      { word: "concert", type: "concert", patterns: ["concert", "live", "music"] },
      { word: "festival", type: "festival", patterns: ["festival", "mela"] }
    ];
    
    for (const { word, type } of eventKeywords) {
      if (lowerText.includes(word)) {
        entities.eventType = type;
        console.log(`✅ Detected event type: ${type} (matched: ${word})`);
        break;
      }
    }

    // Extract locations - Nepal cities
    const locationKeywords = [
      "kathmandu", "pokhara", "lalitpur", "bhaktapur", "chitwan", "biratnagar",
      "birgunj", "dharan", "nepalgunj", "hetauda", "janakpur", "butwal",
      "dhangadhi", "itahari", "ghorahi", "bharatpur", "tulsipur"
    ];

    locationKeywords.forEach(location => {
      if (lowerText.includes(location)) {
        // Capitalize properly
        const capitalized = location.charAt(0).toUpperCase() + location.slice(1);
        entities.locations.push(capitalized);
        console.log(`✅ Found location: ${capitalized}`);
      }
    });

    // Extract budget with better regex
    const budgetPatterns = [
      /(?:rs\.?|npr|रु)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      /budget\s*(?:of|is|:)?\s*(?:rs\.?|npr|रु)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:rs\.?|npr|रु)/i,
      /(?:with|of)\s*(?:rs\.?|npr|रु)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i
    ];

    for (const pattern of budgetPatterns) {
      const match = originalText.match(pattern);
      if (match) {
        entities.budget = parseInt(match[1].replace(/,/g, ""));
        console.log(`✅ Extracted budget: ${entities.budget}`);
        break;
      }
    }

    // If no budget found with patterns, try to find large numbers
    if (!entities.budget) {
      const allNumbers = originalText.match(/\d+(?:,\d{3})*(?:\.\d{2})?/g) || [];
      const numbers = allNumbers.map(num => parseInt(num.replace(/,/g, "")));
      
      // Filter for reasonable budget numbers (> 1000)
      const possibleBudgets = numbers.filter(n => n > 1000 && n < 10000000);
      if (possibleBudgets.length > 0) {
        entities.budget = Math.max(...possibleBudgets);
        console.log(`✅ Extracted largest number as budget: ${entities.budget}`);
      }
    }

    // Extract guests
    const guestsPatterns = [
      /(\d+)\s*(?:guests?|people|persons|attendees|participants|individuals|pax)\b/i,
      /for\s+(\d+)\s+(?:guests?|people|persons)\b/i,
      /(\d+)\s*(?:person|guest)\b/i
    ];

    for (const pattern of guestsPatterns) {
      const match = originalText.match(pattern);
      if (match) {
        entities.guests = parseInt(match[1]);
        console.log(`✅ Extracted guests: ${entities.guests}`);
        break;
      }
    }

    // If no guests found, look for standalone numbers that might be guest count
    if (!entities.guests && entities.budget) {
      const allNumbers = originalText.match(/\d+/g) || [];
      const numbers = allNumbers.map(Number);
      // Guest count is usually smaller than budget
      const possibleGuests = numbers.filter(n => n > 5 && n < 1000 && n !== entities.budget);
      if (possibleGuests.length > 0) {
        entities.guests = possibleGuests[0];
        console.log(`✅ Inferred guests: ${entities.guests}`);
      }
    }

    // Extract date
    const datePatterns = [
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/,
      /(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4})/i
    ];
    
    for (const pattern of datePatterns) {
      const match = originalText.match(pattern);
      if (match) {
        entities.date = match[1] || match[0];
        console.log(`✅ Found date: ${entities.date}`);
        break;
      }
    }

    // Extract theme (simple detection)
    const themeKeywords = ["theme", "style", "traditional", "modern", "rustic", "elegant", "casual"];
    for (const keyword of themeKeywords) {
      if (lowerText.includes(keyword)) {
        entities.theme = keyword;
        console.log(`✅ Found theme: ${keyword}`);
        break;
      }
    }

    return entities;
  }

  parseDate(dateString) {
    if (!dateString) return null;

    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
    } catch (error) {
      return null;
    }
  }

  extractBudget(budgetString) {
    if (!budgetString) return null;

    const matches = budgetString.toString().match(/\d+(?:,\d{3})*(?:\.\d{2})?/);
    if (matches) {
      return parseFloat(matches[0].replace(/,/g, ""));
    }
    return null;
  }

  extractNumber(text) {
    if (!text) return null;
    const match = text.toString().match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }
}

// Create singleton instance
const nerProcessor = new NERProcessor();

module.exports = {
  processNaturalLanguage: (text) => nerProcessor.processNaturalLanguage(text),
  NERProcessor,
};