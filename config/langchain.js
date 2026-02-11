const { ChatOpenAI } = require("@langchain/openai");
const { ChatOllama } = require("@langchain/community/chat_models/ollama");
const {
  HumanMessage,
  SystemMessage,
  AIMessage,
} = require("@langchain/core/messages");

class LangChainConfig {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiModel = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

    this.ollamaBaseUrl =
      process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.ollamaModel = process.env.OLLAMA_MODEL || "llama3.2"; // or mistral, phi3

    this.provider = process.env.LLM_PROVIDER || "ollama"; // "ollama" | "openai" | "mock"

    this.defaultTemperature = 0.7;
    this.isConfigured = this.checkConfiguration();
  }

  checkConfiguration() {
    if (this.provider === "openai") {
      return !!this.openaiApiKey;
    } else if (this.provider === "ollama") {
      // Ollama doesn't need API key, just needs to be running
      return true;
    }
    return false;
  }

  getChatModel(options = {}) {
    const provider = options.provider || this.provider;

    try {
      if (provider === "openai" && this.openaiApiKey) {
        return this.getOpenAIModel(options);
      } else if (provider === "ollama") {
        return this.getOllamaModel(options);
      } else {
        console.warn(`Provider "${provider}" not available. Using mock model.`);
        return this.getMockModel();
      }
    } catch (error) {
      console.error(`Error initializing ${provider} model:`, error.message);
      console.warn("Falling back to mock model");
      return this.getMockModel();
    }
  }

  getOpenAIModel(options = {}) {
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    return new ChatOpenAI({
      openAIApiKey: this.openaiApiKey,
      modelName: options.modelName || this.openaiModel,
      temperature: options.temperature ?? this.defaultTemperature,
      maxTokens: options.maxTokens || 1000,
      timeout: 30000,
    });
  }

  getOllamaModel(options = {}) {
    return new ChatOllama({
      baseUrl: options.baseUrl || this.ollamaBaseUrl,
      model: options.modelName || this.ollamaModel,
      temperature: options.temperature ?? this.defaultTemperature,
      numCtx: options.maxTokens || 2048, // Context window size
    });
  }

  getMockModel() {
    return {
      invoke: async (messages) => {
        const lastMessage = messages[messages.length - 1];
        const userQuery =
          typeof lastMessage === "string" ? lastMessage : lastMessage.content;

        return {
          content: `[MOCK RESPONSE] Received: "${userQuery}". Configure Ollama (free) or OpenAI for real AI responses.`,
        };
      },
    };
  }

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

  checkHealth() {
    return {
      provider: this.provider,
      configured: this.isConfigured,
      ollama: {
        baseUrl: this.ollamaBaseUrl,
        model: this.ollamaModel,
        available: this.provider === "ollama",
      },
      openai: {
        model: this.openaiModel,
        apiKeyPresent: !!this.openaiApiKey,
        available: this.provider === "openai" && !!this.openaiApiKey,
      },
      status: this.isConfigured ? "ready" : "mock_mode",
      recommendation: !this.openaiApiKey
        ? "Install Ollama (free) for AI features: https://ollama.ai"
        : "OpenAI configured (paid tier)",
    };
  }

  async testConnection() {
    try {
      const model = this.getChatModel();
      const response = await model.invoke([
        new HumanMessage("Hello, respond with just 'OK' if you're working."),
      ]);

      return {
        success: true,
        provider: this.provider,
        response: response.content,
        message: "LLM connection successful",
      };
    } catch (error) {
      return {
        success: false,
        provider: this.provider,
        error: error.message,
        message: "LLM connection failed",
      };
    }
  }
}

module.exports = new LangChainConfig();
