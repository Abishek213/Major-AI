const langchainConfig = require("../../../config/langchain");
const vectorStore = require("../../../shared/utils/vector-store");
const multilingual = require("./multilingual");
const mongoClient = require("../../../config/mongodb");
const logger = require("../../../config/logger");
const mongoose = require("mongoose");
const path = require("path");

/**
 * ============================================================================
 * BOOKING SUPPORT AGENT
 * ============================================================================
 *
 * CORE FUNCTIONALITY:
 * 1. 24/7 FAQ-based support using RAG (Retrieval Augmented Generation)
 * 2. Multilingual query handling (English, Nepali, Hindi, etc.)
 * 3. Conversation context management (remembers last 5 exchanges)
 * 4. Database logging for analytics and debugging
 * 5. Agent instance tracking in MongoDB
 *
 * ============================================================================
 * ARCHITECTURE:
 * ============================================================================
 *
 * User Query → Language Detection → FAQ Search (Vector Store) →
 * Context Building → LLM Response → Database Logging → Return Response
 *
 * ============================================================================
 * RAG PIPELINE EXPLANATION:
 * ============================================================================
 *
 * Traditional Chatbot Problem:
 * - User: "How do I get a refund?"
 * - AI: *Hallucinates* "Refunds take 30 days" (WRONG!)
 *
 * RAG Solution:
 * - User: "How do I get a refund?"
 * - System: Searches FAQ → Finds "Refunds process in 7-10 business days"
 * - AI: "According to our policy, refunds take 7-10 business days"
 *
 * Benefits:
 *  Accurate answers from YOUR documentation
 *  No hallucinations
 *  Always up-to-date with FAQ changes
 *
 * ============================================================================
 * CONVERSATION CONTEXT:
 * ============================================================================
 *
 * Without Context:
 * User: "Tell me about refunds"
 * Agent: "Refunds take 7-10 days..."
 * User: "How much?"
 * Agent: "How much what?" ❌ (No context)
 *
 * With Context (Our Implementation):
 * User: "Tell me about refunds"
 * Agent: "Refunds take 7-10 days..."
 * User: "How much?"
 * Agent: "Full refund if cancelled 48hrs before event" ✅ (Has context)
 *
 * ============================================================================
 */

class BookingSupportAgent {
  constructor() {
    this.isInitialized = false;
    this.agentName = "Booking Support Agent";
    this.agentType = "user"; // From ERD: user/organizer/admin
    this.agentRole = "assistant"; // From AI_Agent.role enum
    this.agentId = null; // Will be set after DB registration
    this.conversationSessions = new Map(); // userId -> conversation history
    this.maxHistoryLength = 5; // Remember last 5 user-agent exchanges
  }

