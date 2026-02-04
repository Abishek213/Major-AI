const logger = require("../../config/logger");
const EventRecommendationAgent = require("../../agents/user-agents/event-recommendation");
const BookingSupportAgent = require("../../agents/user-agents/booking-support-agent");

/**
 * ============================================================================
 * AGENT CONTROLLER - API ENDPOINT HANDLERS
 * ============================================================================
 *
 * This controller handles HTTP requests and routes them to appropriate AI agents
 *
 * ARCHITECTURE:
 * Backend API → AI Service API → Agent Controller → AI Agents → Response
 *
 * ENDPOINTS STRUCTURE:
 * - User Agents: /api/agents/user/*
 * - Organizer Agents: /api/agents/organizer/*
 * - Admin Agents: /api/agents/admin/*
 * - System: /api/agents/health, /api/agents/status
 *
 * ============================================================================
 */

class AgentController {
  constructor() {
    // Initialize booking support agent (singleton)
    this.bookingSupportAgent = BookingSupportAgent;

    // Track initialization status
    this.initialized = false;
  }

  /**
   * ========================================================================
   * INITIALIZE AGENTS
   * ========================================================================
   *
   * Called on server startup to initialize all agents
   * Currently only booking support agent needs explicit initialization
   */
  async initialize() {
    if (this.initialized) {
      logger.info("✅ Agent controller already initialized");
      return;
    }

    try {
      logger.info("🚀 Initializing AI agents...");

      // Initialize booking support agent (loads FAQ, connects to DB)
      await this.bookingSupportAgent.initialize();

      this.initialized = true;
      logger.success("✅ All AI agents initialized successfully");
    } catch (error) {
      logger.error("❌ Error initializing agents:", error);
      throw error;
    }
  }

  // ========================================================================
  // USER AGENTS
  // ========================================================================

