const langchainConfig = require("../../../config/langchain");
const vectorStore = require("../../../shared/utils/vector-store");
const multilingual = require("./multilingual");
const mongoClient = require("../../../config/mongodb");
const logger = require("../../../config/logger");
const mongoose = require("mongoose");
const path = require("path");

/**
 * BOOKING SUPPORT AGENT - COMPLETE WITH MOCK MODE SUPPORT
 *
 * Features:
 * - ✅ FAQ-based question answering
 * - ✅ Multilingual support (language detection)
 * - ✅ Vector store for semantic search
 * - ✅ LangChain/Ollama integration
 * - ✅ Conversation history tracking
 * - ✅ Mock mode support (USE_MOCK_AI=true)
 * - ✅ Fallback responses
 * - ✅ Database logging
 */
class BookingSupportAgent {
  constructor() {
    this.isInitialized = false;
    this.agentName = "Booking Support Agent";
    this.agentType = "user";
    this.agentRole = "assistant";
    this.agentId = null;
    this.conversationSessions = new Map();
    this.maxHistoryLength = 5;
    this.useMockMode = process.env.USE_MOCK_AI === "true";
  }

  /**
   * Initialize the Booking Support Agent
   * Handles mock mode gracefully without throwing errors
   */
  async initialize() {
    if (this.isInitialized) {
      logger.info("✅ Booking Support Agent already initialized");
      return { success: true, message: "Already initialized" };
    }

    try {
      logger.info("🚀 Initializing Booking Support Agent...");

      // Connect to MongoDB
      await mongoClient.connect();
      logger.info(
        "📊 MongoDB connected via Mongoose for Booking Support Agent"
      );

      // Register agent in database
      await this.registerAgentInDatabase();

      // Initialize vector store
      await vectorStore.initialize();
      logger.info("🔍 Vector Store initialized");

      // Load FAQ documents
      const faqPath = path.join(
        __dirname,
        "../../../shared/prompts/faq-chat.md"
      );

      try {
        const documentCount = await vectorStore.loadFAQDocuments(faqPath);
        logger.info(`📚 Loaded ${documentCount} FAQ chunks into vector store`);
      } catch (error) {
        logger.warn(
          `⚠️ Could not load FAQ embeddings (Ollama error or offline): ${error.message}`
        );
        logger.info(
          "✅ FAQ will use local keyword search instead of embeddings"
        );
        const faqLoader = require("./faq-loader");
        await faqLoader.loadFAQs();
      }

      // ✅ FIXED: Check LangChain health but handle mock mode gracefully
      const langchainHealth = langchainConfig.checkHealth();

      if (this.useMockMode) {
        logger.info("🚧 LangChain: Running in mock mode (USE_MOCK_AI=true)");
        logger.info("   → All LLM calls will use fallback responses");
        logger.info("   → FAQ search will use keyword matching");
      } else {
        // Only enforce health check when NOT in mock mode
        if (
          langchainHealth.status !== "ready" &&
          langchainHealth.status !== "mock_mode"
        ) {
          throw new Error(
            `LangChain not ready: ${langchainHealth.message || "Unknown error"}`
          );
        }
        logger.info("🔧 LangChain + Ollama verified and ready");
      }

      // Log initialization success
      await this.logAction("system_alert", null, {
        event: "agent_initialized",
        message: "Booking Support Agent started successfully",
        mode: this.useMockMode ? "mock" : "live",
        stats: {
          faqDocuments: vectorStore.getStats().documentCount,
          supportedLanguages: multilingual.getSupportedLanguages().length,
          mockMode: this.useMockMode,
          langchainStatus: langchainHealth.status,
        },
      });

      this.isInitialized = true;
      logger.info("✅ Booking Support Agent fully initialized and ready");

      return {
        success: true,
        message: "Booking Support Agent initialized successfully",
        agentId: this.agentId,
        mode: this.useMockMode ? "mock" : "live",
        stats: {
          faqDocuments: vectorStore.getStats().documentCount,
          languages: multilingual.getSupportedLanguages(),
          langchainStatus: langchainHealth.status,
          mockMode: this.useMockMode,
        },
      };
    } catch (error) {
      logger.error("❌ Error initializing Booking Support Agent:", error);

      // Log error if database is connected
      if (mongoose.connection.readyState === 1) {
        await this.logAction("system_alert", null, {
          event: "agent_initialization_failed",
          error: error.message,
          stack: error.stack,
        }).catch((err) => logger.error("Failed to log error:", err));
      }

      throw new Error(
        `Booking Support Agent initialization failed: ${error.message}`
      );
    }
  }

