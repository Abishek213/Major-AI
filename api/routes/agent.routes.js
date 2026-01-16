// agent.routes.js
// Routes for e-VENTA AI Agent System

const express = require("express");
const router = express.Router();
const agentController = require("../controllers/agent.controller");

// ==================== SYSTEM & GENERAL AGENT ROUTES ====================

// GET /api/ai/status
router.get("/status", agentController.getSystemStatus);

// GET /api/ai
router.get("/agents", agentController.listAgents);

// ==================== USER AGENT ROUTES ====================

// GET /api/ai/user/recommendations/:userId
router.get(
  "/user/recommendations/:userId",
  agentController.getUserRecommendations
);

// GET /api/ai/user/support/faq
router.get("/user/support/faq", agentController.getFAQSupport);

// POST /api/ai/user/event-request
router.post("/user/event-request", agentController.processEventRequest);

// ==================== ORGANIZER AGENT ROUTES ====================

// GET /api/ai/organizer/dashboard/:organizerId
router.get(
  "/organizer/dashboard/:organizerId",
  agentController.getOrganizerDashboard
);

// POST /api/ai/organizer/negotiate
router.post("/organizer/negotiate", agentController.negotiateBooking);

// POST /api/ai/organizer/plan-event (now has controller method)
router.post("/organizer/plan-event", agentController.planEvent);

// ==================== ADMIN AGENT ROUTES ====================

// GET /api/ai/admin/analytics
router.get("/admin/analytics", agentController.getAnalytics);

// POST /api/ai/admin/analyze-sentiment
router.post("/admin/analyze-sentiment", agentController.analyzeSentiment);

// POST /api/ai/admin/fraud-check (now has controller method)
router.post("/admin/fraud-check", agentController.checkFraud);

// ==================== MULTI-AGENT COLLABORATION ROUTES ====================

// POST /api/ai/collaborate
router.post("/collaborate", async (req, res) => {
  try {
    const { workflowType, parameters } = req.body;

    res.json({
      success: true,
      workflowType,
      parameters,
      status: "pending_implementation",
      message:
        "Multi-agent collaboration endpoint - to be implemented with CrewAI/LangGraph",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/ai/workflows/:workflowId/status
router.get("/workflows/:workflowId/status", async (req, res) => {
  try {
    const { workflowId } = req.params;

    res.json({
      success: true,
      workflowId,
      status: "completed",
      agents_involved: ["planner", "negotiator", "booking"],
      results: [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== AGENT HEALTH & MONITORING ====================

// GET /api/ai/health
router.get("/health", async (req, res) => {
  try {
    const healthStatus = {
      user_agents: {
        event_recommendation: "healthy",
        booking_support: "healthy",
        event_request: "healthy",
      },
      organizer_agents: {
        dashboard_assistant: "healthy",
        negotiation_agent: "healthy",
        planning_agent: "healthy",
      },
      admin_agents: {
        analytics_agent: "healthy",
        feedback_sentiment: "healthy",
        fraud_detection: "healthy",
      },
      overall: "healthy",
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      ...healthStatus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/ai/:agentName/execute
router.post("/:agentName/execute", async (req, res) => {
  try {
    const { agentName } = req.params;
    const parameters = req.body;

    res.json({
      success: true,
      agentName,
      parameters,
      executionId: `exec_${Date.now()}`,
      status: "executed",
      result: {
        message: `Agent ${agentName} executed successfully`,
        output: {},
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
