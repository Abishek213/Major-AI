const logger = require("../../config/logger");
const EventRecommendationAgent = require("../../agents/user-agents/event-recommendation");
const BookingSupportAgent = require("../../agents/user-agents/booking-support-agent");
const EventRequestAIAgent = require("../../agents/user-agents/event-request-assistant");
const NegotiationAgent = require("../../agents/organizer-agents/negotiation-agent");
const negotiationAgent = new NegotiationAgent();

negotiationAgent.initialize(); // Initialize the negotiation agent when the controller is loaded

class AgentController {
  // ==================== USER AGENTS ====================
  async processEventRequest(req, res) {
    try {
      console.log("📥 AI Agent - Full request body:", JSON.stringify(req.body, null, 2));

      // Accept BOTH parameter names for compatibility
      const {
        userId,
        naturalLanguage,      // From Backend
        requestText,       // Alternative parameter name
        structuredData       // Optional - for fallback or additional context
      } = req.body;

      // Use naturalLanguage if provided, otherwise requestText
      const userRequestText = naturalLanguage || requestText;

      console.log("📥 AI Agent - Extracted:", {
        userId,
        naturalLanguage: naturalLanguage?.substring(0, 50),
        requestText: requestText?.substring(0, 50),
        userRequestText: userRequestText?.substring(0, 50),
        // hasStructuredData: !!structuredData
      });

      // Validate required fields
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "userId is required",
          receivedFields: Object.keys(req.body)
        });
      }

      if (!userRequestText) {
        return res.status(400).json({
          success: false,
          error: "Either naturalLanguage/requestText or structuredData with eventType is required",
          help: "Send either naturalLanguage or structuredData.eventType",
          received: req.body
        });
      }

      // Create the user request text
      // const finalRequestText = userRequestText || 
      //   `I need a ${structuredData.eventType} in ${structuredData.venue || 'somewhere'} with budget ${structuredData.budget || 'unspecified'}. ${structuredData.description || ''}`;

      console.log("🤖 AI Agent - Processing text:", userRequestText.substring(0, 100) + "...");

      // Import and use the agent
      // const EventRequestAIAgent = require("../../agents/user-agents/event-request-assistant");
      const agent = new EventRequestAIAgent();

      const result = await agent.processRequest(userRequestText, userId);

      if (!result.success) {
        console.error("⚠️ AI processing failed, returning fallback");
        return this.getFallbackResponse(userId, userRequestText);
        // Return a fallback response instead of error
        // return res.json({
        //   success: true,
        //   userId,
        //   matchedOrganizers: [],
        //   budgetAnalysis: {
        //     userBudget: structuredData?.budget || 0,
        //     industryAverage: 0,
        //     feasibility: "unknown",
        //     recommendedBudget: structuredData?.budget || 0
        //   },
        //   extractedEntities: {
        //     eventType: structuredData?.eventType || "general",
        //     location: structuredData?.venue || "unknown"
        //   },
        //   aiSuggestions: {},
        //   timestamp: new Date().toISOString(),
        //   agentVersion: "1.0.0-fallback",
        //   note: "AI processing failed, returning fallback"
        // });
      }

      console.log(`✅ AI processed. Event type: ${result.data.extractedEntities?.eventType}`);
      console.log(`✅ Budget: ${result.data.extractedEntities?.budget}`);
      console.log(`✅ Location: ${result.data.extractedEntities?.locations?.[0]}`);
      console.log(`✅ Guests: ${result.data.extractedEntities?.guests}`);
      console.log(`✅ Organizers matched: ${result.data.matchedOrganizers?.length || 0}`);

      res.json({
        success: true,
        userId,
        extractedEntities: result.data.extractedEntities || {},
        matchedOrganizers: result.data.matchedOrganizers || [],
        budgetAnalysis: result.data.budgetAnalysis || {},
        aiSuggestions: result.data.aiSuggestions || {},
        timestamp: new Date().toISOString(),
        agentVersion: "1.0.0"
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
    const locations = ["kathmandu", "pokhara", "chitwan", "lalitpur", "bhaktapur"];
    locations.forEach(loc => {
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
        description: userRequest
      },
      matchedOrganizers: [
        {
          id: "fallback_org_1",
          name: `${eventType.charAt(0).toUpperCase() + eventType.slice(1)} Specialists`,
          matchPercentage: 75,
          expertise: [eventType],
          location: location,
          rating: 4.3,
          priceRange: [budget * 0.7 || 100000, budget * 1.3 || 500000]
        }
      ],
      budgetAnalysis: {
        userBudget: budget,
        industryAverage: budget * 1.2 || 0,
        feasibility: budget > 0 ? "good" : "unknown",
        recommendedBudget: budget || 0
      },
      aiSuggestions: {
        budget: budget > 0 ? "Budget specified" : "Consider adding a budget",
        location: location !== "unknown" ? `Great choice of ${location}` : "Add location for better matches"
      },
      timestamp: new Date().toISOString(),
      agentVersion: "1.0.0-fallback",
      note: "Using rule-based extraction (OpenAI unavailable)"
    };
  }


  async getEventSuggestions(req, res) {
    try {
      const {
        eventType,
        budget,
        location,
        date
      } = req.query;

      logger.agent(
        "event-request-assistant",
        "Getting event suggestions for:",
        { eventType, location }
      );

      // Create mock entities based on query params
      const entities = {
        eventType: eventType || 'general',
        locations: location ? [location] : [],
        budget: budget ? parseFloat(budget) : null,
        date: date || null,
        guests: null,
        theme: '',
        requirements: '',
        description: `${eventType} event in ${location}`
      };

      const agent = new EventRequestAIAgent();
      const matchedOrganizers = await agent.findBestOrganizers(entities, []);

      res.json({
        success: true,
        matchedOrganizers,
        query: { eventType, location, budget, date },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error("Event suggestions error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to get event suggestions"
      });
    }
  }

  // ==================== OTHER AGENT FUNCTIONS ====================

  // Keep all your existing functions but make sure they're properly connected

  async getUserRecommendations(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 10 } = req.query;

      logger.agent(
        "event-recommendation",
        "Fetching recommendations for user:",
        userId
      );

      const agent = new EventRecommendationAgent();
      const recommendations = await agent.getRecommendations(
        userId,
        parseInt(limit)
      );

      logger.success(
        `Generated ${recommendations.length} recommendations for user ${userId}`
      );

      res.json({
        success: true,
        data: recommendations,
        count: recommendations.length,
        generated_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Get recommendations error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to generate recommendations",
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
        });
      }

      logger.agent(
        "booking-support-agent",
        "Processing FAQ question:",
        question
      );

      const agent = new BookingSupportAgent();
      const answer = await agent.getFAQAnswer(question, language);

      res.json({
        success: true,
        question,
        answer,
        language,
        confidence: answer.confidence || 0.8,
      });
    } catch (error) {
      logger.error("FAQ support error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to process FAQ request",
      });
    }
  }

  // async processEventRequest(req, res) {
  //   try {
  //     const { requestText, userId } = req.body;

  //     if (!requestText) {
  //       return res.status(400).json({
  //         success: false,
  //         error: "Request text is required",
  //       });
  //     }

  //     logger.agent(
  //       "event-request-assistant",
  //       "Processing event request from user:",
  //       userId
  //     );

  //     // This will be implemented when event-request-assistant is created
  //     res.json({
  //       success: true,
  //       message: "Event request processing endpoint",
  //       request: requestText,
  //       status: "pending_implementation",
  //     });
  //   } catch (error) {
  //     logger.error("Event request error:", error.message);
  //     res.status(500).json({
  //       success: false,
  //       error: "Failed to process event request",
  //     });
  //   }
  // }

  // ==================== ORGANIZER AGENTS ====================

  async planEvent(req, res) {
    try {
      const { eventDetails, organizerId } = req.body;

      logger.agent(
        "planning-agent",
        "Planning event for organizer:",
        organizerId
      );

      // Placeholder - will be implemented
      res.json({
        success: true,
        organizerId,
        eventDetails,
        plan: {
          timeline: "Pending implementation",
          budget: "Pending implementation",
          tasks: [],
        },
      });
    } catch (error) {
      logger.error("Plan event error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to plan event",
      });
    }
  }

  async getOrganizerDashboard(req, res) {
    try {
      const { organizerId } = req.params;

      logger.agent(
        "dashboard-assistant",
        "Fetching dashboard for organizer:",
        organizerId
      );

      // Placeholder - will be implemented
      res.json({
        success: true,
        organizerId,
        dashboard: {
          upcoming_events: 5,
          total_bookings: 120,
          revenue: 250000,
          performance_metrics: {},
        },
      });
    } catch (error) {
      logger.error("Organizer dashboard error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to fetch dashboard data",
      });
    }
  }

  async negotiateBooking(req, res) {
    try {
      const { bookingId, offer, userId } = req.body;

      logger.agent(
        "negotiation-agent",
        "Starting negotiation for booking:",
        bookingId
      );

      // Placeholder - will be implemented
      res.json({
        success: true,
        bookingId,
        initial_offer: offer,
        counter_offer: offer * 0.9, // 10% discount
        status: "negotiating",
      });
    } catch (error) {
      logger.error("Negotiation error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to process negotiation",
      });
    }
  }

  // ==================== ADMIN AGENTS ====================

  async getAnalytics(req, res) {
    try {
      logger.agent("analytics-agent", "Generating analytics report");

      // Placeholder - will be implemented
      res.json({
        success: true,
        analytics: {
          platform_overview: {
            active_users: 1500,
            total_events: 89,
            bookings_today: 42,
          },
          revenue_analytics: {
            total_revenue: 1250000,
            monthly_growth: 15,
          },
        },
      });
    } catch (error) {
      logger.error("Analytics error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to generate analytics",
      });
    }
  }

  async analyzeSentiment(req, res) {
    try {
      const { reviewId, reviewText } = req.body;

      logger.agent(
        "feedback-sentiment",
        "Analyzing sentiment for review:",
        reviewId
      );

      // Placeholder - will be implemented
      res.json({
        success: true,
        reviewId,
        sentiment_score: 0.8,
        sentiment: "positive",
        detected_issues: [],
      });
    } catch (error) {
      logger.error("Sentiment analysis error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to analyze sentiment",
      });
    }
  }

  async checkFraud(req, res) {
    try {
      const { bookingId } = req.body;

      logger.agent("fraud-detection", "Checking fraud for booking:", bookingId);

      // Placeholder - will be implemented
      res.json({
        success: true,
        bookingId,
        fraudCheck: {
          riskScore: 0.1,
          status: "clean",
          flaggedIssues: [],
        },
      });
    } catch (error) {
      logger.error("Fraud check error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to check fraud",
      });
    }
  }

  // ==================== SYSTEM ROUTES ====================

  async getSystemStatus(req, res) {
    try {
      res.json({
        success: true,
        system: "e-VENTA AI Agent System",
        status: "operational",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        agents: {
          user: [
            "event-recommendation",
            "booking-support-agent",
            "event-request-assistant",
          ],
          organizer: [
            "dashboard-assistant",
            "negotiation-agent",
            "planning-agent",
          ],
          admin: ["analytics-agent", "feedback-sentiment", "fraud-detection"],
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async listAgents(req, res) {
    try {
      // This would fetch from database in production
      res.json({
        success: true,
        agents: [
          { name: "event-recommendation", type: "user", status: "active" },
          { name: "booking-support-agent", type: "user", status: "active" },
          { name: "dashboard-assistant", type: "organizer", status: "active" },
          { name: "analytics-agent", type: "admin", status: "active" },
        ],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }



  // organizer side
  async startEventRequestNegotiation(req, res) {
  try {
    const { eventRequestId, organizerId, organizerOffer, organizerMessage } = req.body;
    
    console.log("🤖 Starting negotiation for event request:", eventRequestId);
    
    const result = await negotiationAgent.startEventRequestNegotiation(
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
      error: error.message
    });
  }
}

// ✅ NEW: User makes counter-offer
async processUserCounterOffer(req, res) {
  try {
    const { negotiationId, userOffer, userMessage } = req.body;
    const userId = req.user?._id || 'user_' + Date.now(); // From auth
    
    console.log("🤖 Processing user counter:", { negotiationId, userOffer });
    
    const result = await negotiationAgent.processUserCounter(
      negotiationId,
      userOffer,
      userMessage
    );
    
    res.json(result);
  } catch (error) {
    console.error("Failed to process counter:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ✅ NEW: Get negotiation status
async getNegotiationStatus(req, res) {
  try {
    const { negotiationId } = req.params;
    
    const result = await negotiationAgent.getNegotiationStatus(negotiationId);
    
    res.json(result);
  } catch (error) {
    console.error("Failed to get status:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ✅ NEW: Accept offer
async acceptNegotiationOffer(req, res) {
  try {
    const { negotiationId } = req.params;
    const userId = req.user?._id;
    
    const result = await negotiationAgent.acceptOffer(negotiationId, userId);
    
    res.json(result);
  } catch (error) {
    console.error("Failed to accept offer:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ✅ NEW: Get price analysis
async getEventPriceAnalysis(req, res) {
  try {
    const { eventType, location, budget } = req.query;
    
    const result = await negotiationAgent.getPriceAnalysis(
      eventType,
      location,
      parseFloat(budget)
    );
    
    res.json(result);
  } catch (Error) {
    console.error("Failed to analyze price:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}


}

module.exports = new AgentController();