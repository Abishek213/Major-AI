const express = require("express");
const router = express.Router();
const agentController = require("../controllers/agent.controller");

/**
 * ============================================================================
 * AI AGENT API ROUTES
 * ============================================================================
 * 
 * Base Path: /api/agents (configured in main index.js)
 * 
 * ROUTE STRUCTURE:
 * - System Routes: /api/agents/health, /api/agents/status, /api/agents/list
 * - User Agents: /api/agents/user/*
 * - Organizer Agents: /api/agents/organizer/*
 * - Admin Agents: /api/agents/admin/*
 * 
 * HTTP METHOD CONVENTIONS:
 * - GET: Retrieve data (health checks, stats, lists)
 * - POST: Create/process data (chat, requests, analysis)
 * - PUT/PATCH: Update data
 * - DELETE: Remove data
 * 
 * ============================================================================
 */

// ============================================================================
// SYSTEM ROUTES (Top-level endpoints)
// ============================================================================

/**
 * GET /api/agents/health
 * Overall system health check
 * Used by: Backend health monitoring, load balancers
 */
router.get("/health", agentController.getHealth);

/**
 * GET /api/agents/status
 * Detailed system status with phase information
 * Used by: Admin dashboards, monitoring systems
 */
router.get("/status", agentController.getSystemStatus);

/**
 * GET /api/agents/list
 * List all available agents
 * Used by: API documentation, admin panels
 */
router.get("/list", agentController.listAgents);

// ============================================================================
// USER AGENT ROUTES
// ============================================================================

/**
 * ----------------------------------------------------------------------------
 * EVENT RECOMMENDATION AGENT (Phase 1.1)
 * ----------------------------------------------------------------------------
 */

/**
 * POST /api/agents/user/recommendations
 * Generate event recommendations for a user
 * 
 * Request Body:
 * {
 *   userId: string,
 *   limit: number (optional),
 *   userContext: object,
 *   candidateEvents: array
 * }
 */
router.post("/user/recommendations", agentController.postRecommendations);

/**
 * ----------------------------------------------------------------------------
 * BOOKING SUPPORT AGENT (Phase 1.2)  ACTIVE
 * ----------------------------------------------------------------------------
 */

/**
 * POST /api/agents/user/booking-support/chat
 * Main chatbot endpoint for booking support
 * 
 * Request Body:
 * {
 *   message: string (required),
 *   userId: string (optional),
 *   sessionId: string (optional)
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   agent: string,
 *   message: string,
 *   metadata: {
 *     language: { detected, name },
 *     context: { faqChunksUsed, historyMessagesUsed },
 *     performance: { responseTimeMs }
 *   }
 * }
 */
router.post(
  "/user/booking-support/chat",
  agentController.chatBookingSupport
);

/**
 * POST /api/agents/user/booking-support/clear-history
 * Clear conversation history for a user
 * 
 * Request Body:
 * {
 *   userId: string (OR sessionId: string)
 * }
 */
router.post(
  "/user/booking-support/clear-history",
  agentController.clearChatHistory
);

/**
 * GET /api/agents/user/booking-support/health
 * Health check for booking support agent
 * Returns detailed component status
 */
router.get(
  "/user/booking-support/health",
  agentController.getBookingSupportHealth
);

/**
 * GET /api/agents/user/booking-support/stats
 * Statistics and monitoring data for booking support agent
 */
router.get(
  "/user/booking-support/stats",
  agentController.getBookingSupportStats
);

/**
 * GET /api/agents/user/support/faq (LEGACY - DEPRECATED)
 * Old FAQ endpoint - kept for backward compatibility
 * 
 * @deprecated Use POST /api/agents/user/booking-support/chat instead
 * 
 * Query Params:
 * - question: string
 * - language: string (optional)
 */
router.get("/user/support/faq", agentController.getFAQSupport);

/**
 * ----------------------------------------------------------------------------
 * EVENT REQUEST ASSISTANT (Phase 1.3)  PLANNED
 * ----------------------------------------------------------------------------
 */

/**
 * POST /api/agents/user/event-request
 * Process event request from user
 * 
 * Request Body:
 * {
 *   requestText: string,
 *   userId: string
 * }
 */
router.post("/user/event-request", agentController.processEventRequest);

