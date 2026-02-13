const { Ollama } = require("@langchain/ollama");
const { logger } = require("../../../config/logger");

class NERProcessor {
  constructor() {
    // Initialize Ollama model
    this.ollama = new Ollama({
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: process.env.OLLAMA_MODEL || "llama3.2",
      temperature: 0.3,
    });

    this.entityTypes = [
      "event_type",
      "location",
      "date",
      "budget",
      "guests",
      "theme",
      "requirements",
    ];

    // Check if we should use mock AI
    this.useMockAI = process.env.USE_MOCK_AI === "true";
  }

  async processNaturalLanguage(text) {
    try {
      const prompt = `Extract the following entities from the event request:
"${text}"

Extract as JSON with these keys:
- event_type (string: wedding, birthday, conference, meeting, seminar, business, party, anniversary, workshop, concert, festival, or general)
- locations (array of strings: city/venue names)
- date (string: YYYY-MM-DD format or null)
- budget (number: budget amount in NPR or null)
- guests (number: expected number of attendees or null)
- theme (string: event theme or empty string)
- requirements (string: special requirements or empty string)
- description (string: brief description of the event)

Important:
- Return ONLY valid JSON, no explanations or markdown
- Use null for missing numeric/date values
- Use empty string "" for missing text values
- Use empty array [] for missing locations
- Ensure all field names match exactly

Example output format:
{
  "event_type": "wedding",
  "locations": ["Kathmandu"],
  "date": "2024-06-15",
  "budget": 500000,
  "guests": 200,
  "theme": "traditional",
  "requirements": "vegetarian catering",
  "description": "Traditional wedding ceremony"
}`;

      // If mock AI is enabled, use fallback
      if (this.useMockAI) {
        console.log("Mock AI enabled, using fallback NLP");
        return this.fallbackExtraction(text);
      }

      // System prompt for Ollama
      const systemPrompt = `You are an event planning assistant that extracts structured information from event requests. 
You must respond ONLY with valid JSON, no additional text or markdown formatting.`;

      // Combine system prompt and user prompt for Ollama
      const fullPrompt = `${systemPrompt}

${prompt}`;

      console.log("DEBUG NER: Sending request to Ollama...");

      const response = await this.ollama.invoke(fullPrompt);

      console.log("DEBUG NER: Raw Ollama response:", response);

      // Ollama returns a string response
      const result = typeof response === "string" ? response : String(response);

      return this.parseAndValidateEntities(result);
    } catch (error) {
      console.error(
        "DEBUG NER: Error in processNaturalLanguage:",
        error.message
      );

      try {
        console.log("Falling back to rule-based extraction");
        return this.fallbackExtraction(text);
      } catch (fallbackError) {
        console.error("Fallback extraction also failed:", fallbackError);

        return {
          eventType: "general",
          locations: [],
          date: null,
          budget: null,
          guests: null,
          theme: "",
          requirements: "",
          description: text,
        };
      }
    }
  }

  parseAndValidateEntities(jsonString) {
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanedString = jsonString.trim();

      // Remove markdown code blocks
      cleanedString = cleanedString.replace(/```json\s*/g, "");
      cleanedString = cleanedString.replace(/```\s*/g, "");

      // Try to extract JSON if there's extra text
      const jsonMatch = cleanedString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedString = jsonMatch[0];
      }

      const entities = JSON.parse(cleanedString);

      const validated = {
        eventType: entities.event_type || "general",
        locations: Array.isArray(entities.locations)
          ? entities.locations
          : entities.locations
          ? [entities.locations]
          : [],
        date: this.parseDate(entities.date),
        budget: this.extractBudget(entities.budget),
        guests: this.extractNumber(entities.guests),
        theme: entities.theme || "",
        requirements: entities.requirements || "",
        description: entities.description || "",
      };

      // Clean up locations
      validated.locations = validated.locations
        .map((loc) => loc.trim())
        .filter((loc) => loc.length > 0);

      console.log("DEBUG NER: Validated entities:", validated);

