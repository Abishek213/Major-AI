const express = require("express");
const router = express.Router();
const agentController = require("../controllers/agent.controller");

// ==================== SYSTEM & GENERAL ROUTES ====================

// GET /api/agents/health
router.get("/health", agentController.getHealth);

// GET /api/agents/status
router.get("/status", agentController.getSystemStatus);

// GET /api/agents/list
router.get("/list", agentController.listAgents);

// ==================== USER AGENT ROUTES ====================

// POST /api/agents/user/recommendations
router.post("/user/recommendations", agentController.postRecommendations);

// POST /api/agents/user/booking-support/chat
router.post("/user/booking-support/chat", agentController.chatBookingSupport);

// POST /api/agents/user/booking-support/clear-history
router.post(
  "/user/booking-support/clear-history",
  agentController.clearChatHistory
);

// GET /api/agents/user/booking-support/health
router.get(
  "/user/booking-support/health",
  agentController.getBookingSupportHealth
);

// GET /api/agents/user/booking-support/stats
router.get(
  "/user/booking-support/stats",
  agentController.getBookingSupportStats
);

// GET /api/agents/user/support/faq (Legacy - deprecated)
router.get("/user/support/faq", agentController.getFAQSupport);

// POST /api/agents/user/event-request (Alias for process-event-request)
router.post("/user/event-request", agentController.processEventRequest);

// POST /api/agents/process-event-request
router.post("/process-event-request", agentController.processEventRequest);

// GET /api/agents/event-suggestions
router.get("/event-suggestions", agentController.getEventSuggestions);

// ==================== ORGANIZER AGENT ROUTES ====================

// POST /api/agents/organizer/plan-event
router.post("/organizer/plan-event", agentController.planEvent);

// POST /api/agents/organizer/negotiate
router.post("/organizer/negotiate", agentController.negotiateBooking);

// GET /api/agents/organizer/dashboard/:organizerId
router.get(
  "/organizer/dashboard/:organizerId",
  agentController.getOrganizerDashboard
);

// ==================== NEGOTIATION ROUTES ====================

// POST /api/agents/negotiation/start
router.post('/negotiation/start', agentController.startEventRequestNegotiation);

// POST /api/agents/negotiation/counter
router.post('/negotiation/counter', agentController.processUserCounterOffer);

// GET /api/agents/negotiation/:negotiationId/status
router.get('/negotiation/:negotiationId/status', agentController.getNegotiationStatus);

// POST /api/agents/negotiation/:negotiationId/accept
router.post('/negotiation/:negotiationId/accept', agentController.acceptNegotiationOffer);

// GET /api/agents/negotiation/price-analysis
router.get('/negotiation/price-analysis', agentController.getEventPriceAnalysis);

// ==================== ADMIN AGENT ROUTES ====================

// GET /api/agents/admin/analytics
router.get("/admin/analytics", agentController.getAnalytics);

// POST /api/agents/admin/sentiment (Alias for analyze-sentiment)
router.post("/admin/sentiment", agentController.analyzeSentiment);

// POST /api/agents/admin/analyze-sentiment
router.post("/admin/analyze-sentiment", agentController.analyzeSentiment);

// POST /api/agents/admin/fraud-check
router.post("/admin/fraud-check", agentController.checkFraud);

// ==================== MULTI-AGENT COLLABORATION ROUTES ====================

// POST /api/agents/collaborate
router.post("/collaborate", async (req, res) => {
  try {
    const { workflowType, parameters } = req.body;
    res.json({
      success: true,
      workflowType,
      parameters,
      status: "pending_implementation",
      message:
        "Multi-agent collaboration will be implemented with CrewAI/LangGraph",
      plannedFor: "Phase 4+",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/agents/workflows/:workflowId/status
router.get("/workflows/:workflowId/status", async (req, res) => {
  try {
    const { workflowId } = req.params;
    res.json({
      success: true,
      workflowId,
      status: "pending_implementation",
      message:
        "Workflow status tracking will be implemented in advanced phases",
      plannedFor: "Phase 4+",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/agents/:agentName/execute
router.post("/:agentName/execute", async (req, res) => {
  try {
    const { agentName } = req.params;
    const parameters = req.body;
    res.json({
      success: true,
      agentName,
      parameters,
      executionId: `exec_${Date.now()}`,
      status: "pending_implementation",
      message: `Generic execution endpoint - implement specific endpoints for ${agentName}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 404 HANDLER ====================
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: {
      system: [
        "GET /health",
        "GET /status",
        "GET /list"
      ],
      user: [
        "POST /user/recommendations",
        "POST /user/booking-support/chat",
        "POST /user/booking-support/clear-history",
        "GET /user/booking-support/health",
        "GET /user/booking-support/stats",
        "GET /user/support/faq (deprecated)",
        "POST /user/event-request",
        "POST /process-event-request",
        "GET /event-suggestions"
      ],
      organizer: [
        "POST /organizer/plan-event",
        "POST /organizer/negotiate",
        "GET /organizer/dashboard/:organizerId"
      ],
      negotiation: [
        "POST /negotiation/start",
        "POST /negotiation/counter",
        "GET /negotiation/:negotiationId/status",
        "POST /negotiation/:negotiationId/accept",
        "GET /negotiation/price-analysis"
      ],
      admin: [
        "GET /admin/analytics",
        "POST /admin/sentiment",
        "POST /admin/analyze-sentiment",
        "POST /admin/fraud-check"
      ],
      collaboration: [
        "POST /collaborate",
        "GET /workflows/:workflowId/status",
        "POST /:agentName/execute"
      ]
    },
  });
});

module.exports = router;