// ============================================================================
// ORGANIZER AGENT ROUTES
// ============================================================================

/**
 * ----------------------------------------------------------------------------
 * EVENT PLANNING AGENT (Phase 2.1)  PLANNED
 * ----------------------------------------------------------------------------
 */

/**
 * POST /api/agents/organizer/plan-event
 * Generate event plan automatically
 * 
 * Request Body:
 * {
 *   eventDetails: object,
 *   organizerId: string
 * }
 */
router.post("/organizer/plan-event", agentController.planEvent);

/**
 * ----------------------------------------------------------------------------
 * NEGOTIATION AGENT (Phase 2.2)  PLANNED
 * ----------------------------------------------------------------------------
 */

/**
 * POST /api/agents/organizer/negotiate
 * Facilitate booking negotiation
 * 
 * Request Body:
 * {
 *   bookingId: string,
 *   offer: number,
 *   userId: string
 * }
 */
router.post("/organizer/negotiate", agentController.negotiateBooking);

/**
 * ----------------------------------------------------------------------------
 * DASHBOARD ASSISTANT (Phase 2.3)  PLANNED
 * ----------------------------------------------------------------------------
 */

/**
 * GET /api/agents/organizer/dashboard/:organizerId
 * Get organizer dashboard data
 * 
 * URL Params:
 * - organizerId: string
 */
router.get(
  "/organizer/dashboard/:organizerId",
  agentController.getOrganizerDashboard
);

// ============================================================================
// ADMIN AGENT ROUTES
// ============================================================================

/**
 * ----------------------------------------------------------------------------
 * FRAUD DETECTION AGENT (Phase 3.1)  PLANNED
 * ----------------------------------------------------------------------------
 */

/**
 * POST /api/agents/admin/fraud-check
 * Check booking for fraud indicators
 * 
 * Request Body:
 * {
 *   bookingId: string
 * }
 */
router.post("/admin/fraud-check", agentController.checkFraud);

/**
 * ----------------------------------------------------------------------------
 * ANALYTICS AGENT (Phase 3.2)  PLANNED
 * ----------------------------------------------------------------------------
 */

/**
 * GET /api/agents/admin/analytics
 * Generate platform analytics
 */
router.get("/admin/analytics", agentController.getAnalytics);

/**
 * ----------------------------------------------------------------------------
 * SENTIMENT ANALYSIS AGENT (Phase 3.3)  PLANNED
 * ----------------------------------------------------------------------------
 */

/**
 * POST /api/agents/admin/sentiment
 * Analyze review sentiment
 * 
 * Request Body:
 * {
 *   reviewId: string,
 *   reviewText: string
 * }
 */
router.post("/admin/sentiment", agentController.analyzeSentiment);

// ============================================================================
// MULTI-AGENT COLLABORATION ROUTES (Future Enhancement)
// ============================================================================

/**
 * POST /api/agents/collaborate
 * Execute multi-agent workflow
 * 
 * Future: Will use CrewAI, Autogen, or LangGraph
 * 
 * Request Body:
 * {
 *   workflowType: string,
 *   parameters: object
 * }
 */
router.post("/collaborate", async (req, res) => {
  try {
    const { workflowType, parameters } = req.body;

    res.json({
      success: true,
      workflowType,
      parameters,
      status: "pending_implementation",
      message:
        "Multi-agent collaboration will be implemented with CrewAI/LangGraph in advanced phases",
      plannedFor: "Phase 4+",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/workflows/:workflowId/status
 * Check workflow execution status
 * 
 * URL Params:
 * - workflowId: string
 */
router.get("/workflows/:workflowId/status", async (req, res) => {
  try {
    const { workflowId } = req.params;

    res.json({
      success: true,
      workflowId,
      status: "pending_implementation",
      message: "Workflow status tracking will be implemented in advanced phases",
      plannedFor: "Phase 4+",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agents/:agentName/execute
 * Generic agent execution endpoint
 * 
 * Dynamic execution of any agent by name
 * Useful for testing and debugging
 * 
 * URL Params:
 * - agentName: string
 * 
 * Request Body: any (agent-specific)
 */
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
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE (Catch-all)
// ============================================================================

/**
 * 404 handler for undefined routes
 * Must be last in the route definitions
 */
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
    hint: "Check the API documentation for correct endpoints",
  });
});

module.exports = router;