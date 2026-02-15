const logger = require("../../config/logger");
const EventRecommendationAgent = require("../../agents/user-agents/event-recommendation");
const BookingSupportAgent = require("../../agents/user-agents/booking-support-agent");
const EventRequestAIAgent = require("../../agents/user-agents/event-request-assistant");
const NegotiationAgent = require("../../agents/organizer-agents/negotiation-agent");
const PlanningAgent = require("../../agents/organizer-agents/planning-agent");

/**
 * Base controller with common response methods
 */
class BaseController {
  sendSuccess(res, data, status = 200) {
    res.status(status).json({ success: true, ...data });
  }

  sendError(res, error, status = 500, details = null) {
    logger.error(error.message || error, error.agent || null);
    const response = {
      success: false,
      error: error.message || "Internal Server Error",
    };
    if (details) response.details = details;
    if (process.env.NODE_ENV === "development") response.stack = error.stack;
    res.status(status).json(response);
  }
}

class AgentController extends BaseController {
  constructor() {
    super();
    this.bookingSupportAgent = BookingSupportAgent;
    this.negotiationAgent = null;
    this.planningAgent = null;
    this.initialized = false;
  }

  // ==================== INITIALIZATION ====================
  initialize = async () => {
    if (this.initialized) {
      logger.info("Agent controller already initialized");
      return;
    }

    try {
      logger.info("Initializing AI agents...");

      await this.bookingSupportAgent.initialize();

      this.negotiationAgent = new NegotiationAgent();
      await this.negotiationAgent.initialize();

      this.planningAgent = new PlanningAgent();
      await this.planningAgent.initialize();

      this.initialized = true;
      logger.success("✅ All AI agents initialized successfully");
    } catch (error) {
      logger.error("❌ Error initializing agents:", error);
      throw error;
    }
  };

  // ==================== USER AGENTS ====================

  // Event Request Agent
  processEventRequest = async (req, res) => {
    try {
      console.log(
        "📥 AI Agent - Full request body:",
        JSON.stringify(req.body, null, 2)
      );

      const { userId, naturalLanguage, requestText, structuredData } = req.body;
      const userRequestText = naturalLanguage || requestText;

      console.log("📥 AI Agent - Extracted:", {
        userId,
        naturalLanguage: naturalLanguage?.substring(0, 50),
        requestText: requestText?.substring(0, 50),
        userRequestText: userRequestText?.substring(0, 50),
      });

      if (!userId) {
        return this.sendError(res, new Error("userId is required"), 400, {
          receivedFields: Object.keys(req.body),
        });
      }

      if (!userRequestText) {
        return this.sendError(
          res,
          new Error(
            "Either naturalLanguage/requestText or structuredData with eventType is required"
          ),
          400,
          {
            help: "Send either naturalLanguage or structuredData.eventType",
            received: req.body,
          }
        );
      }

      console.log(
        "🤖 AI Agent - Processing text:",
        userRequestText.substring(0, 100) + "..."
      );

      const agent = new EventRequestAIAgent();
      const result = await agent.processRequest(userRequestText, userId);

      if (!result.success) {
        console.error("⚠️ AI processing failed, returning fallback");
        const fallback = this.getFallbackResponse(userId, userRequestText);
        return this.sendSuccess(res, fallback);
      }

      console.log(
        `✅ AI processed. Event type: ${result.data.extractedEntities?.eventType}`
      );
      console.log(`✅ Budget: ${result.data.extractedEntities?.budget}`);
      console.log(
        `✅ Location: ${result.data.extractedEntities?.locations?.[0]}`
      );
      console.log(`✅ Guests: ${result.data.extractedEntities?.guests}`);
      console.log(
        `✅ Organizers matched: ${result.data.matchedOrganizers?.length || 0}`
      );

      this.sendSuccess(res, {
        userId,
        extractedEntities: result.data.extractedEntities || {},
        matchedOrganizers: result.data.matchedOrganizers || [],
        budgetAnalysis: result.data.budgetAnalysis || {},
        aiSuggestions: result.data.aiSuggestions || {},
        timestamp: new Date().toISOString(),
        agentVersion: "1.0.0",
      });
    } catch (error) {
      console.error("🔥 AI Agent - Unhandled error:", error);
      const fallback = this.getFallbackResponse(
        req.body?.userId || "unknown",
        req.body?.naturalLanguage || req.body?.requestText || "Event request"
      );
      this.sendSuccess(res, fallback);
    }
  };

