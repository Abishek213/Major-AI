const { ChatOpenAI } = require("@langchain/openai");
const {
  HumanMessage,
  SystemMessage,
  AIMessage,
} = require("@langchain/core/messages");

/**
 * LangChain Configuration for AI Agents
 *
 * WHY THIS EXISTS:
 * - Centralizes OpenAI configuration for all AI agents
 * - Provides consistent chat models across the application
 * - Handles API key validation and error states
 * - Manages conversation context and prompts
 *
 * USAGE:
 * const langchain = require('./config/langchain');
 * const model = langchain.getChatModel();
 * const response = await model.invoke([...messages]);
 */
class LangChainConfig {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.isConfigured = !!this.openaiApiKey;

    // Temperature controls randomness (0 = focused, 1 = creative)
    this.defaultTemperature = 0.7;

    // Model selection (gpt-4 for better quality, gpt-3.5-turbo for speed/cost)
    this.defaultModel = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
  }

  /**
   * Get configured ChatOpenAI model
   * @param {Object} options - Configuration options
   * @param {number} options.temperature - Response randomness (0-1)
   * @param {string} options.modelName - OpenAI model to use
   * @returns {ChatOpenAI|Object} Configured chat model or mock
   */
  getChatModel(options = {}) {
    if (!this.isConfigured) {
      console.warn("⚠️ OpenAI API Key not found. Using mock responses.");
      return this.getMockModel();
    }

    try {
      return new ChatOpenAI({
        openAIApiKey: this.openaiApiKey,
        modelName: options.modelName || this.defaultModel,
        temperature: options.temperature ?? this.defaultTemperature,
        maxTokens: options.maxTokens || 500, // Limit response length
        timeout: 30000, // 30 second timeout
      });
    } catch (error) {
      console.error("❌ Error initializing ChatOpenAI:", error.message);
      return this.getMockModel();
    }
  }

  /**
   * Mock model for development without API key
   * Useful for testing without burning API credits
   */
  getMockModel() {
    return {
      invoke: async (messages) => {
        const lastMessage = messages[messages.length - 1];
        const userQuery =
          typeof lastMessage === "string" ? lastMessage : lastMessage.content;

        return {
          content: `[MOCK RESPONSE] I received your question: "${userQuery}". Set OPENAI_API_KEY environment variable for real AI responses.`,
        };
      },
    };
  }

  /**
   * Create system prompts for different agent types
   * @param {string} agentType - Type of agent (booking-support, recommendation, etc.)
   * @returns {string} System prompt
   */
  createAgentPrompt(agentType) {
    const prompts = {
      "event-recommendation": `You are an intelligent event recommendation assistant. Analyze user preferences, past bookings, and interests to suggest relevant events. Be concise and helpful.`,

      "booking-support": `You are a helpful booking support assistant for an event management platform called "Eventa".

YOUR ROLE:
- Answer questions about event bookings, cancellations, refunds, and technical issues
- Provide clear, accurate information based on the FAQ knowledge base
- Be friendly, professional, and empathetic
- If you don't know something, admit it and offer to connect the user with human support

IMPORTANT GUIDELINES:
1. Always refer to the context provided from the FAQ
2. Keep responses concise (2-3 sentences for simple questions, more for complex ones)
3. Include specific steps when explaining processes
4. Mention relevant timelines (e.g., "3-5 business days for refunds")
5. If the question is outside your knowledge, say: "I don't have that specific information, but I can connect you with our support team who can help with [specific issue]."

RESPONSE FORMAT:
- Use clear, simple language
- Break complex answers into numbered steps
- End with a helpful closing (e.g., "Is there anything else I can help you with?")

Remember: You're representing Eventa - be warm, professional, and solution-focused.`,

      negotiation: `You are a negotiation assistant that helps users and organizers reach fair agreements on event pricing and terms. Analyze offers and suggest counter-offers that balance both parties' interests.`,
    };

    return prompts[agentType] || "You are a helpful AI assistant.";
  }

  /**
   * Format conversation history for the model
   * Limits history to prevent token overflow
   *
   * @param {Array} history - Array of {role: 'user'|'assistant', content: string}
   * @param {number} maxMessages - Maximum messages to include (default: 5)
   * @returns {Array} Formatted messages for LangChain
   */
  formatConversationHistory(history, maxMessages = 5) {
    if (!Array.isArray(history) || history.length === 0) {
      return [];
    }

    // Take only the most recent messages
    const recentHistory = history.slice(-maxMessages);

    return recentHistory
      .map((msg) => {
        if (msg.role === "user") {
          return new HumanMessage(msg.content);
        } else if (msg.role === "assistant") {
          return new AIMessage(msg.content);
        }
        return null;
      })
      .filter(Boolean);
  }

  /**
   * Create a complete message chain with system prompt, history, and current query
   *
   * @param {string} systemPrompt - System/agent prompt
   * @param {Array} conversationHistory - Past messages
   * @param {string} currentQuery - User's current question
   * @param {string} context - Additional context (e.g., from vector store)
   * @returns {Array} Complete message chain
   */
  buildMessageChain(
    systemPrompt,
    conversationHistory = [],
    currentQuery,
    context = ""
  ) {
    const messages = [];

    // 1. System prompt (defines agent behavior)
    messages.push(new SystemMessage(systemPrompt));

    // 2. Add context from FAQ/knowledge base if available
    if (context && context.trim().length > 0) {
      messages.push(
        new SystemMessage(
          `RELEVANT INFORMATION FROM KNOWLEDGE BASE:\n${context}\n\nUse this information to answer the user's question accurately.`
        )
      );
    }

    // 3. Add conversation history (limited to recent messages)
    const historyMessages = this.formatConversationHistory(conversationHistory);
    messages.push(...historyMessages);

    // 4. Add current user query
    messages.push(new HumanMessage(currentQuery));

    return messages;
  }

  /**
   * Health check for LangChain configuration
   * @returns {Object} Status object
   */
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
