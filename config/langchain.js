const { ChatOpenAI } = require("@langchain/openai");
const {
  HumanMessage,
  SystemMessage,
  AIMessage,
} = require("@langchain/core/messages");

class LangChainConfig {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.isConfigured = !!this.openaiApiKey;
    this.defaultTemperature = 0.7;
    this.defaultModel = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
  }

  getChatModel(options = {}) {
    if (!this.isConfigured) {
      console.warn("OpenAI API Key not found. Using mock responses.");
      return this.getMockModel();
    }

    try {
      return new ChatOpenAI({
        openAIApiKey: this.openaiApiKey,
        modelName: options.modelName || this.defaultModel,
        temperature: options.temperature ?? this.defaultTemperature,
        maxTokens: options.maxTokens || 500,
        timeout: 30000,
      });
    } catch (error) {
      console.error("Error initializing ChatOpenAI:", error.message);
      return this.getMockModel();
    }
  }

  getMockModel() {
    return {
      invoke: async (messages) => {
        const lastMessage = messages[messages.length - 1];
        const userQuery =
          typeof lastMessage === "string" ? lastMessage : lastMessage.content;
        return {
          content: `[MOCK RESPONSE] Received: "${userQuery}". Set OPENAI_API_KEY for real AI responses.`,
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
          `FAQ CONTEXT:\n${context}\n\nUse this to answer accurately.`
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
      configured: this.isConfigured,
      model: this.defaultModel,
      apiKeyPresent: !!this.openaiApiKey,
      status: this.isConfigured ? "ready" : "mock_mode",
    };
  }
}

module.exports = new LangChainConfig();