  /**
   * ========================================================================
   * INITIALIZATION
   * ========================================================================
   *
   * WHAT HAPPENS HERE:
   * 1. Connect to MongoDB
   * 2. Register/Find agent in AI_Agent collection
   * 3. Initialize Vector Store (ChromaDB)
   * 4. Load FAQ documents
   * 5. Verify LangChain + OpenAI connection
   *
   * WHY IT'S IMPORTANT:
   * - Without DB: Can't log actions, track analytics
   * - Without Vector Store: Can't do RAG, answers will be generic
   * - Without FAQ: No knowledge base to answer from
   */
  async initialize() {
    if (this.isInitialized) {
      logger.info("✅ Booking Support Agent already initialized");
      return { success: true, message: "Already initialized" };
    }

    try {
      logger.info("🚀 Initializing Booking Support Agent...");

      // ===================================================================
      // STEP 1: Connect to MongoDB via Mongoose
      // ===================================================================
      // Why: We need to log actions and register the agent
      await mongoClient.connect();
      logger.info(
        "📊 MongoDB connected via Mongoose for Booking Support Agent"
      );

      // ===================================================================
      // STEP 2: Register Agent in Database
      // ===================================================================
      // This creates/updates the agent record in AI_Agent collection
      // Purpose: Track agent existence, status, and link to actions
      await this.registerAgentInDatabase();

      // ===================================================================
      // STEP 3: Initialize Vector Store (ChromaDB)
      // ===================================================================
      // Why: Vector store enables semantic search over FAQ documents
      // Instead of keyword matching, it understands meaning
      // Example: "cancel booking" matches "how to abort reservation"
      await vectorStore.initialize();
      logger.info("🔍 Vector Store initialized");

      // ===================================================================
      // STEP 4: Load FAQ Documents
      // ===================================================================
      // Converts FAQ markdown to embeddings and stores in ChromaDB
      // These embeddings are used for RAG (Retrieval Augmented Generation)
      const faqPath = path.join(
        __dirname,
        "../../../shared/prompts/faq-chat.md"
      );

      try {
        const documentCount = await vectorStore.loadFAQDocuments(faqPath);
        logger.info(`📚 Loaded ${documentCount} FAQ chunks into vector store`);
      } catch (error) {
        logger.warn(
          `⚠️ Could not load FAQ embeddings (OpenAI quota): ${error.message}`
        );
        logger.info(
          "✅ FAQ will use local keyword search instead of embeddings"
        );
        // We'll load FAQ locally instead
        const faqLoader = require("./faq-loader");
        await faqLoader.loadFAQs();
      }

      // ===================================================================
      // STEP 5: Verify LangChain Configuration
      // ===================================================================
      // Ensures OpenAI API key is set and LangChain is properly configured
      const langchainHealth = langchainConfig.checkHealth();
      if (langchainHealth.status !== "ready") {
        throw new Error(
          `LangChain not ready: ${langchainHealth.message || "Unknown error"}`
        );
      }
      logger.info("🔧 LangChain + OpenAI verified and ready");

      // ===================================================================
      // STEP 6: Log Successful Initialization
      // ===================================================================
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

      // Log failure to database if possible
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
   * ========================================================================
   * REGISTER AGENT IN DATABASE
   * ========================================================================
   *
   * Creates or updates the agent record in AI_Agent collection
   *
   * Database Schema (from ERD):
   * {
   *   name: String (Unique),
   *   role: ENUM ['assistant', 'analyst', 'moderator', 'negotiator'],
   *   capabilities: Mixed,
   *   status: ENUM ['active', 'inactive', 'training', 'error'],
   *   agent_type: ENUM ['user', 'organizer', 'admin'],
   *   user_id: ObjectId (nullable)
   * }
   *
   * Why we need this:
   * - Links all agent actions to this agent record
   * - Tracks agent status (active/inactive)
   * - Enables agent analytics and monitoring
   */
  async registerAgentInDatabase() {
    try {
      // Define schema inline if model doesn't exist
      // This prevents "model already defined" errors
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

      // Find existing or create new agent
      const existingAgent = await AI_Agent.findOne({ name: this.agentName });

      if (existingAgent) {
        // Update existing agent status
        existingAgent.status = "active";
        existingAgent.updatedAt = new Date();
        await existingAgent.save();
        this.agentId = existingAgent._id;
        logger.info(`📝 Updated existing agent record: ${this.agentId}`);
      } else {
        // Create new agent record
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
          user_id: null, // System-wide agent, not tied to specific user
        });
        await newAgent.save();
        this.agentId = newAgent._id;
        logger.info(`✨ Created new agent record: ${this.agentId}`);
      }
    } catch (error) {
      logger.error("Failed to register agent in database:", error);
      // Don't throw - allow agent to work without DB registration
      // But log the issue
      logger.warn("Agent will continue without database registration");
    }
  }