      return validated;
    } catch (error) {
      logger.error(`Failed to parse NER results: ${error.message}`);
      console.log(
        "DEBUG NER: Parse error, falling back to rule-based extraction"
      );
      return this.fallbackExtraction(jsonString);
    }
  }

  fallbackExtraction(text) {
    const lowerText = text.toLowerCase();

    console.log("DEBUG NER: Running fallback extraction for:", text);

    const entities = {
      eventType: "general",
      locations: [],
      date: null,
      budget: null,
      guests: null,
      theme: "",
      requirements: "",
      description: text,
    };

    // Event type detection
    const eventKeywords = [
      "wedding",
      "birthday",
      "conference",
      "meeting",
      "seminar",
      "business",
      "party",
      "anniversary",
      "workshop",
      "concert",
      "festival",
    ];

    for (const keyword of eventKeywords) {
      if (lowerText.includes(keyword)) {
        entities.eventType = keyword;
        break;
      }
    }

    // Location detection - Nepal cities
    const locationKeywords = [
      "Kathmandu",
      "Pokhara",
      "Lalitpur",
      "Biratnagar",
      "Birgunj",
      "Dharan",
      "Nepalgunj",
      "Hetauda",
      "Chitwan",
      "Janakpur",
      "Butwal",
      "Dhangadhi",
      "Itahari",
      "Ghorahi",
      "Bharatpur",
      "Tulsipur",
    ];

    locationKeywords.forEach((location) => {
      const regex = new RegExp(`\\b${location}\\b`, "i");
      if (regex.test(text)) {
        entities.locations.push(location);
      }
    });

    // Fallback: Look for capitalized words that might be locations
    if (entities.locations.length === 0) {
      const locationWords = text
        .split(/\s+/)
        .filter((word) => /^[A-Z][a-z]+$/.test(word) && word.length > 3);

      if (locationWords.length > 0) {
        entities.locations.push(locationWords[0]);
      }
    }

    // Budget extraction
    const budgetRegex = /budget\s*(?:of|is|:)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i;
    const currencyRegex =
      /(?:rs\.?|npr|usd|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i;

    let match = text.match(budgetRegex) || text.match(currencyRegex);

    if (match) {
      entities.budget = parseInt(match[1].replace(/,/g, ""));
    }

    // Guests extraction
    const guestsRegex =
      /(\d+)\s*(?:guests?|people|persons|attendees|participants|individuals)\b/i;
    const guestsMatch = text.match(guestsRegex);

    if (guestsMatch) {
      entities.guests = parseInt(guestsMatch[1]);
    }

    // Date extraction
    const dateRegex = /(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{4})/;
    const dateMatch = text.match(dateRegex);

    if (dateMatch) {
      entities.date = dateMatch[0];
    }

    // Theme extraction (common themes)
    const themeKeywords = [
      "traditional",
      "modern",
      "vintage",
      "rustic",
      "elegant",
      "casual",
      "formal",
      "beach",
      "garden",
      "outdoor",
      "indoor",
    ];

    for (const theme of themeKeywords) {
      if (lowerText.includes(theme)) {
        entities.theme = theme;
        break;
      }
    }

    // Requirements extraction (common requirements)
    const requirementKeywords = [
      "vegetarian",
      "vegan",
      "halal",
      "kosher",
      "outdoor",
      "indoor",
      "parking",
      "wheelchair",
      "accessible",
      "catering",
      "music",
      "photography",
      "decoration",
    ];

    const foundRequirements = [];
    for (const requirement of requirementKeywords) {
      if (lowerText.includes(requirement)) {
        foundRequirements.push(requirement);
      }
    }

    if (foundRequirements.length > 0) {
      entities.requirements = foundRequirements.join(", ");
    }

    console.log("DEBUG NER: Fallback extraction result:", entities);

    return entities;
  }

  parseDate(dateString) {
    if (!dateString) return null;

    // Handle different date formats
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
  }

  extractBudget(budgetString) {
    if (!budgetString) return null;

    // If already a number, return it
    if (typeof budgetString === "number") return budgetString;

    // Extract number from string
    const matches = String(budgetString).match(/\d+(?:,\d{3})*(?:\.\d{2})?/);
    return matches ? parseFloat(matches[0].replace(/,/g, "")) : null;
  }

  extractNumber(text) {
    if (!text) return null;

    // If already a number, return it
    if (typeof text === "number") return text;

    // Extract number from string
    const match = String(text).match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

  /**
   * Test Ollama connection
   */
  async testConnection() {
    try {
      const response = await this.ollama.invoke(
        "Respond with just 'OK' if you're working."
      );
      return {
        success: true,
        provider: "ollama",
        response: response,
        message: "Ollama connection successful for NER processing",
      };
    } catch (error) {
      return {
        success: false,
        provider: "ollama",
        error: error.message,
        message:
          "Ollama connection failed – falling back to rule-based extraction",
      };
    }
  }
}

const nerProcessor = new NERProcessor();

module.exports = {
  processNaturalLanguage: (text) => nerProcessor.processNaturalLanguage(text),
  NERProcessor,
  testConnection: () => nerProcessor.testConnection(),
};
