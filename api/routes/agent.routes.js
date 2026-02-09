const express = require("express");
const router = express.Router();
const agentController = require("../controllers/agent.controller");

// System Routes
router.get("/health", agentController.getHealth);
router.get("/status", agentController.getSystemStatus);
router.get("/list", agentController.listAgents);

// User Agent Routes
router.post("/user/recommendations", agentController.postRecommendations);

router.post("/user/booking-support/chat", agentController.chatBookingSupport);
router.post(
  "/user/booking-support/clear-history",
  agentController.clearChatHistory
);
router.get(
  "/user/booking-support/health",
  agentController.getBookingSupportHealth
);
router.get(
  "/user/booking-support/stats",
  agentController.getBookingSupportStats
);
router.get("/user/support/faq", agentController.getFAQSupport);
router.post("/user/event-request", agentController.processEventRequest);

// Organizer Agent Routes
router.post("/organizer/plan-event", agentController.planEvent);
router.post("/organizer/negotiate", agentController.negotiateBooking);
router.get(
  "/organizer/dashboard/:organizerId",
  agentController.getOrganizerDashboard
);

// Admin Agent Routes
router.post("/admin/fraud-check", agentController.checkFraud);
router.get("/admin/analytics", agentController.getAnalytics);
router.post("/admin/sentiment", agentController.analyzeSentiment);

// Multi-agent Collaboration Routes
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

 //404 handler
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: {
      system: ["/health", "/status", "/list"],
      user: [
        "POST /user/recommendations",
        "POST /user/booking-support/chat",
        "POST /user/booking-support/clear-history",
        "GET /user/booking-support/health",
        "GET /user/booking-support/stats",
      ],
      organizer: [
        "POST /organizer/plan-event",
        "POST /organizer/negotiate",
        "GET /organizer/dashboard/:organizerId",
      ],
      admin: [
        "GET /admin/analytics",
        "POST /admin/sentiment",
        "POST /admin/fraud-check",
      ],
    },
  });
});

module.exports = router;
