const express = require("express");
const router = express.Router();
const agentController = require("./controllers/agent.controller");
const logger = require("../config/logger"); // <-- ADDED

agentController.initialize().catch((err) => {
  logger.error(`❌ Failed to initialize AI agents on startup: ${err.message}`);
});

// ==================== MOUNT ALL AGENT ROUTES ====================
const agentRoutes = require("./routes/agent.routes");
router.use("/", agentRoutes);

// ==================== LEGACY ENDPOINTS (Deprecated) ====================
router.post("/recommendations", (req, res) => {
  logger.warn("Legacy endpoint /api/recommendations called");
  logger.warn("   Please update to /api/agents/user/recommendations");
  agentController.postRecommendations(req, res);
});

router.post("/agents/booking-support", (req, res) => {
  logger.warn("Legacy endpoint /api/agents/booking-support called");
  logger.warn("   Please update to /api/agents/user/booking-support/chat");
  agentController.chatBookingSupport(req, res);
});

router.post("/agents/booking-support/initialize", async (req, res) => {
  logger.warn("Legacy endpoint /api/agents/booking-support/initialize called");
  logger.warn(
    "   Agent initializes automatically - this endpoint is no longer needed"
  );
  try {
    await agentController.initialize();
    res.json({
      success: true,
      message: "Agent initialized (auto-initialization is now default)",
      note: "This endpoint is deprecated",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get("/agents/booking-support/history/:userId", (req, res) => {
  logger.warn(
    "Legacy endpoint /api/agents/booking-support/history/:userId called"
  );
  try {
    const { userId } = req.params;
    const BookingSupportAgent = require("../agents/user-agents/booking-support-agent");
    const history = BookingSupportAgent.getFullHistory(userId);
    res.json({
      success: true,
      userId,
      history,
      note: "This endpoint is deprecated. History is included in chat responses.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.delete("/agents/booking-support/history/:userId", (req, res) => {
  logger.warn(
    "Legacy endpoint DELETE /api/agents/booking-support/history/:userId called"
  );
  logger.warn(
    "   Please update to POST /api/agents/user/booking-support/clear-history"
  );
  req.body = { userId: req.params.userId };
  agentController.clearChatHistory(req, res);
});

router.get("/", (req, res) => {
  res.json({
    service: "Eventa AI Agent Service API",
    version: "3.0.0",
    phase: "Phase 3 - ORG Planning Agent",
    documentation: {
      status: "/api/agents/status",
      health: "/api/agents/health",
      agents: "/api/agents/list",
    },
    endpoints: {
      system: {
        health: "GET /api/agents/health",
        status: "GET /api/agents/status",
        list: "GET /api/agents/list",
      },
      user_agents: {
        recommendations: "POST /api/agents/user/recommendations",
        booking_chat: "POST /api/agents/user/booking-support/chat",
        clear_history: "POST /api/agents/user/booking-support/clear-history",
        booking_health: "GET /api/agents/user/booking-support/health",
        booking_stats: "GET /api/agents/user/booking-support/stats",
        event_request: "POST /api/agents/user/event-request",
        event_suggestions: "GET /api/agents/event-suggestions",
      },
      organizer_agents: {
        plan_event_legacy: "POST /api/agents/organizer/plan-event (legacy)",
        planning_suggest: "POST /api/agents/organizer/planning/suggest (NEW)",
        negotiate_booking: "POST /api/agents/organizer/negotiate",
        dashboard: "GET /api/agents/organizer/dashboard/:organizerId",
      },
      negotiation_agents: {
        start: "POST /api/agents/negotiation/start",
        counter: "POST /api/agents/negotiation/counter",
        status: "GET /api/agents/negotiation/:negotiationId/status",
        accept: "POST /api/agents/negotiation/:negotiationId/accept",
        price_analysis: "GET /api/agents/negotiation/price-analysis",
      },
      admin_agents: {
        analytics: "GET /api/agents/admin/analytics",
        sentiment: "POST /api/agents/admin/sentiment",
        fraud_check: "POST /api/agents/admin/fraud-check",
      },
      collaboration: {
        collaborate: "POST /api/agents/collaborate",
        workflow_status: "GET /api/agents/workflows/:workflowId/status",
        execute: "POST /api/agents/:agentName/execute",
      },
      legacy: {
        recommendations: "POST /api/recommendations (deprecated)",
        booking: "POST /api/agents/booking-support (deprecated)",
        booking_init:
          "POST /api/agents/booking-support/initialize (deprecated)",
        booking_history:
          "GET /api/agents/booking-support/history/:userId (deprecated)",
        booking_history_delete:
          "DELETE /api/agents/booking-support/history/:userId (deprecated)",
      },
    },
    note: "All endpoints are internal - Frontend should call Backend API, not these directly",
  });
});

router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    hint: "Visit GET / for available endpoints",
    suggestion:
      "Check if you're using the correct HTTP method (GET/POST/DELETE)",
  });
});

module.exports = router;
