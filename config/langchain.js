const { ChatOllama } = require("@langchain/ollama");
const { Ollama: OllamaEmbeddings } = require("@langchain/ollama");
const {
  HumanMessage,
  SystemMessage,
  AIMessage,
} = require("@langchain/core/messages");

class LangChainConfig {
  constructor() {
    this.ollamaBaseUrl =
      process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";
    this.embeddingModel =
      process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
    this.defaultTemperature = 0.7;

    this.useMockAI = process.env.USE_MOCK_AI === "true";
    this.isConfigured = true;

    if (this.useMockAI) {
      console.log(
        "🚧 MOCK MODE ENABLED - Using fallback AI responses (no Ollama calls)"
      );
    } else {
      console.log(
        `🤖 LLM Mode: Ollama at ${this.ollamaBaseUrl} with model ${this.ollamaModel}`
      );
    }
  }

  getChatModel(options = {}) {
    // ✅ Return mock model immediately if USE_MOCK_AI=true
    if (this.useMockAI) {
      return this.getMockModel();
    }

    try {
      return new ChatOllama({
        baseUrl: options.baseUrl || this.ollamaBaseUrl,
        model: options.modelName || this.ollamaModel,
        temperature: options.temperature ?? this.defaultTemperature,
        timeout: options.timeout || 10000,
      });
    } catch (error) {
      console.error(`Error initializing ChatOllama: ${error.message}`);
      console.warn("Falling back to mock model");
      return this.getMockModel();
    }
  }

  getEmbeddingsModel(options = {}) {
    if (this.useMockAI) {
      return null; // Skip embeddings in mock mode
    }

    try {
      return new OllamaEmbeddings({
        baseUrl: options.baseUrl || this.ollamaBaseUrl,
        model: options.modelName || this.embeddingModel,
      });
    } catch (error) {
      console.error(`Error initializing embeddings: ${error.message}`);
      return null;
    }
  }

  getMockModel() {
    return {
      invoke: async (input) => {
        // Simulate minimal processing time
        await new Promise((resolve) => setTimeout(resolve, 50));

        let userQuery = "";
        if (typeof input === "string") {
          userQuery = input;
        } else if (Array.isArray(input)) {
          const lastMessage = input[input.length - 1];
          userQuery = lastMessage?.content || String(lastMessage);
        } else {
          userQuery = String(input);
        }

        // ✅ Intelligent mock responses based on query type
        let mockContent;

        const queryLower = userQuery.toLowerCase();

        // Tag generation request
        if (
          queryLower.includes("tag") &&
          (queryLower.includes("suggest") || queryLower.includes("generate"))
        ) {
          mockContent =
            "networking, tech, conference, innovation, ai, cloud, professional, development";
        }
        // Recommendations request
        else if (
          queryLower.includes("recommendation") ||
          queryLower.includes("actionable")
        ) {
          mockContent = JSON.stringify([
            "Consider early-bird pricing to boost registrations and improve cash flow",
            "Partner with local tech companies and sponsors to offset venue costs",
            "Promote heavily on LinkedIn and tech community groups for better reach",
            "Use event management software to streamline registration and check-in",
          ]);
        }
        // Generic/test request
        else {
          mockContent =
            "Mock AI is active. Real responses available with Ollama.";
        }

        return {
          content: mockContent,
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
Task: Provide 3-5 actionable recommendations for event success.
Rules:
- Return ONLY a valid JSON array of strings
- No markdown, no code fences, no extra text
- Each recommendation should be specific and actionable
Example format: ["recommendation 1", "recommendation 2", "recommendation 3"]`,

      "tag-generation": `You are a tag generation specialist for events.
Task: Generate relevant, searchable tags for an event.
Rules:
- Return ONLY a comma-separated list of lowercase tags
- No quotes, no brackets, no markdown, no numbering
- 5-8 tags maximum
- Mix of general and specific terms
Example format: networking, tech, innovation, conference, ai`,

      "budget-optimization": `You are a financial optimization specialist for events.
Your role: Analyze event budgets and provide intelligent cost-saving recommendations.
Guidelines:
- Identify areas for cost reduction without compromising quality
- Suggest vendor negotiation strategies
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
      messages.push(new SystemMessage(`Context: ${context}`));
    }
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-5);
      recentHistory.forEach((msg) => {
        if (msg.role === "user") messages.push(new HumanMessage(msg.content));
        else if (msg.role === "assistant")
          messages.push(new AIMessage(msg.content));
      });
    }
    messages.push(new HumanMessage(currentQuery));
    return messages;
  }

  checkHealth() {
    return {
      provider: "ollama",
      configured: this.isConfigured,
      mockMode: this.useMockAI,
      ollama: {
        baseUrl: this.ollamaBaseUrl,
        model: this.ollamaModel,
        embeddingModel: this.embeddingModel,
        available: !this.useMockAI,
      },
      status: this.useMockAI ? "mock_mode" : "ready",
      recommendation: this.useMockAI
        ? "Mock mode active. Set USE_MOCK_AI=false for real AI."
        : "Ensure Ollama is running with the model pulled.",
    };
  }

  async testConnection() {
    if (this.useMockAI) {
      return {
        success: true,
        provider: "mock",
        response: "Mock mode active",
        message: "Running in mock mode - no Ollama connection needed",
      };
    }

    try {
      const model = this.getChatModel();
      const response = await model.invoke([
        new HumanMessage("Respond with OK"),
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
        message: "Ollama connection failed",
      };
    }
  }
}

module.exports = new LangChainConfig();
