// ✅ CORRECTED: Using @langchain/ollama package
const { Ollama } = require("@langchain/ollama");
const {
  HumanMessage,
  SystemMessage,
  AIMessage,
} = require("@langchain/core/messages");

/**
 * LangChain Configuration – Ollama Only
 *
 * Purpose: Provide LLM capabilities via local Ollama models.
 * No API keys required – runs entirely offline.
 */
class LangChainConfig {
  constructor() {
    this.ollamaBaseUrl =
      process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.ollamaModel = process.env.OLLAMA_MODEL || "llama3.2"; // or mistral, phi3

    this.defaultTemperature = 0.7;
    // Always true – Ollama is assumed to be running locally
    this.isConfigured = true;
  }

  /**
   * Returns an Ollama instance.
   * Falls back to a mock model if Ollama cannot be initialised.
   */
  getChatModel(options = {}) {
    try {
      return new Ollama({
        baseUrl: options.baseUrl || this.ollamaBaseUrl,
        model: options.modelName || this.ollamaModel,
        temperature: options.temperature ?? this.defaultTemperature,
      });
    } catch (error) {
      console.error(`Error initializing Ollama model: ${error.message}`);
      console.warn(
        "Falling back to mock model – install Ollama for real AI features"
      );
      return this.getMockModel();
    }
  }

  /**
   * Mock model for when Ollama is not available.
   */
  getMockModel() {
    return {
      invoke: async (input) => {
        // Handle both string and message array inputs
        let userQuery;
        if (typeof input === "string") {
          userQuery = input;
        } else if (Array.isArray(input)) {
          const lastMessage = input[input.length - 1];
          userQuery = lastMessage.content || String(lastMessage);
        } else {
          userQuery = String(input);
        }

        return `[MOCK RESPONSE] Received: "${userQuery}".\nInstall Ollama (https://ollama.ai) and run "ollama pull ${this.ollamaModel}" for real AI responses.`;
      },
    };
  }

  /**
   * Returns the appropriate system prompt for the given agent type.
   */
  createAgentPrompt(agentType) {
    const prompts = {
      "event-recommendation":
        "You are an intelligent event recommendation assistant. Analyze user preferences to suggest relevant events.",

      "booking-support": `You are a helpful booking support assistant for Eventa.
Your role: Answer questions about bookings, cancellations, refunds, and technical issues.
Guidelines: Refer to FAQ context, keep responses concise, include specific steps when needed.
Format: Use clear language, break complex answers into steps, end with helpful closing.`,

      "event-planning": `You are an expert event planning assistant for organizers.
Your role: Help organizers create comprehensive event plans including budget allocation, timelines, vendor recommendations, and risk assessment.
Guidelines:
- Provide practical, actionable advice based on event type, location, and budget
- Consider local context (Nepal-based events)
- Balance cost-effectiveness with quality
- Highlight potential risks and mitigation strategies
- Be specific with numbers, dates, and recommendations
Format: Clear, structured responses with specific recommendations and reasoning.`,

      "budget-optimization": `You are a financial optimization specialist for events.
Your role: Analyze event budgets and provide intelligent cost-saving recommendations.
Guidelines:
- Identify areas for cost reduction without compromising quality
- Suggest vendor negotiation strategies
- Provide industry benchmarks and comparisons
- Consider economies of scale
- Be realistic about savings potential (10-25% typically achievable)
Format: Specific percentage savings, actionable steps, and trade-off analysis.`,

      negotiation:
        "You are a negotiation assistant that helps users and organizers reach fair agreements.",

      // 🔴 ADD THIS NEW PROMPT FOR EVENT REQUEST ASSISTANT
      "entity-extraction": `You are a precise entity extraction assistant for Eventa in Nepal.
Your ONLY task is to extract structured information from user event requests.
Extract these exact fields:
- event_type: Type of event (wedding, birthday, corporate, conference, party, anniversary, workshop, concert, festival, or general)
- locations: Array of Nepali city names mentioned (Kathmandu, Pokhara, Lalitpur, Bhaktapur, Chitwan, Biratnagar, Butwal, etc.)
- date: Preferred date in YYYY-MM-DD format if available
- budget: Budget amount in NPR (just the number, no commas or currency symbols)
- guests: Number of guests/attendees if mentioned
- theme: Event theme or style if mentioned (traditional, modern, rustic, elegant, etc.)
- requirements: Any special requirements mentioned
- description: A clean summary of the event request

CRITICAL RULES:
1. Respond with ONLY valid JSON - no explanations, no additional text
2. Use null for missing fields
3. Use empty array [] for locations if none mentioned
4. Convert all budget amounts to numeric NPR (1 lakh = 100000, 1 crore = 10000000)
5. Focus on Nepali context - cities, currency, cultural elements

Example:
User: "I want a wedding in Kathmandu for 200 people with budget 5 lakhs"
Response: {"event_type":"wedding","locations":["Kathmandu"],"date":null,"budget":500000,"guests":200,"theme":null,"requirements":null,"description":"Wedding in Kathmandu for 200 guests"}

User: "Need a birthday party in Pokhara, around 50 people, budget 1 lakh, modern theme"
Response: {"event_type":"birthday","locations":["Pokhara"],"date":null,"budget":100000,"guests":50,"theme":"modern","requirements":null,"description":"Modern birthday party in Pokhara for 50 guests"}`,

    };

    return prompts[agentType] || "You are a helpful AI assistant.";
  }

