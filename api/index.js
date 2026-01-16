const express = require("express");
const router = express.Router();

// Import agent routes
const agentRoutes = require("./routes/agent.routes");

// Use agent routes under base path
router.use("/", agentRoutes);

// API root endpoint
router.get("/", (req, res) => {
  res.json({
    message: "e-VENTA AI Agent API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      status: "/api/ai/status",
      agents: "/api/ai/agents",
      user_recommendations: "/api/ai/user/recommendations/:userId",
      faq_support: "/api/ai/user/support/faq",
      health: "/health",
    },
  });
});

module.exports = router;
