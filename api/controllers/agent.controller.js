const logger = require("../../config/logger");
const EventRecommendationAgent = require("../../agents/user-agents/event-recommendation");
const BookingSupportAgent = require("../../agents/user-agents/booking-support-agent");
const EventRequestAIAgent = require("../../agents/user-agents/event-request-assistant");
const NegotiationAgent = require("../../agents/organizer-agents/negotiation-agent");
const PlanningAgent = require("../../agents/organizer-agents/planning-agent");

class AgentController {
  constructor() {
    this.bookingSupportAgent = BookingSupportAgent;
    this.negotiationAgent = null;
    this.planningAgent = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      logger.info("Agent controller already initialized");
      return;
    }

    try {
      logger.info("Initializing AI agents...");

      // Initialize BookingSupport Agent (singleton)
      await this.bookingSupportAgent.initialize();

      // Create and initialize Negotiation Agent
      this.negotiationAgent = new NegotiationAgent();
      await this.negotiationAgent.initialize();

      // Create and initialize Planning Agent
      this.planningAgent = new PlanningAgent();
      await this.planningAgent.initialize();

      this.initialized = true;
      logger.info("✅ All AI agents initialized successfully");
    } catch (error) {
      logger.error("❌ Error initializing agents:", error);
      throw error;
    }
  }

  // ==========================================================
  // ==================== USER AGENTS =========================
  // ==================== Event Request AGENT =================
  async processEventRequest(req, res) {
    try {
      console.log(
        "📥 AI Agent - Full request body:",
        JSON.stringify(req.body, null, 2)
      );

      // Accept BOTH parameter names for compatibility
      const {
        userId,
        naturalLanguage, // From Backend
        requestText, // Alternative parameter name
        structuredData, // Optional - for fallback or additional context
      } = req.body;

      // Use naturalLanguage if provided, otherwise requestText
      const userRequestText = naturalLanguage || requestText;

      console.log("📥 AI Agent - Extracted:", {
        userId,
        naturalLanguage: naturalLanguage?.substring(0, 50),
        requestText: requestText?.substring(0, 50),
        userRequestText: userRequestText?.substring(0, 50),
      });

      // Validate required fields
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "userId is required",
          receivedFields: Object.keys(req.body),
        });
      }

      if (!userRequestText) {
        return res.status(400).json({
          success: false,
          error:
            "Either naturalLanguage/requestText or structuredData with eventType is required",
          help: "Send either naturalLanguage or structuredData.eventType",
          received: req.body,
        });
      }

      console.log(
        "🤖 AI Agent - Processing text:",
        userRequestText.substring(0, 100) + "..."
      );

      // Import and use the agent
      const agent = new EventRequestAIAgent();

      const result = await agent.processRequest(userRequestText, userId);

      if (!result.success) {
        console.error("⚠️ AI processing failed, returning fallback");
        return this.getFallbackResponse(userId, userRequestText);
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

      res.json({
        success: true,
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
      return this.getFallbackResponse(
        req.body?.userId || "unknown",
        req.body?.naturalLanguage || req.body?.requestText || "Event request"
      );
    }
  }

  getFallbackResponse(userId, userRequest) {
    // Simple extraction without OpenAI
    const lowerText = (userRequest || "").toLowerCase();

    // Extract event type
    let eventType = "general";
    if (lowerText.includes("wedding")) eventType = "wedding";
    else if (lowerText.includes("birthday")) eventType = "birthday";
    else if (lowerText.includes("corporate")) eventType = "corporate";
    else if (lowerText.includes("conference")) eventType = "conference";
    else if (lowerText.includes("party")) eventType = "party";

    // Extract location
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

    // Extract budget (simple regex)
    const budgetMatch = userRequest.match(/\b(\d{4,})\b/);
    const budget = budgetMatch ? parseInt(budgetMatch[1]) : 0;

    return {
      success: true,
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
  }

  // ==================== Event Recommendation AGENT ==========
  async getEventSuggestions(req, res) {
    try {
      const { eventType, budget, location, date } = req.query;

      logger.agent(
        "event-request-assistant",
        "Getting event suggestions for:",
        { eventType, location }
      );

      // Create mock entities based on query params
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

      res.json({
        success: true,
        matchedOrganizers,
        query: { eventType, location, budget, date },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Event suggestions error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to get event suggestions",
      });
    }
  }

  async postRecommendations(req, res) {
    try {
      const { userId, limit = 10, userContext, candidateEvents } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "User ID is required in request body",
        });
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

  // ==================== BOOKING SUPPORT AGENT ===============
  async chatBookingSupport(req, res) {
    const startTime = Date.now();

    try {
      const { message, userId, sessionId } = req.body;

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

      const userIdentifier = userId || sessionId || "anonymous";
      logger.agent(
        "booking-support",
        "received query",
        `[${userIdentifier}]: ${message.substring(0, 50)}...`
      );

      const BookingSupportAgent = require("../../agents/user-agents/booking-support-agent");
      const agentHealth = BookingSupportAgent.checkHealth();

      if (agentHealth.status === "not_initialized") {
        logger.info("Agent not initialized, initializing now...");
        await BookingSupportAgent.initialize();
      }

      const response = await BookingSupportAgent.chat(message, userIdentifier);
      const duration = Date.now() - startTime;
      logger.info(
        `Booking support responded in ${duration}ms [${userIdentifier}]`
      );
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
        "Legacy FAQ endpoint called - redirecting to new chat endpoint"
      );
      const response = await this.bookingSupportAgent.chat(question, "legacy");

      res.json({
        success: true,
        question,
        answer: response.message,
        language: response.metadata.language.detected,
        confidence: 0.8,
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

  // ==========================================================
  // ==================== ORGANIZER AGENTS ====================
  // ==================== Event Planning Agent ================
  async getPlanningSuggestions(req, res) {
    try {
      const eventData = req.body;

      // Basic validation
      if (!eventData || !eventData.event_name || !eventData.category) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: event_name, category",
          received: eventData,
        });
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
        return res.status(500).json({
          success: false,
          error: result.error || "Planning optimization failed",
        });
      }

      res.json({
        success: true,
        data: result.data,
        message: "Event planning suggestions generated successfully",
        timestamp: new Date().toISOString(),
        agentVersion: "3.0.0",
      });
    } catch (error) {
      logger.error("Planning suggestions error:", error.message);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }

  async planEvent(req, res) {
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

      // Forward to the new planning agent
      const result = await this.planningAgent.optimizeEventCreation(
        eventDetails
      );

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error || "Planning failed",
        });
      }

      // Format response to match legacy expectations if needed
      res.json({
        success: true,
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
      res.status(500).json({
        success: false,
        error: "Failed to plan event",
        message: error.message,
      });
    }
  }

  // ==================== Dashboard assistant Agent ===========
  async getOrganizerDashboard(req, res) {
    try {
      const { organizerId } = req.params;
      logger.agent(
        "dashboard-assistant",
        "fetching dashboard",
        `organizer: ${organizerId}`
      );
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

  async negotiateBooking(req, res) {
    try {
      const { bookingId, offer, userId } = req.body;
      logger.agent(
        "negotiation-agent",
        "starting negotiation",
        `booking: ${bookingId}`
      );
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

  // ==================== NEGOTIATION AGENT FUNCTIONS ====================

  async startEventRequestNegotiation(req, res) {
    try {
      const { eventRequestId, organizerId, organizerOffer, organizerMessage } =
        req.body;

      console.log("🤖 Starting negotiation for event request:", eventRequestId);

      // Ensure agent is initialized
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

      res.json(result);
    } catch (error) {
      console.error("Failed to start negotiation:", error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async processUserCounterOffer(req, res) {
    try {
      const { negotiationId, userOffer, userMessage } = req.body;
      const userId = req.user?._id || "user_" + Date.now(); // From auth

      console.log("🤖 Processing user counter:", { negotiationId, userOffer });

      // Ensure agent is initialized
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

      res.json(result);
    } catch (error) {
      console.error("Failed to process counter:", error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getNegotiationStatus(req, res) {
    try {
      const { negotiationId } = req.params;

      // Ensure agent is initialized
      if (!this.negotiationAgent) {
        logger.warn("Negotiation agent not initialized, initializing now...");
        this.negotiationAgent = new NegotiationAgent();
        await this.negotiationAgent.initialize();
      }

      const result = await this.negotiationAgent.getNegotiationStatus(
        negotiationId
      );

      res.json(result);
    } catch (error) {
      console.error("Failed to get status:", error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async acceptNegotiationOffer(req, res) {
    try {
      const { negotiationId } = req.params;
      const userId = req.user?._id;

      // Ensure agent is initialized
      if (!this.negotiationAgent) {
        logger.warn("Negotiation agent not initialized, initializing now...");
        this.negotiationAgent = new NegotiationAgent();
        await this.negotiationAgent.initialize();
      }

      const result = await this.negotiationAgent.acceptOffer(
        negotiationId,
        userId
      );

      res.json(result);
    } catch (error) {
      console.error("Failed to accept offer:", error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getEventPriceAnalysis(req, res) {
    try {
      const { eventType, location, budget } = req.query;

      // Ensure agent is initialized
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

      res.json(result);
    } catch (error) {
      console.error("Failed to analyze price:", error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ======================================================
  // ==================== ADMIN AGENTS ====================

  async getAnalytics(req, res) {
    try {
      logger.agent("analytics-agent", "generating analytics", "");
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

  async analyzeSentiment(req, res) {
    try {
      const { reviewId, reviewText } = req.body;
      logger.agent(
        "feedback-sentiment",
        "analyzing sentiment",
        `review: ${reviewId}`
      );
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

  async checkFraud(req, res) {
    try {
      const { bookingId } = req.body;
      logger.agent(
        "fraud-detection",
        "checking fraud",
        `booking: ${bookingId}`
      );
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

  // ==================== SYSTEM STATUS & HEALTH ====================

  async getHealth(req, res) {
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
  }

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
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

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
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new AgentController();