  /**
   * Formats conversation history into LangChain message objects.
   */
  formatConversationHistory(history, maxMessages = 5) {
    if (!Array.isArray(history) || history.length === 0) return [];

    const recentHistory = history.slice(-maxMessages);
    return recentHistory
      .map((msg) => {
        if (msg.role === "user") return new HumanMessage(msg.content);
        if (msg.role === "assistant") return new AIMessage(msg.content);
        return null;
      })
      .filter(Boolean);
  }

  /**
   * Builds a complete message chain for the LLM.
   * For Ollama LLM class, we need to format as a single string prompt.
   */
  buildMessageChain(
    systemPrompt,
    conversationHistory = [],
    currentQuery,
    context = ""
  ) {
    // Build a formatted prompt string for Ollama
    let prompt = `${systemPrompt}\n\n`;

    if (context && context.trim().length > 0) {
      prompt += `CONTEXT:\n${context}\n\n`;
    }

    // Add conversation history
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-5);
      prompt += "CONVERSATION HISTORY:\n";
      recentHistory.forEach((msg) => {
        if (msg.role === "user") {
          prompt += `User: ${msg.content}\n`;
        } else if (msg.role === "assistant") {
          prompt += `Assistant: ${msg.content}\n`;
        }
      });
      prompt += "\n";
    }

    // Add current query
    prompt += `USER QUERY:\n${currentQuery}\n\nASSISTANT RESPONSE:`;

    return prompt;
  }

  /**
   * Returns the current health status of the LLM provider.
   */
  checkHealth() {
    return {
      provider: "ollama",
      configured: this.isConfigured,
      ollama: {
        baseUrl: this.ollamaBaseUrl,
        model: this.ollamaModel,
        available: true, // We assume Ollama is running – actual check would need a ping
      },
      status: "ready",
      recommendation:
        "Ensure Ollama is running with `ollama serve` and the model is pulled.",
    };
  }

  /**
   * Tests the connection to Ollama by sending a simple prompt.
   */
  async testConnection() {
    try {
      const model = this.getChatModel();
      // Ollama LLM class accepts string prompts
      const response = await model.invoke(
        "Hello, respond with just 'OK' if you're working."
      );

      return {
        success: true,
        provider: "ollama",
        response: response,
        message: "Ollama connection successful",
      };
    } catch (error) {
      return {
        success: false,
        provider: "ollama",
        error: error.message,
        message: "Ollama connection failed – is the server running?",
      };
    }
  }
}

module.exports = new LangChainConfig();