  /**
   * Register agent in MongoDB AI_Agent collection
   */
  async registerAgentInDatabase() {
    try {
      let AI_Agent;
      try {
        AI_Agent = mongoose.model("AI_Agent");
      } catch {
        const aiAgentSchema = new mongoose.Schema(
          {
            name: { type: String, required: true, unique: true },
            role: {
              type: String,
              enum: [
                "assistant",
                "analyst",
                "moderator",
                "negotiator",
                "planner",
              ],
              required: true,
            },
            capabilities: mongoose.Schema.Types.Mixed,
            status: {
              type: String,
              enum: ["active", "inactive", "training", "error"],
              default: "active",
            },
            agent_type: {
              type: String,
              enum: ["user", "organizer", "admin"],
              required: true,
            },
            user_id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
          },
          { timestamps: true }
        );

        AI_Agent = mongoose.model("AI_Agent", aiAgentSchema);
      }

      const existingAgent = await AI_Agent.findOne({ name: this.agentName });

      if (existingAgent) {
        existingAgent.status = "active";
        existingAgent.updatedAt = new Date();
        await existingAgent.save();
        this.agentId = existingAgent._id;
        logger.info(`📝 Updated existing agent record: ${this.agentId}`);
      } else {
        const newAgent = new AI_Agent({
          name: this.agentName,
          role: this.agentRole,
          capabilities: {
            faqSupport: true,
            multilingual: true,
            contextAware: true,
            rag: true,
            mockMode: this.useMockMode,
            supportedLanguages: multilingual.getSupportedLanguages(),
          },
          status: "active",
          agent_type: this.agentType,
          user_id: null,
        });
        await newAgent.save();
        this.agentId = newAgent._id;
        logger.info(`✨ Created new agent record: ${this.agentId}`);
      }
    } catch (error) {
      logger.error("Failed to register agent in database:", error);
      logger.warn("Agent will continue without database registration");
    }
  }

