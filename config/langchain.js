const { ChatOllama } = require("@langchain/community/chat_models/ollama");
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
   * Returns a ChatOllama instance.
   * Falls back to a mock model if Ollama cannot be initialised.
   */
  getChatModel(options = {}) {
    try {
      return new ChatOllama({
        baseUrl: options.baseUrl || this.ollamaBaseUrl,
        model: options.modelName || this.ollamaModel,
        temperature: options.temperature ?? this.defaultTemperature,
        numCtx: options.maxTokens || 2048, // Context window size
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
      invoke: async (messages) => {
        const lastMessage = messages[messages.length - 1];
        const userQuery =
          typeof lastMessage === "string" ? lastMessage : lastMessage.content;

        return {
          content: `[MOCK RESPONSE] Received: "${userQuery}".\nInstall Ollama (https://ollama.ai) and run "ollama pull ${this.ollamaModel}" for real AI responses.`,
        };
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
   */
  buildMessageChain(
    systemPrompt,
    conversationHistory = [],
    currentQuery,
    context = ""
  ) {
    const messages = [];

    messages.push(new SystemMessage(systemPrompt));

    if (context && context.trim().length > 0) {
      messages.push(
        new SystemMessage(
          `CONTEXT:\n${context}\n\nUse this information to provide accurate responses.`
        )
      );
    }

    const historyMessages = this.formatConversationHistory(conversationHistory);
    messages.push(...historyMessages);

    messages.push(new HumanMessage(currentQuery));

    return messages;
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
      const response = await model.invoke([
        new HumanMessage("Hello, respond with just 'OK' if you're working."),
      ]);

      return {
        success: true,
        provider: "ollama",
        response: response.content,
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
