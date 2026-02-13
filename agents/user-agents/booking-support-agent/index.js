const langchainConfig = require("../../../config/langchain");
const vectorStore = require("../../../shared/utils/vector-store");
const multilingual = require("./multilingual");
const mongoClient = require("../../../config/mongodb");
const logger = require("../../../config/logger");
const mongoose = require("mongoose");
const path = require("path");

class BookingSupportAgent {
  constructor() {
    this.isInitialized = false;
    this.agentName = "Booking Support Agent";
    this.agentType = "user";
    this.agentRole = "assistant";
    this.agentId = null;
    this.conversationSessions = new Map();
    this.maxHistoryLength = 5;
  }

  async initialize() {
    if (this.isInitialized) {
      logger.info("✅ Booking Support Agent already initialized");
      return { success: true, message: "Already initialized" };
    }

    try {
      logger.info("🚀 Initializing Booking Support Agent...");

      await mongoClient.connect();
      logger.info(
        "📊 MongoDB connected via Mongoose for Booking Support Agent"
      );

      await this.registerAgentInDatabase();

      await vectorStore.initialize();
      logger.info("🔍 Vector Store initialized");

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

      const langchainHealth = langchainConfig.checkHealth();
      if (langchainHealth.status !== "ready") {
        throw new Error(
          `LangChain not ready: ${langchainHealth.message || "Unknown error"}`
        );
      }
      logger.info("🔧 LangChain + Ollama verified and ready");

      await this.logAction("system_alert", null, {
        event: "agent_initialized",
        message: "Booking Support Agent started successfully",
        stats: {
          faqDocuments: vectorStore.getStats().documentCount,
          supportedLanguages: multilingual.getSupportedLanguages().length,
        },
      });

      this.isInitialized = true;
      logger.info("✅ Booking Support Agent fully initialized and ready");

      return {
        success: true,
        message: "Booking Support Agent initialized successfully",
        agentId: this.agentId,
        stats: {
          faqDocuments: vectorStore.getStats().documentCount,
          languages: multilingual.getSupportedLanguages(),
          langchainStatus: langchainHealth.status,
        },
      };
    } catch (error) {
      logger.error("❌ Error initializing Booking Support Agent:", error);

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
              enum: ["assistant", "analyst", "moderator", "negotiator"],
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

  async chat(userMessage, userId = "anonymous", options = {}) {
    const startTime = Date.now();

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!userMessage || typeof userMessage !== "string") {
        throw new Error("Invalid user message");
      }

      if (userMessage.trim().length === 0) {
        throw new Error("Empty message");
      }

      logger.info(`💬 [${userId}] User: ${userMessage}`);

      const detectedLanguage = multilingual.detectLanguage(userMessage);
      logger.info(
        `🌐 Detected language: ${multilingual.getLanguageName(
          detectedLanguage
        )}`
      );

      const conversationHistory = this.getConversationHistory(userId);

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

      try {
        const systemPrompt =
          "You are a helpful booking support assistant. Use the provided FAQ context to answer questions accurately.";

        const messages = [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: userMessage },
        ];

        if (faqContext) {
          messages.unshift({
            role: "system",
            content: `FAQ Context:\n${faqContext}\n\nUse this information to answer accurately.`,
          });
        }

        const chatModel = langchainConfig.getChatModel({
          temperature: 0.7,
          maxTokens: 500,
        });

        const aiResponse = await chatModel.invoke(messages);
        responseText = aiResponse.content;
        logger.info(`🤖 Ollama response successful`);
      } catch (ollamaError) {
        logger.warn("⚠️ Ollama chat failed, using local response generator");

        const queryLower = userMessage.toLowerCase();

        if (
          queryLower.includes("payment") ||
          queryLower.includes("pay") ||
          queryLower.includes("method") ||
          queryLower.includes("accept") ||
          queryLower.includes("khalti") ||
          queryLower.includes("esewa")
        ) {
          if (
            queryLower.includes("methods") ||
            queryLower.includes("options")
          ) {
            responseText =
              "We accept eSewa, Khalti, credit/debit cards, and bank transfers.";
          } else if (
            queryLower.includes("secure") ||
            queryLower.includes("safe")
          ) {
            responseText =
              "All payments are encrypted and secure. We use bank-level security for transactions.";
          } else if (
            queryLower.includes("process") ||
            queryLower.includes("how to pay")
          ) {
            responseText =
              "Select your payment method at checkout (eSewa or Khalti), enter your credentials, confirm the transaction, and receive instant confirmation.";
          } else {
            responseText =
              "Eventa accepts two secure payment methods: Khalti and eSewa. Both are instant, secure, and widely used in Nepal.";
          }
        } else if (
          queryLower.includes("cancel") ||
          queryLower.includes("refund")
        ) {
          if (
            queryLower.includes("percentage") ||
            queryLower.includes("how much")
          ) {
            responseText =
              "For cancellations up to 48 hours before the event, you get a 100% full refund. Within 24-48 hours, you get 50% refund.";
          } else if (
            queryLower.includes("time") ||
            queryLower.includes("period") ||
            queryLower.includes("how long")
          ) {
            responseText =
              "Refunds are processed within 7-10 business days after cancellation.";
          } else if (
            queryLower.includes("process") ||
            queryLower.includes("steps") ||
            queryLower.includes("how to")
          ) {
            responseText =
              "Go to 'My Bookings', select the event, click 'Cancel', and follow the refund process.";
          } else {
            responseText =
              "You can cancel your booking up to 48 hours before the event for a full refund. Go to 'My Bookings' in your account.";
          }
        } else if (
          queryLower.includes("book") ||
          queryLower.includes("reserve") ||
          queryLower.includes("ticket")
        ) {
          if (queryLower.includes("how") || queryLower.includes("steps")) {
            responseText =
              "To book: 1) Select event 2) Choose tickets 3) Enter details 4) Make payment 5) Get confirmation email.";
          } else if (
            queryLower.includes("time") ||
            queryLower.includes("duration") ||
            queryLower.includes("how long")
          ) {
            responseText =
              "Booking confirmation is instant after payment. You'll receive email and app notification.";
          } else {
            responseText =
              "To book an event, select the event, choose tickets, and complete payment through our secure checkout.";
          }
        } else if (
          queryLower.includes("contact") ||
          queryLower.includes("help") ||
          queryLower.includes("support")
        ) {
          responseText =
            "You can contact organizers through the event page or email support@eventa.com for assistance.";
        } else if (
          queryLower.includes("account") ||
          queryLower.includes("login") ||
          queryLower.includes("sign")
        ) {
          responseText =
            "For account issues: Use 'Forgot Password' or create a new account with your email. Contact support@eventa.com for help.";
        } else if (
          queryLower.includes("event") ||
          queryLower.includes("details") ||
          queryLower.includes("information")
        ) {
          responseText =
            "Event details include date, time, location, price, and description. Click on any event to see complete information.";
        } else {
          responseText =
            "I can help with booking events, cancellations, payment methods, account issues, and event information. What specific help do you need?";
        }

        logger.info("🤖 Local fallback response generated");
        responseText = multilingual.wrapResponse(
          responseText,
          detectedLanguage
        );
      }

      const responseTime = Date.now() - startTime;

      this.addToConversationHistory(userId, userMessage, responseText);

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
          usedOllamaFallback: responseText.includes("🤖 Local fallback"),
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
            usedOllamaFallback: responseText.includes("Local fallback"),
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

  getConversationHistory(userId) {
    if (!this.conversationSessions.has(userId)) {
      return [];
    }

    const session = this.conversationSessions.get(userId);
    return session.slice(-this.maxHistoryLength * 2);
  }

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

  clearConversationHistory(userId) {
    if (this.conversationSessions.has(userId)) {
      this.conversationSessions.delete(userId);
      logger.info(`🗑️ Cleared conversation history for: ${userId}`);
      return { success: true, message: "Conversation history cleared" };
    }
    return { success: false, message: "No history found for this user" };
  }

  getFullHistory(userId) {
    return this.conversationSessions.get(userId) || [];
  }

  getStats() {
    return {
      agent: {
        name: this.agentName,
        id: this.agentId,
        type: this.agentType,
        role: this.agentRole,
        initialized: this.isInitialized,
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

  checkHealth() {
    return {
      status: this.isInitialized ? "ready" : "not_initialized",
      agent: this.agentName,
      agentId: this.agentId,
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

  async shutdown() {
    logger.info("🛑 Shutting down Booking Support Agent...");

    try {
      await this.logAction("system_alert", null, {
        event: "agent_shutdown",
        message: "Booking Support Agent shutting down",
        activeSessions: this.conversationSessions.size,
      });

      this.conversationSessions.clear();

      await vectorStore.clear();

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