  /**
   * ========================================================================
   * MAIN CHAT FUNCTION
   * ========================================================================
   *
   * THE BRAIN OF THE AGENT
   *
   * PROCESS FLOW:
   * 1. Detect user's language (English/Nepali/Hindi/etc)
   * 2. Retrieve conversation history (context from previous messages)
   * 3. Search FAQ knowledge base (RAG - find relevant FAQ chunks)
   * 4. Build prompt with system instructions + context + FAQ + user query
   * 5. Send to OpenAI/LLM
   * 6. Get response
   * 7. Save to conversation history
   * 8. Log to database
   * 9. Return response
   *
   * @param {string} userMessage - The user's question
   * @param {string} userId - User ID for tracking (MongoDB ObjectId or "anonymous")
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response with answer and metadata
   */
  async chat(userMessage, userId = "anonymous", options = {}) {
    const startTime = Date.now();

    try {
      // Ensure agent is initialized
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Input validation
      if (!userMessage || typeof userMessage !== "string") {
        throw new Error("Invalid user message");
      }

      if (userMessage.trim().length === 0) {
        throw new Error("Empty message");
      }

      logger.info(`💬 [${userId}] User: ${userMessage}`);

      // ===================================================================
      // STEP 1: Language Detection (always works - no OpenAI needed)
      // ===================================================================
      const detectedLanguage = multilingual.detectLanguage(userMessage);
      logger.info(
        `🌐 Detected language: ${multilingual.getLanguageName(
          detectedLanguage
        )}`
      );

      // ===================================================================
      // STEP 2: Get Conversation History (always works - local)
      // ===================================================================
      const conversationHistory = this.getConversationHistory(userId);

      // ===================================================================
      // STEP 3: Try to get FAQ context from OpenAI (with fallback)
      // ===================================================================
      let faqContext = null;
      let faqChunksCount = 0;

      try {
        faqContext = await vectorStore.getContext(userMessage, 3);
        if (faqContext) {
          faqChunksCount = faqContext.split("[Context").length - 1;
          logger.info(`📖 Retrieved ${faqChunksCount} FAQ chunks from OpenAI`);
        }
      } catch (openaiError) {
        // OPENAI FAILED - USE LOCAL FALLBACK
        logger.warn("⚠️ OpenAI vector search failed, using local FAQ fallback");

        // Load local FAQ data
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

      // ===================================================================
      // STEP 4: Try OpenAI chat (with fallback)
      // ===================================================================
      let responseText = "";

      try {
        // Try OpenAI first
        const langchainConfig = require("../../../config/langchain");
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
        logger.info(`🤖 OpenAI response successful`);
      } catch (openaiError) {
        // OPENAI FAILED - USE SIMPLE LOCAL RESPONSE
        logger.warn("⚠️ OpenAI chat failed, using local response generator");

        if (faqContext && faqChunksCount > 0) {
          // Use the first FAQ answer as response
          const firstAnswerMatch = faqContext.match(/Answer: ([^\n]+)/);
          if (firstAnswerMatch) {
            responseText = firstAnswerMatch[1];
          } else {
            // Simple rule-based responses
            const queryLower = userMessage.toLowerCase();
            if (
              queryLower.includes("cancel") ||
              queryLower.includes("refund")
            ) {
              responseText =
                "You can cancel your booking up to 48 hours before the event for a full refund. Go to 'My Bookings' in your account.";
            } else if (
              queryLower.includes("book") ||
              queryLower.includes("reserve")
            ) {
              responseText =
                "To book an event, select the event, choose tickets, and complete payment through our secure checkout.";
            } else if (
              queryLower.includes("payment") ||
              queryLower.includes("pay")
            ) {
              responseText =
                "We accept eSewa, Khalti, credit/debit cards, and bank transfers.";
            } else if (
              queryLower.includes("contact") ||
              queryLower.includes("help")
            ) {
              responseText =
                "You can contact organizers through the event page or email support@eventa.com for assistance.";
            } else {
              responseText =
                "I can help with booking, cancellation, payment, and event questions. Please ask specifically what you need help with.";
            }
          }
        } else {
          // No FAQ context available
          responseText =
            "I can help with event bookings, cancellations, payments, and general questions. What would you like to know about?";
        }

        logger.info(`🤖 Local fallback response generated`);
      }

      const responseTime = Date.now() - startTime;

      // Save to conversation history
      this.addToConversationHistory(userId, userMessage, responseText);

      // Log to database
      await this.logAction(
        "recommendation",
        userId !== "anonymous" ? userId : null,
        {
          query: userMessage,
          response: responseText,
          language: detectedLanguage,
          faqChunksUsed: faqChunksCount,
          responseTimeMs: responseTime,
          usedFallback: faqContext === null || faqContext.includes("local FAQ"), // Track if we used fallback
        }
      );

      // Return successful response
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
            usedFallback:
              faqContext === null || faqContext.includes("local FAQ"),
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

      // Ultimate fallback - always return something useful
      return {
        success: true, // Still success even with fallback
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
   * ========================================================================
   * LOG ACTION TO DATABASE
   * ========================================================================
   *
   * Saves agent actions to AI_ActionLog collection
   *
   * Schema (from ERD):
   * {
   *   agentId: ObjectId,
   *   userId: ObjectId (nullable),
   *   logType: ENUM ['recommendation', 'negotiation', 'fraud_check',
   *                  'sentiment_analysis', 'system_alert'],
   *   actionDetails: Mixed,
   *   eventRequestedAt: Date (nullable),
   *   failureType: ENUM ['timeout', 'api_error', 'validation_error',
   *                      'data_error', null],
   *   success: Boolean
   * }
   *
   * Purpose:
   * - Analytics: Track agent usage patterns
   * - Debugging: Diagnose issues
   * - Improvement: Identify areas to enhance
   */
  async logAction(logType, userId, actionDetails) {
    if (!this.agentId || mongoose.connection.readyState !== 1) {
      logger.warn(
        "Skipping action log - database not connected or agent not registered"
      );
      return;
    }

    try {
      // Define schema inline if model doesn't exist
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

        // Add indexes from ERD
        actionLogSchema.index({ agentId: 1, createdAt: -1 });
        actionLogSchema.index({ userId: 1, logType: 1 });

        AI_ActionLog = mongoose.model("AI_ActionLog", actionLogSchema);
      }

      // Convert userId string to ObjectId if valid
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
      // Don't throw - logging failure shouldn't break the agent
    }
  }

  /**
   * ========================================================================
   * CONVERSATION HISTORY MANAGEMENT
   * ========================================================================
   */

  /**
   * Get conversation history for a user
   *
   * Why limit history?
   * - Token limits: LLMs have max input size
   * - Relevance: Very old messages aren't useful
   * - Performance: Less data = faster processing
   *
   * We keep last 5 exchanges = 10 messages (5 user + 5 assistant)
   */
  getConversationHistory(userId) {
    if (!this.conversationSessions.has(userId)) {
      return [];
    }

    const session = this.conversationSessions.get(userId);
    return session.slice(-this.maxHistoryLength * 2); // Last 5 exchanges
  }

  /**
   * Add messages to conversation history
   *
   * Stores both user message and agent response
   * Automatically prunes old messages to prevent memory overflow
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

    // Prune old messages
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
   *
   * Use cases:
   * - User clicks "New Conversation" button
   * - User wants fresh context
   * - Session timeout
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
   * Get full conversation history (for debugging/export)
   */
  getFullHistory(userId) {
    return this.conversationSessions.get(userId) || [];
  }

  /**
   * ========================================================================
   * MONITORING & DIAGNOSTICS
   * ========================================================================
   */

  /**
   * Get comprehensive agent statistics
   * Useful for admin dashboards and monitoring
   */
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

  /**
   * Health check endpoint
   * Returns status of all components
   */
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

  /**
   * ========================================================================
   * CLEANUP & SHUTDOWN
   * ========================================================================
   */

  /**
   * Graceful shutdown
   * Cleans up resources before stopping
   *
   * Important for:
   * - Preventing memory leaks
   * - Closing database connections
   * - Saving state if needed
   */
  async shutdown() {
    logger.info("🛑 Shutting down Booking Support Agent...");

    try {
      // Log shutdown event
      await this.logAction("system_alert", null, {
        event: "agent_shutdown",
        message: "Booking Support Agent shutting down",
        activeSessions: this.conversationSessions.size,
      });

      // Clear all conversation sessions
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

      // Note: We don't close mongoose connection here
      // because other parts of the app might be using it
      // Connection management is handled by the main app

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