  /**
   * ========================================================================
   * POST /api/agents/user/recommendations
   * ========================================================================
   *
   * Generate event recommendations for a user
   *
   * Request Body:
   * {
   *   userId: string (required),
   *   limit: number (optional, default: 10),
   *   userContext: { wishlistEvents, bookedEvents, reviewedEvents },
   *   candidateEvents: Array of events
   * }
   */
  async postRecommendations(req, res) {
    try {
      const { userId, limit = 10, userContext, candidateEvents } = req.body;

      // Validation
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "User ID is required in request body",
        });
      }

      logger.agent("event-recommendation", "processing", `user: ${userId}`);

      const agent = new EventRecommendationAgent();

      // Generate recommendations
      const recommendations = await agent.getRecommendations(
        userId,
        parseInt(limit),
        userContext,
        candidateEvents
      );

      logger.success(
        `Generated ${recommendations.length} recommendations for user ${userId}`
      );

      res.json({
        success: true,
        recommendations: recommendations,
        count: recommendations.length,
        generated_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("AI Recommendation error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate recommendations",
        message: error.message,
      });
    }
  }

  /**
   * ========================================================================
   * POST /api/agents/user/booking-support/chat
   * ========================================================================
   *
   * PHASE 1.2: Booking Support Agent Chat Endpoint
   *
   * This is the main endpoint for the booking support chatbot
   * Handles FAQ questions, multilingual support, and conversation context
   *
   * Request Body:
   * {
   *   message: string (required) - User's question,
   *   userId: string (optional) - For conversation tracking,
   *   sessionId: string (optional) - Alternative to userId for anonymous users
   * }
   *
   * Response:
   * {
   *   success: boolean,
   *   agent: string,
   *   message: string - AI's response,
   *   metadata: {
   *     userId/sessionId,
   *     language: { detected, name },
   *     context: { faqChunksUsed, historyMessagesUsed },
   *     performance: { responseTimeMs },
   *     timestamp
   *   }
   * }
   */
  async chatBookingSupport(req, res) {
    const startTime = Date.now();

    try {
      const { message, userId, sessionId } = req.body;

      // ===================================================================
      // VALIDATION
      // ===================================================================
      if (
        !message ||
        typeof message !== "string" ||
        message.trim().length === 0
      ) {
        return res.status(400).json({
          success: false,
          error: "Message is required and must be a non-empty string",
        });
      }

      // Use userId if provided, otherwise sessionId, otherwise anonymous
      const userIdentifier = userId || sessionId || "anonymous";

      logger.agent(
        "booking-support",
        "received query",
        `[${userIdentifier}]: ${message.substring(0, 50)}...`
      );

      // ===================================================================
      // GET BOOKING SUPPORT AGENT INSTANCE
      // ===================================================================
      const BookingSupportAgent = require("../../agents/user-agents/booking-support-agent");

      // Check if agent is initialized
      const agentHealth = BookingSupportAgent.checkHealth();
      if (agentHealth.status === "not_initialized") {
        logger.info("Agent not initialized, initializing now...");
        await BookingSupportAgent.initialize();
      }

      // ===================================================================
      // CALL BOOKING SUPPORT AGENT
      // ===================================================================
      const response = await BookingSupportAgent.chat(message, userIdentifier);

      const duration = Date.now() - startTime;

      // ===================================================================
      // LOG SUCCESS
      // ===================================================================
      logger.success(
        `Booking support responded in ${duration}ms [${userIdentifier}]`
      );

      // ===================================================================
      // RETURN RESPONSE
      // ===================================================================
      res.json(response);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Booking support error (${duration}ms):`, error);

      res.status(500).json({
        success: false,
        error: "Failed to process booking support request",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * ========================================================================
   * POST /api/agents/user/booking-support/clear-history
   * ========================================================================
   *
   * Clear conversation history for a user
   * Useful for "New Conversation" button in UI
   *
   * Request Body:
   * {
   *   userId: string (required) OR sessionId: string (required)
   * }
   */
  async clearChatHistory(req, res) {
    try {
      const { userId, sessionId } = req.body;
      const userIdentifier = userId || sessionId;

      if (!userIdentifier) {
        return res.status(400).json({
          success: false,
          error: "userId or sessionId is required",
        });
      }

      logger.agent(
        "booking-support",
        "clearing history",
        `user: ${userIdentifier}`
      );

      const result =
        this.bookingSupportAgent.clearConversationHistory(userIdentifier);

      res.json(result);
    } catch (error) {
      logger.error("Clear chat history error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to clear chat history",
        message: error.message,
      });
    }
  }

  /**
   * ========================================================================
   * GET /api/agents/user/booking-support/health
   * ========================================================================
   *
   * Health check for booking support agent
   * Returns detailed status of all components
   */
  async getBookingSupportHealth(req, res) {
    try {
      const health = this.bookingSupportAgent.checkHealth();

      const statusCode = health.status === "ready" ? 200 : 503;

      res.status(statusCode).json({
        success: health.status === "ready",
        ...health,
      });
    } catch (error) {
      logger.error("Booking support health check error:", error);
      res.status(503).json({
        success: false,
        status: "error",
        error: error.message,
      });
    }
  }

  /**
   * ========================================================================
   * GET /api/agents/user/booking-support/stats
   * ========================================================================
   *
   * Get statistics about booking support agent
   * Useful for monitoring and analytics dashboards
   */
  async getBookingSupportStats(req, res) {
    try {
      const stats = this.bookingSupportAgent.getStats();

      res.json({
        success: true,
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Booking support stats error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get booking support stats",
        message: error.message,
      });
    }
  }

  /**
   * ========================================================================
   * GET /api/agents/user/faq-support (LEGACY - DEPRECATED)
   * ========================================================================
   *
   * Legacy endpoint - redirects to new chat endpoint
   * Kept for backward compatibility
   *
   * @deprecated Use POST /api/agents/user/booking-support/chat instead
   */
  async getFAQSupport(req, res) {
    try {
      const { question, language = "en" } = req.query;

      if (!question) {
        return res.status(400).json({
          success: false,
          error: "Question parameter is required",
          hint: "Use POST /api/agents/user/booking-support/chat for the new chat API",
        });
      }

      logger.warn(
        "⚠️ Legacy FAQ endpoint called - redirecting to new chat endpoint"
      );

      // Forward to new chat endpoint
      const response = await this.bookingSupportAgent.chat(question, "legacy");

      res.json({
        success: true,
        question,
        answer: response.message,
        language: response.metadata.language.detected,
        confidence: 0.8, // Legacy field
        note: "This endpoint is deprecated. Use POST /api/agents/user/booking-support/chat",
      });
    } catch (error) {
      logger.error("FAQ support error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process FAQ request",
        message: error.message,
      });
    }
  }

  /**
   * ========================================================================
   * POST /api/agents/user/event-request
   * ========================================================================
   *
   * Event request assistant (Phase 1.3 - Future)
   * Placeholder for now
   */
  async processEventRequest(req, res) {
    try {
      const { requestText, userId } = req.body;

      if (!requestText) {
        return res.status(400).json({
          success: false,
          error: "Request text is required",
        });
      }

      logger.agent(
        "event-request-assistant",
        "processing request",
        `user: ${userId}`
      );

      // Placeholder - Phase 1.3
      res.json({
        success: true,
        message: "Event request processing endpoint (Phase 1.3)",
        request: requestText,
        status: "pending_implementation",
      });
    } catch (error) {
      logger.error("Event request error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process event request",
        message: error.message,
      });
    }
  }

  // ========================================================================
  // ORGANIZER AGENTS (Placeholders for future phases)
  // ========================================================================

  /**
   * POST /api/agents/organizer/plan-event
   * Event planning agent (Phase 2.1)
   */
  async planEvent(req, res) {
    try {
      const { eventDetails, organizerId } = req.body;

      logger.agent(
        "planning-agent",
        "planning event",
        `organizer: ${organizerId}`
      );

      // Placeholder - Phase 2.1
      res.json({
        success: true,
        organizerId,
        eventDetails,
        plan: {
          status: "pending_implementation",
          phase: "2.1",
          timeline: "TBD",
          budget: "TBD",
          tasks: [],
        },
      });
    } catch (error) {
      logger.error("Plan event error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to plan event",
        message: error.message,
      });
    }
  }

  /**
   * GET /api/agents/organizer/dashboard/:organizerId
   * Dashboard assistant (Phase 2.3)
   */
  async getOrganizerDashboard(req, res) {
    try {
      const { organizerId } = req.params;

      logger.agent(
        "dashboard-assistant",
        "fetching dashboard",
        `organizer: ${organizerId}`
      );

      // Placeholder - Phase 2.3
      res.json({
        success: true,
        organizerId,
        dashboard: {
          status: "pending_implementation",
          phase: "2.3",
          upcoming_events: 0,
          total_bookings: 0,
          revenue: 0,
        },
      });
    } catch (error) {
      logger.error("Organizer dashboard error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch dashboard data",
        message: error.message,
      });
    }
  }

  /**
   * POST /api/agents/organizer/negotiate
   * Negotiation agent (Phase 2.2)
   */
  async negotiateBooking(req, res) {
    try {
      const { bookingId, offer, userId } = req.body;

      logger.agent(
        "negotiation-agent",
        "starting negotiation",
        `booking: ${bookingId}`
      );

      // Placeholder - Phase 2.2
      res.json({
        success: true,
        bookingId,
        status: "pending_implementation",
        phase: "2.2",
        initial_offer: offer,
        counter_offer: null,
      });
    } catch (error) {
      logger.error("Negotiation error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process negotiation",
        message: error.message,
      });
    }
  }

  // ========================================================================
  // ADMIN AGENTS (Placeholders for future phases)
  // ========================================================================

  /**
   * GET /api/agents/admin/analytics
   * Analytics agent (Phase 3.2)
   */
  async getAnalytics(req, res) {
    try {
      logger.agent("analytics-agent", "generating analytics", "");

      // Placeholder - Phase 3.2
      res.json({
        success: true,
        status: "pending_implementation",
        phase: "3.2",
        analytics: {
          platform_overview: {},
          revenue_analytics: {},
        },
      });
    } catch (error) {
      logger.error("Analytics error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate analytics",
        message: error.message,
      });
    }
  }

  /**
   * POST /api/agents/admin/sentiment
   * Sentiment analysis agent (Phase 3.3)
   */
  async analyzeSentiment(req, res) {
    try {
      const { reviewId, reviewText } = req.body;

      logger.agent(
        "feedback-sentiment",
        "analyzing sentiment",
        `review: ${reviewId}`
      );

      // Placeholder - Phase 3.3
      res.json({
        success: true,
        reviewId,
        status: "pending_implementation",
        phase: "3.3",
        sentiment_score: null,
        sentiment: null,
      });
    } catch (error) {
      logger.error("Sentiment analysis error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to analyze sentiment",
        message: error.message,
      });
    }
  }

  /**
   * POST /api/agents/admin/fraud-check
   * Fraud detection agent (Phase 3.1)
   */
  async checkFraud(req, res) {
    try {
      const { bookingId } = req.body;

      logger.agent(
        "fraud-detection",
        "checking fraud",
        `booking: ${bookingId}`
      );

      // Placeholder - Phase 3.1
      res.json({
        success: true,
        bookingId,
        status: "pending_implementation",
        phase: "3.1",
        fraudCheck: {
          riskScore: null,
          status: "not_checked",
        },
      });
    } catch (error) {
      logger.error("Fraud check error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check fraud",
        message: error.message,
      });
    }
  }

  // ========================================================================
  // SYSTEM ROUTES
  // ========================================================================

  /**
   * GET /api/agents/health
   * Overall system health check
   * Called by Backend to verify AI service is running
   */
  async getHealth(req, res) {
    try {
      // Check booking support agent specifically
      let bookingSupportStatus = "unknown";
      try {
        const health = this.bookingSupportAgent.checkHealth();
        bookingSupportStatus = health.status;
      } catch (error) {
        bookingSupportStatus = "error";
      }

      const isHealthy =
        bookingSupportStatus === "ready" ||
        bookingSupportStatus === "not_initialized";

      res.status(isHealthy ? 200 : 503).json({
        success: true,
        status: isHealthy ? "healthy" : "degraded",
        service: "AI Agent Service",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        components: {
          bookingSupport: bookingSupportStatus,
        },
      });
    } catch (error) {
      logger.error("Health check error:", error);
      res.status(503).json({
        success: false,
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * GET /api/agents/status
   * Detailed system status with all agents
   */
  async getSystemStatus(req, res) {
    try {
      res.json({
        success: true,
        system: "Eventa AI Agent System",
        status: "operational",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        phases: {
          current: "Phase 1.2 - Booking Support Agent",
          completed: ["Phase 1.1 - Event Recommendation"],
          inProgress: ["Phase 1.2 - Booking Support Agent"],
          upcoming: [
            "Phase 1.3 - Event Request Assistant",
            "Phase 2.x - Organizer Agents",
            "Phase 3.x - Admin Agents",
          ],
        },
        agents: {
          user: [
            { name: "event-recommendation", status: "active", phase: "1.1" },
            { name: "booking-support-agent", status: "active", phase: "1.2" },
            {
              name: "event-request-assistant",
              status: "planned",
              phase: "1.3",
            },
          ],
          organizer: [
            { name: "planning-agent", status: "planned", phase: "2.1" },
            { name: "negotiation-agent", status: "planned", phase: "2.2" },
            { name: "dashboard-assistant", status: "planned", phase: "2.3" },
          ],
          admin: [
            { name: "fraud-detection", status: "planned", phase: "3.1" },
            { name: "analytics-agent", status: "planned", phase: "3.2" },
            { name: "feedback-sentiment", status: "planned", phase: "3.3" },
          ],
        },
      });
    } catch (error) {
      logger.error("System status error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * GET /api/agents/list
   * List all available agents
   */
  async listAgents(req, res) {
    try {
      res.json({
        success: true,
        agents: [
          {
            name: "event-recommendation",
            type: "user",
            status: "active",
            phase: "1.1",
            description: "Recommends events based on user preferences",
          },
          {
            name: "booking-support-agent",
            type: "user",
            status: "active",
            phase: "1.2",
            description: "24/7 FAQ support with multilingual capabilities",
          },
          {
            name: "event-request-assistant",
            type: "user",
            status: "planned",
            phase: "1.3",
            description: "Helps users create event requests",
          },
          {
            name: "planning-agent",
            type: "organizer",
            status: "planned",
            phase: "2.1",
            description: "Automated event planning assistance",
          },
          {
            name: "negotiation-agent",
            type: "organizer",
            status: "planned",
            phase: "2.2",
            description: "Price negotiation facilitation",
          },
          {
            name: "dashboard-assistant",
            type: "organizer",
            status: "planned",
            phase: "2.3",
            description: "Natural language dashboard queries",
          },
          {
            name: "fraud-detection",
            type: "admin",
            status: "planned",
            phase: "3.1",
            description: "Anomaly and fraud detection",
          },
          {
            name: "analytics-agent",
            type: "admin",
            status: "planned",
            phase: "3.2",
            description: "Platform analytics and insights",
          },
          {
            name: "feedback-sentiment",
            type: "admin",
            status: "planned",
            phase: "3.3",
            description: "Review sentiment analysis",
          },
        ],
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("List agents error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new AgentController();
