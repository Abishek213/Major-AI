const express = require("express");
const router = express.Router();
const agentController = require("../controllers/agent.controller");
const asyncHandler = require("../../shared/utils/asyncHandler");
const logger = require("../../config/logger");

// ==================== SYSTEM & GENERAL ROUTES ====================
router.get("/health", asyncHandler(agentController.getHealth));
router.get("/status", asyncHandler(agentController.getSystemStatus));
router.get("/list", asyncHandler(agentController.listAgents));

// ==================== USER AGENT ROUTES ====================
router.post(
  "/user/recommendations",
  asyncHandler(agentController.postRecommendations)
);

router.post(
  "/user/booking-support/chat",
  asyncHandler(agentController.chatBookingSupport)
);
router.post(
  "/user/booking-support/clear-history",
  asyncHandler(agentController.clearChatHistory)
);
router.get(
  "/user/booking-support/health",
  asyncHandler(agentController.getBookingSupportHealth)
);
router.get(
  "/user/booking-support/stats",
  asyncHandler(agentController.getBookingSupportStats)
);
// Legacy FAQ (deprecated)
router.get("/user/support/faq", asyncHandler(agentController.getFAQSupport));

router.post(
  "/user/event-request",
  asyncHandler(agentController.processEventRequest)
);
router.get(
  "/event-suggestions",
  asyncHandler(agentController.getEventSuggestions)
);

// ==================== ORGANIZER AGENT ROUTES ====================
router.post(
  "/organizer/planning/suggest",
  asyncHandler(agentController.getPlanningSuggestions)
);
router.post("/organizer/plan-event", asyncHandler(agentController.planEvent));
router.get(
  "/organizer/dashboard/:organizerId",
  asyncHandler(agentController.getOrganizerDashboard)
);
router.post(
  "/organizer/negotiate",
  asyncHandler(agentController.negotiateBooking)
);

// ==================== NEGOTIATION ROUTES ====================
router.post(
  "/negotiation/start",
  asyncHandler(agentController.startEventRequestNegotiation)
);
router.post(
  "/negotiation/counter",
  asyncHandler(agentController.processUserCounterOffer)
);
router.get(
  "/negotiation/:negotiationId/status",
  asyncHandler(agentController.getNegotiationStatus)
);
router.post(
  "/negotiation/:negotiationId/accept",
  asyncHandler(agentController.acceptNegotiationOffer)
);
router.get(
  "/negotiation/price-analysis",
  asyncHandler(agentController.getEventPriceAnalysis)
);

// ==================== ADMIN AGENT ROUTES ====================
router.get("/admin/analytics", asyncHandler(agentController.getAnalytics));
router.post("/admin/sentiment", asyncHandler(agentController.analyzeSentiment)); // single endpoint
router.post("/admin/fraud-check", asyncHandler(agentController.checkFraud));

// ==================== MULTI-AGENT COLLABORATION ROUTES ====================
router.post(
  "/collaborate",
  asyncHandler(async (req, res) => {
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
  })
);

router.get(
  "/workflows/:workflowId/status",
  asyncHandler(async (req, res) => {
    const { workflowId } = req.params;
    res.json({
      success: true,
      workflowId,
      status: "pending_implementation",
      message:
        "Workflow status tracking will be implemented in advanced phases",
      plannedFor: "Phase 4+",
    });
  })
);

router.post(
  "/:agentName/execute",
  asyncHandler(async (req, res) => {
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
  })
);

// ==================== 404 HANDLER ====================
router.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: {
      system: ["GET /health", "GET /status", "GET /list"],
      user: [
        "POST /user/recommendations",
        "POST /user/booking-support/chat",
        "POST /user/booking-support/clear-history",
        "GET /user/booking-support/health",
        "GET /user/booking-support/stats",
        "GET /user/support/faq (deprecated)",
        "POST /user/event-request",
        "GET /event-suggestions",
      ],
      organizer: [
        "POST /organizer/plan-event",
        "POST /organizer/negotiate",
        "GET /organizer/dashboard/:organizerId",
      ],
      negotiation: [
        "POST /negotiation/start",
        "POST /negotiation/counter",
        "GET /negotiation/:negotiationId/status",
        "POST /negotiation/:negotiationId/accept",
        "GET /negotiation/price-analysis",
      ],
      admin: [
        "GET /admin/analytics",
        "POST /admin/sentiment",
        "POST /admin/fraud-check",
      ],
      collaboration: [
        "POST /collaborate",
        "GET /workflows/:workflowId/status",
        "POST /:agentName/execute",
      ],
    },
  });
});

module.exports = router;