  getFallbackResponse = (userId, userRequest) => {
    const lowerText = (userRequest || "").toLowerCase();
    let eventType = "general";
    if (lowerText.includes("wedding")) eventType = "wedding";
    else if (lowerText.includes("birthday")) eventType = "birthday";
    else if (lowerText.includes("corporate")) eventType = "corporate";
    else if (lowerText.includes("conference")) eventType = "conference";
    else if (lowerText.includes("party")) eventType = "party";

    let location = "unknown";
    const locations = [
      "kathmandu",
      "pokhara",
      "chitwan",
      "lalitpur",
      "bhaktapur",
    ];
    locations.forEach((loc) => {
      if (lowerText.includes(loc)) location = loc;
    });

    const budgetMatch = userRequest.match(/\b(\d{4,})\b/);
    const budget = budgetMatch ? parseInt(budgetMatch[1]) : 0;

    return {
      userId,
      extractedEntities: {
        eventType,
        locations: [location],
        budget,
        description: userRequest,
      },
      matchedOrganizers: [
        {
          id: "fallback_org_1",
          name: `${
            eventType.charAt(0).toUpperCase() + eventType.slice(1)
          } Specialists`,
          matchPercentage: 75,
          expertise: [eventType],
          location: location,
          rating: 4.3,
          priceRange: [budget * 0.7 || 100000, budget * 1.3 || 500000],
        },
      ],
      budgetAnalysis: {
        userBudget: budget,
        industryAverage: budget * 1.2 || 0,
        feasibility: budget > 0 ? "good" : "unknown",
        recommendedBudget: budget || 0,
      },
      aiSuggestions: {
        budget: budget > 0 ? "Budget specified" : "Consider adding a budget",
        location:
          location !== "unknown"
            ? `Great choice of ${location}`
            : "Add location for better matches",
      },
      timestamp: new Date().toISOString(),
      agentVersion: "1.0.0-fallback",
      note: "Using rule-based extraction (OpenAI unavailable)",
    };
  };