  /**
   * Main chat interface - handles user questions with FAQ context
   */
  async chat(userMessage, userId = "anonymous", options = {}) {
    const startTime = Date.now();

    try {
      // Ensure agent is initialized
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Validate input
      if (!userMessage || typeof userMessage !== "string") {
        throw new Error("Invalid user message");
      }

      if (userMessage.trim().length === 0) {
        throw new Error("Empty message");
      }

      logger.info(`💬 [${userId}] User: ${userMessage}`);

      // Detect language
      const detectedLanguage = multilingual.detectLanguage(userMessage);
      logger.info(
        `🌐 Detected language: ${multilingual.getLanguageName(
          detectedLanguage
        )}`
      );

      // Get conversation history
      const conversationHistory = this.getConversationHistory(userId);

      // Retrieve FAQ context
      let faqContext = null;
      let faqChunksCount = 0;
      let usedLocalFAQ = false;

      try {
        faqContext = await vectorStore.getContext(userMessage, 3);
        if (faqContext) {
          faqChunksCount = faqContext.split("[Context").length - 1;
          if (faqContext.includes("mock")) {
            usedLocalFAQ = true;
            logger.info(
              `📖 Retrieved ${faqChunksCount} FAQ chunks from local mock`
            );
          } else {
            logger.info(
              `📖 Retrieved ${faqChunksCount} FAQ chunks from vector store`
            );
          }
        }
      } catch (vectorError) {
        logger.warn("⚠️ Vector search failed, using local FAQ fallback");
        usedLocalFAQ = true;

        const faqLoader = require("./faq-loader");
        const localFaqs = await faqLoader.searchFAQ(userMessage);

        if (localFaqs && localFaqs.length > 0) {
          faqContext = "";
          localFaqs.slice(0, 3).forEach((faq, index) => {
            faqContext += `[Context ${index + 1}] Question: ${
              faq.question
            }\nAnswer: ${faq.answer}\n\n`;
          });
          faqChunksCount = localFaqs.length;
          logger.info(`📖 Found ${faqChunksCount} local FAQ matches`);
        }
      }

      let responseText = "";
      let usedOllamaFallback = false;

      // Try to use LLM (Ollama or Mock)
      if (this.useMockMode) {
        // ✅ Mock mode: Use intelligent fallback directly
        logger.info("🚧 Using mock mode fallback response");
        responseText = this.generateFallbackResponse(userMessage, faqContext);
        usedOllamaFallback = true;
      } else {
        // Try real Ollama
        try {
          const systemPrompt =
            "You are a helpful booking support assistant for Eventa. Use the provided FAQ context to answer questions accurately and concisely.";

          const messages = [];

          // Add FAQ context as system message
          if (faqContext) {
            messages.push({
              role: "system",
              content: `FAQ Context:\n${faqContext}\n\nUse this information to answer accurately.`,
            });
          }

          // Add system prompt
          messages.push({ role: "system", content: systemPrompt });

          // Add conversation history
          conversationHistory.forEach((msg) => {
            messages.push({ role: msg.role, content: msg.content });
          });

          // Add current user message
          messages.push({ role: "user", content: userMessage });

          const chatModel = langchainConfig.getChatModel({
            temperature: 0.7,
            maxTokens: 500,
          });

          const aiResponse = await chatModel.invoke(messages);
          responseText = aiResponse.content || aiResponse.response || "";

          if (!responseText || responseText.trim().length === 0) {
            throw new Error("Empty response from LLM");
          }

          logger.info(`🤖 Ollama response successful`);
        } catch (ollamaError) {
          logger.warn("⚠️ Ollama chat failed, using local response generator");
          logger.debug(`Ollama error: ${ollamaError.message}`);
          responseText = this.generateFallbackResponse(userMessage, faqContext);
          usedOllamaFallback = true;
        }
      }

      const responseTime = Date.now() - startTime;

      // Wrap response for multilingual support
      responseText = multilingual.wrapResponse(responseText, detectedLanguage);

      // Update conversation history
      this.addToConversationHistory(userId, userMessage, responseText);

      // Log action to database
      await this.logAction(
        "recommendation",
        userId !== "anonymous" ? userId : null,
        {
          query: userMessage,
          response: responseText,
          language: detectedLanguage,
          faqChunksUsed: faqChunksCount,
          responseTimeMs: responseTime,
          usedFallback: usedLocalFAQ,
          usedOllamaFallback: usedOllamaFallback,
          mockMode: this.useMockMode,
        }
      );

      return {
        success: true,
        agent: this.agentName,
        message: responseText,
        metadata: {
          userId: userId,
          language: {
            detected: detectedLanguage,
            name: multilingual.getLanguageName(detectedLanguage),
          },
          context: {
            faqChunksUsed: faqChunksCount,
            usedFallback: usedLocalFAQ,
            usedOllamaFallback: usedOllamaFallback,
            mockMode: this.useMockMode,
          },
          performance: {
            responseTimeMs: responseTime,
          },
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`❌ Error in chat (${responseTime}ms):`, error);

      // Emergency fallback
      return {
        success: true,
        agent: this.agentName,
        message:
          "I can help with event bookings, cancellations (up to 48 hours before event), payments (eSewa, Khalti, cards), and event information. What specific help do you need?",
        metadata: {
          userId: userId,
          language: { detected: "en", name: "English" },
          context: { usedFallback: true, emergencyFallback: true },
          performance: { responseTimeMs: responseTime },
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * ✅ NEW: Generate intelligent fallback response based on query
   */
  generateFallbackResponse(userMessage, faqContext = null) {
    const queryLower = userMessage.toLowerCase();

    // If we have FAQ context, try to extract answer
    if (faqContext && faqContext.length > 0) {
      // Extract the first answer from FAQ context
      const answerMatch = faqContext.match(
        /Answer:\s*([^\n]+(?:\n(?!Question:|Context)[^\n]+)*)/i
      );
      if (answerMatch && answerMatch[1]) {
        return answerMatch[1].trim();
      }
    }

    // Payment-related queries
    if (
      queryLower.includes("payment") ||
      queryLower.includes("pay") ||
      queryLower.includes("method") ||
      queryLower.includes("accept") ||
      queryLower.includes("khalti") ||
      queryLower.includes("esewa")
    ) {
      if (queryLower.includes("methods") || queryLower.includes("options")) {
        return "We accept eSewa, Khalti, credit/debit cards, and bank transfers. All payments are instant and secure.";
      } else if (queryLower.includes("secure") || queryLower.includes("safe")) {
        return "All payments are encrypted and secure. We use bank-level security for transactions. Your payment information is never stored on our servers.";
      } else if (
        queryLower.includes("process") ||
        queryLower.includes("how to pay")
      ) {
        return "To complete payment: 1) Select your payment method at checkout (eSewa or Khalti), 2) Enter your credentials, 3) Confirm the transaction, 4) Receive instant confirmation via email and app notification.";
      } else {
        return "Eventa accepts two secure payment methods: Khalti and eSewa. Both are instant, secure, and widely used in Nepal. We also accept credit/debit cards and bank transfers.";
      }
    }

    // Cancellation and refund queries
    if (queryLower.includes("cancel") || queryLower.includes("refund")) {
      if (
        queryLower.includes("percentage") ||
        queryLower.includes("how much")
      ) {
        return "Cancellation refunds: 100% full refund for cancellations up to 48 hours before the event, 50% refund for cancellations within 24-48 hours, no refund for cancellations within 24 hours of the event.";
      } else if (
        queryLower.includes("time") ||
        queryLower.includes("period") ||
        queryLower.includes("how long")
      ) {
        return "Refunds are processed within 7-10 business days after cancellation approval. You'll receive confirmation via email once the refund is initiated.";
      } else if (
        queryLower.includes("process") ||
        queryLower.includes("steps") ||
        queryLower.includes("how to")
      ) {
        return "To cancel your booking: 1) Go to 'My Bookings' in your account, 2) Select the event you want to cancel, 3) Click 'Cancel Booking', 4) Confirm cancellation, 5) Refund will be processed according to our policy.";
      } else {
        return "You can cancel your booking up to 48 hours before the event for a full refund. Go to 'My Bookings' in your account to manage your bookings.";
      }
    }

    // Booking queries
    if (
      queryLower.includes("book") ||
      queryLower.includes("reserve") ||
      queryLower.includes("ticket")
    ) {
      if (queryLower.includes("how") || queryLower.includes("steps")) {
        return "To book an event: 1) Browse events or search for specific ones, 2) Select the event you want to attend, 3) Choose number of tickets, 4) Enter attendee details, 5) Complete payment through secure checkout, 6) Receive confirmation email with ticket details.";
      } else if (
        queryLower.includes("time") ||
        queryLower.includes("duration") ||
        queryLower.includes("how long")
      ) {
        return "Booking confirmation is instant after successful payment. You'll receive an email and app notification immediately with your ticket details and QR code.";
      } else {
        return "To book an event: Select the event, choose tickets, enter details, and complete payment through our secure checkout. You'll receive instant confirmation.";
      }
    }

    // Contact and support queries
    if (
      queryLower.includes("contact") ||
      queryLower.includes("help") ||
      queryLower.includes("support")
    ) {
      return "For event-specific questions, contact organizers through the event page. For technical issues or general support, email support@eventa.com or use the in-app chat. Our support team responds within 24 hours.";
    }

    // Account queries
    if (
      queryLower.includes("account") ||
      queryLower.includes("login") ||
      queryLower.includes("sign")
    ) {
      if (queryLower.includes("forgot") || queryLower.includes("password")) {
        return "To reset your password: Click 'Forgot Password' on the login page, enter your email, check your inbox for reset link, create a new password. If you don't receive the email, check spam folder or contact support@eventa.com.";
      } else {
        return "For account issues: Use 'Forgot Password' to reset, or create a new account with your email. Contact support@eventa.com if you need help with account access.";
      }
    }

    // Event information queries
    if (
      queryLower.includes("event") ||
      queryLower.includes("details") ||
      queryLower.includes("information")
    ) {
      return "Event details include date, time, location, price, description, organizer info, and attendee reviews. Click on any event card to see complete information and book tickets.";
    }

    // Greeting queries
    if (
      queryLower.includes("hello") ||
      queryLower.includes("hi") ||
      queryLower.includes("hey")
    ) {
      return "Hello! I'm the Eventa booking support assistant. I can help you with booking events, cancellations, payment methods, account issues, and event information. What would you like to know?";
    }

    // Default response
    return "I can help with booking events, cancellations (up to 48 hours before event for full refund), payment methods (eSewa, Khalti, cards), account issues, and event information. What specific help do you need?";
  }

  /**
   * Log action to MongoDB AI_ActionLog collection
   */
  async logAction(logType, userId, actionDetails) {
    if (!this.agentId || mongoose.connection.readyState !== 1) {
      logger.warn(
        "Skipping action log - database not connected or agent not registered"
      );
      return;
    }

    try {
      let AI_ActionLog;
      try {
        AI_ActionLog = mongoose.model("AI_ActionLog");
      } catch {
        const actionLogSchema = new mongoose.Schema(
          {
            agentId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "AI_Agent",
              required: true,
            },
            userId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            logType: {
              type: String,
              enum: [
                "recommendation",
                "negotiation",
                "fraud_check",
                "sentiment_analysis",
                "system_alert",
                "event_planning",
              ],
              required: true,
            },
            actionDetails: mongoose.Schema.Types.Mixed,
            eventRequestedAt: { type: Date, default: Date.now },
            failureType: {
              type: String,
              enum: [
                "timeout",
                "api_error",
                "validation_error",
                "data_error",
                null,
              ],
              default: null,
            },
            success: { type: Boolean, default: true },
          },
          { timestamps: true }
        );

        actionLogSchema.index({ agentId: 1, createdAt: -1 });
        actionLogSchema.index({ userId: 1, logType: 1 });

        AI_ActionLog = mongoose.model("AI_ActionLog", actionLogSchema);
      }

      let userObjectId = null;
      if (userId && userId !== "anonymous") {
        try {
          userObjectId = new mongoose.Types.ObjectId(userId);
        } catch (err) {
          logger.warn(`Invalid userId format: ${userId}`);
        }
      }

      const logEntry = new AI_ActionLog({
        agentId: this.agentId,
        userId: userObjectId,
        logType: logType,
        actionDetails: actionDetails,
        eventRequestedAt: new Date(),
        failureType: null,
        success: true,
      });

      await logEntry.save();
      logger.debug(`📝 Logged action: ${logType}`);
    } catch (error) {
      logger.error("Failed to log action to database:", error);
    }
  }

  /**
   * Get conversation history for a user
   */
  getConversationHistory(userId) {
    if (!this.conversationSessions.has(userId)) {
      return [];
    }

    const session = this.conversationSessions.get(userId);
    return session.slice(-this.maxHistoryLength * 2);
  }

  /**
   * Add message exchange to conversation history
   */
  addToConversationHistory(userId, userMessage, assistantMessage) {
    if (!this.conversationSessions.has(userId)) {
      this.conversationSessions.set(userId, []);
    }

    const session = this.conversationSessions.get(userId);

    session.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage }
    );

    const maxMessages = this.maxHistoryLength * 2;
    if (session.length > maxMessages) {
      const excess = session.length - maxMessages;
      session.splice(0, excess);
    }

    logger.debug(
      `💾 Conversation history [${userId}]: ${session.length / 2} exchanges`
    );
  }

  /**
   * Clear conversation history for a user
   */
  clearConversationHistory(userId) {
    if (this.conversationSessions.has(userId)) {
      this.conversationSessions.delete(userId);
      logger.info(`🗑️ Cleared conversation history for: ${userId}`);
      return { success: true, message: "Conversation history cleared" };
    }
    return { success: false, message: "No history found for this user" };
  }

  /**
   * Get full conversation history for a user
   */
  getFullHistory(userId) {
    return this.conversationSessions.get(userId) || [];
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      agent: {
        name: this.agentName,
        id: this.agentId,
        type: this.agentType,
        role: this.agentRole,
        initialized: this.isInitialized,
        mockMode: this.useMockMode,
      },
      sessions: {
        active: this.conversationSessions.size,
        maxHistoryLength: this.maxHistoryLength,
      },
      vectorStore: vectorStore.getStats(),
      langchain: langchainConfig.checkHealth(),
      multilingual: multilingual.getStats(),
      database: {
        connected: mongoose.connection.readyState === 1,
        state: mongoose.connection.readyState,
      },
    };
  }

  /**
   * Check agent health status
   */
  checkHealth() {
    return {
      status: this.isInitialized ? "ready" : "not_initialized",
      agent: this.agentName,
      agentId: this.agentId,
      mockMode: this.useMockMode,
      components: {
        database: {
          status:
            mongoose.connection.readyState === 1 ? "connected" : "disconnected",
          readyState: mongoose.connection.readyState,
        },
        vectorStore: vectorStore.checkHealth(),
        langchain: langchainConfig.checkHealth(),
        multilingual: {
          status: "ready",
          languages: multilingual.getSupportedLanguages().length,
        },
      },
      activeSessions: this.conversationSessions.size,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info("🛑 Shutting down Booking Support Agent...");

    try {
      await this.logAction("system_alert", null, {
        event: "agent_shutdown",
        message: "Booking Support Agent shutting down",
        activeSessions: this.conversationSessions.size,
        mockMode: this.useMockMode,
      });

      // Clear conversation sessions
      this.conversationSessions.clear();

      // Clear vector store
      await vectorStore.clear();

      // Update agent status in database
      if (this.agentId && mongoose.connection.readyState === 1) {
        try {
          const AI_Agent = mongoose.model("AI_Agent");
          await AI_Agent.findByIdAndUpdate(this.agentId, {
            status: "inactive",
            updatedAt: new Date(),
          });
        } catch (error) {
          logger.warn("Could not update agent status on shutdown:", error);
        }
      }

      this.isInitialized = false;
      logger.info("✅ Booking Support Agent shutdown complete");

      return { success: true, message: "Agent shutdown successfully" };
    } catch (error) {
      logger.error("Error during shutdown:", error);
      throw error;
    }
  }
}

module.exports = new BookingSupportAgent();
