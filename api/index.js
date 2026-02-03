const express = require("express");
const router = express.Router();
const agentController = require("./controllers/agent.controller");

/**
 * ============================================================================
 * AI AGENT SERVICE API ROUTES
 * ============================================================================
 * 
 * Base URL: http://localhost:3002/api/agents
 * 
 * ARCHITECTURE:
 * Frontend → Backend API → AI Agent Service (this)
 * 
 * IMPORTANT: These are internal service routes
 * Frontend should NEVER call these directly
 * All requests should go through Backend API for:
 * - Authentication
 * - Rate limiting
 * - Request validation
 * - Business logic
 * 
 * ============================================================================
 */

// ============================================================================
// IMPORT ROUTES FROM ORGANIZED ROUTE FILE
// ============================================================================

/**
 * All agent routes are defined in ./routes/agent.routes.js
 * This keeps the codebase organized and maintainable
 * 
 * Routes mounted at: /api/agents/*
 */
const agentRoutes = require("./routes/agent.routes");
router.use("/", agentRoutes);

// ============================================================================
// LEGACY ROUTES (Backward Compatibility)
// ============================================================================

/**
 * LEGACY: POST /api/recommendations
 * 
 * Old endpoint for event recommendations
 * Kept for backward compatibility with existing Backend code
 * 
 * @deprecated Use POST /api/agents/user/recommendations instead
 */
router.post("/recommendations", (req, res) => {
  console.warn("⚠️ Legacy endpoint /api/recommendations called");
  console.warn("   Please update to /api/agents/user/recommendations");
  agentController.postRecommendations(req, res);
});

/**
 * LEGACY: POST /api/agents/booking-support
 * 
 * Old endpoint for booking support chat
 * 
 * @deprecated Use POST /api/agents/user/booking-support/chat instead
 */
router.post("/agents/booking-support", (req, res) => {
  console.warn("⚠️ Legacy endpoint /api/agents/booking-support called");
  console.warn("   Please update to /api/agents/user/booking-support/chat");
  
  // Forward to new endpoint
  agentController.chatBookingSupport(req, res);
});

/**
 * LEGACY: POST /api/agents/booking-support/initialize
 * 
 * Manual initialization endpoint
 * Agent now auto-initializes on first request
 * 
 * @deprecated Initialization happens automatically
 */
router.post("/agents/booking-support/initialize", async (req, res) => {
  console.warn("⚠️ Legacy endpoint /api/agents/booking-support/initialize called");
  console.warn("   Agent initializes automatically - this endpoint is no longer needed");
  
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

/**
 * LEGACY: GET /api/agents/booking-support/history/:userId
 * 
 * Get conversation history endpoint
 * History is now managed internally and returned with each response
 * 
 * @deprecated History is included in chat responses
 */
router.get("/agents/booking-support/history/:userId", (req, res) => {
  console.warn("⚠️ Legacy endpoint /api/agents/booking-support/history/:userId called");
  
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

/**
 * LEGACY: DELETE /api/agents/booking-support/history/:userId
 * 
 * Clear conversation history endpoint
 * 
 * @deprecated Use POST /api/agents/user/booking-support/clear-history instead
 */
router.delete("/agents/booking-support/history/:userId", (req, res) => {
  console.warn("⚠️ Legacy endpoint DELETE /api/agents/booking-support/history/:userId called");
  console.warn("   Please update to POST /api/agents/user/booking-support/clear-history");
  
  // Forward to new endpoint
  req.body = { userId: req.params.userId };
  agentController.clearChatHistory(req, res);
});

// ============================================================================
// ROOT ENDPOINT - API DOCUMENTATION
// ============================================================================

/**
 * GET /api
 * Root endpoint - provides API documentation
 */
router.get("/", (req, res) => {
  res.json({
    service: "Eventa AI Agent Service API",
    version: "1.0.0",
    phase: "1.2 - Booking Support Agent",
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
      },
      legacy: {
        recommendations: "POST /api/recommendations (deprecated)",
        booking: "POST /api/agents/booking-support (deprecated)",
      },
    },
    note: "All endpoints are internal - Frontend should call Backend API, not these directly",
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * 404 Handler
 * Provides helpful error message for undefined routes
 */
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    hint: "Visit GET /api for available endpoints",
    suggestion: "Check if you're using the correct HTTP method (GET/POST/DELETE)",
  });
});

module.exports = router;