  getEventSuggestions = async (req, res) => {
    try {
      const { eventType, budget, location, date } = req.query;

      logger.agent(
        "event-request-assistant",
        "Getting event suggestions for:",
        { eventType, location }
      );

      const entities = {
        eventType: eventType || "general",
        locations: location ? [location] : [],
        budget: budget ? parseFloat(budget) : null,
        date: date || null,
        guests: null,
        theme: "",
        requirements: "",
        description: `${eventType} event in ${location}`,
      };

      const agent = new EventRequestAIAgent();
      const matchedOrganizers = await agent.findBestOrganizers(entities, []);

      this.sendSuccess(res, {
        matchedOrganizers,
        query: { eventType, location, budget, date },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Event suggestions error:", error.message);
      this.sendError(res, error, 500, "Failed to get event suggestions");
    }
  };

  postRecommendations = async (req, res) => {
    try {
      const { userId, limit = 10, userContext, candidateEvents } = req.body;

      if (!userId) {
        return this.sendError(
          res,
          new Error("User ID is required in request body"),
          400
        );
      }

      logger.agent("event-recommendation", "processing", `user: ${userId}`);
      const agent = new EventRecommendationAgent();
      const recommendations = await agent.getRecommendations(
        userId,
        parseInt(limit),
        userContext,
        candidateEvents
      );

      logger.info(
        `Generated ${recommendations.length} recommendations for user ${userId}`
      );

      this.sendSuccess(res, {
        recommendations: recommendations,
        count: recommendations.length,
        generated_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("AI Recommendation error:", error);
      this.sendError(res, error, 500, "Failed to generate recommendations");
    }
  };

  // Booking Support Agent
  chatBookingSupport = async (req, res) => {
    const startTime = Date.now();
    const userIdentifier = req.body.userId || req.body.sessionId || "anonymous";

    try {
      const { message } = req.body;
      if (
        !message ||
        typeof message !== "string" ||
        message.trim().length === 0
      ) {
        return this.sendError(
          res,
          new Error("Message is required and must be a non-empty string"),
          400
        );
      }

      logger.agent(
        "booking-support",
        "received query",
        `[${userIdentifier}]: ${message.substring(0, 50)}...`
      );

      const agentHealth = this.bookingSupportAgent.checkHealth();
      if (agentHealth.status === "not_initialized") {
        logger.info("Agent not initialized, initializing now...");
        await this.bookingSupportAgent.initialize();
      }

      const response = await this.bookingSupportAgent.chat(
        message,
        userIdentifier
      );
      logger.performance(
        "Booking support response",
        startTime,
        "booking-support"
      );
      this.sendSuccess(res, response);
    } catch (error) {
      logger.performance("Booking support error", startTime, "booking-support");
      logger.error(`Booking support error for ${userIdentifier}:`, error);
      this.sendError(
        res,
        error,
        500,
        "Failed to process booking support request"
      );
    }
  };

  clearChatHistory = async (req, res) => {
    try {
      const { userId, sessionId } = req.body;
      const userIdentifier = userId || sessionId;
      if (!userIdentifier) {
        return this.sendError(
          res,
          new Error("userId or sessionId is required"),
          400
        );
      }

      logger.agent(
        "booking-support",
        "clearing history",
        `user: ${userIdentifier}`
      );
      const result =
        this.bookingSupportAgent.clearConversationHistory(userIdentifier);
      this.sendSuccess(res, result);
    } catch (error) {
      logger.error("Clear chat history error:", error);
      this.sendError(res, error, 500, "Failed to clear chat history");
    }
  };

  getBookingSupportHealth = async (req, res) => {
    try {
      const health = this.bookingSupportAgent.checkHealth();
      const statusCode = health.status === "ready" ? 200 : 503;
      res
        .status(statusCode)
        .json({ success: health.status === "ready", ...health });
    } catch (error) {
      logger.error("Booking support health check error:", error);
      this.sendError(res, error, 503);
    }
  };

  getBookingSupportStats = async (req, res) => {
    try {
      const stats = this.bookingSupportAgent.getStats();
      this.sendSuccess(res, { stats, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error("Booking support stats error:", error);
      this.sendError(res, error, 500, "Failed to get booking support stats");
    }
  };

  getFAQSupport = async (req, res) => {
    try {
      const { question } = req.query;
      if (!question) {
        return this.sendError(
          res,
          new Error("Question parameter is required"),
          400,
          {
            hint: "Use POST /api/agents/user/booking-support/chat for the new chat API",
          }
        );
      }

      logger.warn(
        "Legacy FAQ endpoint called - redirecting to new chat endpoint"
      );
      const response = await this.bookingSupportAgent.chat(question, "legacy");

      this.sendSuccess(res, {
        question,
        answer: response.message,
        language: response.metadata.language.detected,
        confidence: 0.8,
        note: "This endpoint is deprecated. Use POST /api/agents/user/booking-support/chat",
      });
    } catch (error) {
      logger.error("FAQ support error:", error);
      this.sendError(res, error, 500, "Failed to process FAQ request");
    }
  };

  // ==================== ORGANIZER AGENTS ====================

  getPlanningSuggestions = async (req, res) => {
    try {
      const eventData = req.body;
      if (!eventData || !eventData.event_name || !eventData.category) {
        return this.sendError(
          res,
          new Error("Missing required fields: event_name, category"),
          400,
          { received: eventData }
        );
      }

      logger.agent(
        "planning-agent",
        "Received planning request",
        `event: ${eventData.event_name}`
      );

      // Ensure agent is initialized
      if (!this.planningAgent) {
        logger.warn("Planning agent not initialized, initializing now...");
        this.planningAgent = new PlanningAgent();
        await this.planningAgent.initialize();
      }

      const result = await this.planningAgent.optimizeEventCreation(eventData);

      if (!result.success) {
        return this.sendError(
          res,
          new Error(result.error || "Planning optimization failed"),
          500
        );
      }

      this.sendSuccess(res, {
        data: result.data,
        message: "Event planning suggestions generated successfully",
        timestamp: new Date().toISOString(),
        agentVersion: "3.0.0",
      });
    } catch (error) {
      logger.error("Planning suggestions error:", error.message);
      this.sendError(res, error, 500);
    }
  };

  planEvent = async (req, res) => {
    try {
      const { eventDetails, organizerId } = req.body;
      logger.agent(
        "planning-agent",
        "Legacy planEvent called",
        `organizer: ${organizerId}`
      );

      // Ensure agent is initialized
      if (!this.planningAgent) {
        logger.warn("Planning agent not initialized, initializing now...");
        this.planningAgent = new PlanningAgent();
        await this.planningAgent.initialize();
      }

      const result = await this.planningAgent.optimizeEventCreation(
        eventDetails
      );

      if (!result.success) {
        return this.sendError(
          res,
          new Error(result.error || "Planning failed"),
          500
        );
      }

      this.sendSuccess(res, {
        organizerId,
        eventDetails,
        plan: {
          status: "optimized",
          phase: "3.0",
          timeline: result.data.suggestions.dateTime.suggestedDayOfWeek,
          budget: {
            suggested: result.data.suggestions.price.suggestedPrice,
            range: result.data.suggestions.price.priceRange,
          },
          tags: result.data.suggestions.tags.suggestedTags,
          totalSlots: result.data.suggestions.totalSlots.suggestedSlots,
          recommendations: result.data.recommendations,
          confidence: result.data.confidence.overall,
        },
      });
    } catch (error) {
      logger.error("Plan event error:", error);
      this.sendError(res, error, 500, "Failed to plan event");
    }
  };

  getOrganizerDashboard = async (req, res) => {
    try {
      const { organizerId } = req.params;
      logger.agent(
        "dashboard-assistant",
        "fetching dashboard",
        `organizer: ${organizerId}`
      );
      this.sendSuccess(res, {
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
      this.sendError(res, error, 500, "Failed to fetch dashboard data");
    }
  };

  negotiateBooking = async (req, res) => {
    try {
      const { bookingId, offer, userId } = req.body;
      logger.agent(
        "negotiation-agent",
        "starting negotiation",
        `booking: ${bookingId}`
      );
      this.sendSuccess(res, {
        bookingId,
        status: "pending_implementation",
        phase: "2.2",
        initial_offer: offer,
        counter_offer: null,
      });
    } catch (error) {
      logger.error("Negotiation error:", error);
      this.sendError(res, error, 500, "Failed to process negotiation");
    }
  };

  // ==================== NEGOTIATION AGENT ====================

  startEventRequestNegotiation = async (req, res) => {
    try {
      const { eventRequestId, organizerId, organizerOffer, organizerMessage } =
        req.body;
      console.log("🤖 Starting negotiation for event request:", eventRequestId);

      if (!this.negotiationAgent) {
        logger.warn("Negotiation agent not initialized, initializing now...");
        this.negotiationAgent = new NegotiationAgent();
        await this.negotiationAgent.initialize();
      }

      const result = await this.negotiationAgent.startEventRequestNegotiation(
        eventRequestId,
        organizerId,
        organizerOffer,
        organizerMessage
      );

      this.sendSuccess(res, result);
    } catch (error) {
      console.error("Failed to start negotiation:", error.message);
      this.sendError(res, error, 500);
    }
  };

  processUserCounterOffer = async (req, res) => {
    try {
      const { negotiationId, userOffer, userMessage } = req.body;
      const userId = req.user?._id || "user_" + Date.now();

      console.log("🤖 Processing user counter:", { negotiationId, userOffer });

      if (!this.negotiationAgent) {
        logger.warn("Negotiation agent not initialized, initializing now...");
        this.negotiationAgent = new NegotiationAgent();
        await this.negotiationAgent.initialize();
      }

      const result = await this.negotiationAgent.processUserCounter(
        negotiationId,
        userOffer,
        userMessage
      );

      this.sendSuccess(res, result);
    } catch (error) {
      console.error("Failed to process counter:", error.message);
      this.sendError(res, error, 500);
    }
  };

  getNegotiationStatus = async (req, res) => {
    try {
      const { negotiationId } = req.params;

      if (!this.negotiationAgent) {
        logger.warn("Negotiation agent not initialized, initializing now...");
        this.negotiationAgent = new NegotiationAgent();
        await this.negotiationAgent.initialize();
      }

      const result = await this.negotiationAgent.getNegotiationStatus(
        negotiationId
      );
      this.sendSuccess(res, result);
    } catch (error) {
      console.error("Failed to get status:", error.message);
      this.sendError(res, error, 500);
    }
  };

  acceptNegotiationOffer = async (req, res) => {
    try {
      const { negotiationId } = req.params;
      const userId = req.user?._id;

      if (!this.negotiationAgent) {
        logger.warn("Negotiation agent not initialized, initializing now...");
        this.negotiationAgent = new NegotiationAgent();
        await this.negotiationAgent.initialize();
      }

      const result = await this.negotiationAgent.acceptOffer(
        negotiationId,
        userId
      );
      this.sendSuccess(res, result);
    } catch (error) {
      console.error("Failed to accept offer:", error.message);
      this.sendError(res, error, 500);
    }
  };

  getEventPriceAnalysis = async (req, res) => {
    try {
      const { eventType, location, budget } = req.query;

      if (!this.negotiationAgent) {
        logger.warn("Negotiation agent not initialized, initializing now...");
        this.negotiationAgent = new NegotiationAgent();
        await this.negotiationAgent.initialize();
      }

      const result = await this.negotiationAgent.getPriceAnalysis(
        eventType,
        location,
        parseFloat(budget)
      );

      this.sendSuccess(res, result);
    } catch (error) {
      console.error("Failed to analyze price:", error.message);
      this.sendError(res, error, 500);
    }
  };

  // ==================== ADMIN AGENTS ====================

  getAnalytics = async (req, res) => {
    try {
      logger.agent("analytics-agent", "generating analytics", "");
      this.sendSuccess(res, {
        status: "pending_implementation",
        phase: "3.2",
        analytics: { platform_overview: {}, revenue_analytics: {} },
      });
    } catch (error) {
      logger.error("Analytics error:", error);
      this.sendError(res, error, 500, "Failed to generate analytics");
    }
  };

  analyzeSentiment = async (req, res) => {
    try {
      const { reviewId, reviewText } = req.body;
      logger.agent(
        "feedback-sentiment",
        "analyzing sentiment",
        `review: ${reviewId}`
      );
      this.sendSuccess(res, {
        reviewId,
        status: "pending_implementation",
        phase: "3.3",
        sentiment_score: null,
        sentiment: null,
      });
    } catch (error) {
      logger.error("Sentiment analysis error:", error);
      this.sendError(res, error, 500, "Failed to analyze sentiment");
    }
  };

  checkFraud = async (req, res) => {
    try {
      const { bookingId } = req.body;
      logger.agent(
        "fraud-detection",
        "checking fraud",
        `booking: ${bookingId}`
      );
      this.sendSuccess(res, {
        bookingId,
        status: "pending_implementation",
        phase: "3.1",
        fraudCheck: { riskScore: null, status: "not_checked" },
      });
    } catch (error) {
      logger.error("Fraud check error:", error);
      this.sendError(res, error, 500, "Failed to check fraud");
    }
  };

  // ==================== SYSTEM STATUS & HEALTH ====================

  getHealth = async (req, res) => {
    try {
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
          negotiation: this.negotiationAgent ? "ready" : "not_initialized",
          planning: this.planningAgent ? "ready" : "not_initialized",
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
  };

  getSystemStatus = async (req, res) => {
    try {
      this.sendSuccess(res, {
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
            { name: "planning-agent", status: "active", phase: "2.1" },
            { name: "negotiation-agent", status: "active", phase: "2.2" },
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
      this.sendError(res, error, 500);
    }
  };

  listAgents = async (req, res) => {
    try {
      this.sendSuccess(res, {
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
            status: this.planningAgent ? "active" : "not_initialized",
            phase: "2.1",
            description: "Automated event planning assistance",
          },
          {
            name: "negotiation-agent",
            type: "organizer",
            status: this.negotiationAgent ? "active" : "not_initialized",
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
      this.sendError(res, error, 500);
    }
  };
}

module.exports = new AgentController();
