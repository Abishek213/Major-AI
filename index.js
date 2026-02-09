const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Try to load modules - add better error handling
let logger, mongoClient, agentController;

try {
  logger = require("./config/logger");
} catch (error) {
  console.error("❌ Failed to load logger:", error.message);
  // Create a simple logger as fallback
  logger = {
    info: (...args) => console.log("[INFO]", ...args),
    error: (...args) => console.error("[ERROR]", ...args),
    warn: (...args) => console.warn("[WARN]", ...args),
    success: (...args) => console.log("[SUCCESS]", ...args),
    separator: () => console.log("=".repeat(50)),
    debug: (...args) => {},
  };
}

try {
  mongoClient = require("./config/mongodb");
} catch (error) {
  console.error("❌ Failed to load MongoDB config:", error.message);
  mongoClient = {
    connect: async () => {
      console.log("⚠️  MongoDB connection skipped (module not loaded)");
      return { success: false };
    },
    disconnect: async () => {
      console.log("⚠️  MongoDB disconnect skipped");
    },
  };
}

try {
  agentController = require("./api/controllers/agent.controller");
} catch (error) {
  console.error("❌ Failed to load agent controller:", error.message);
  agentController = {
    initialize: async () => {
      console.log("⚠️  Agent initialization skipped");
    },
    getHealth: (req, res) =>
      res.json({ status: "degraded", message: "Agent controller not loaded" }),
    postRecommendations: (req, res) =>
      res.status(500).json({ error: "Service unavailable" }),
  };
}

const app = express();
const PORT = process.env.PORT || 3002;

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`➡️  ${req.method} ${req.path}`);

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `⬅️  ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
    );
  });

  next();
});

// ============================================================================
// API ROUTES
// ============================================================================

// Try to load API routes with error handling
let apiRoutes;
try {
  apiRoutes = require("./api");
  app.use("/api/agents", apiRoutes);
} catch (error) {
  console.error("❌ Failed to load API routes:", error.message);
  app.use("/api/agents", (req, res) => {
    res.status(503).json({
      error: "API routes not loaded",
      message: error.message,
    });
  });
}

// Legacy route
app.post("/api/recommendations", agentController.postRecommendations);
app.post("/recommendations", agentController.postRecommendations);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Eventa AI Agent Service",
    version: "1.0.0",
    status: "running",
    phase: "1.2 - Booking Support Agent",
    health: "/health",
    timestamp: new Date().toISOString(),
  });
});

// Health endpoint
app.get("/health", agentController.getHealth);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 Handler
app.use((req, res) => {
  console.warn(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    error: "Route not found",
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Global Error Handler
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);

  res.status(error.status || 500).json({
    success: false,
    error: error.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });
});

async function startServer() {
  console.log("=".repeat(50));
  console.log("🚀 Starting Eventa AI Agent Service...");
  console.log("=".repeat(50));

  try {
    // Check environment variables
    console.log("📋 Checking environment configuration...");

    if (!process.env.MONGODB_URI) {
      console.warn("⚠️  MONGODB_URI not set, using default");
      process.env.MONGODB_URI = "mongodb://localhost:27017/Eventa";
    }

    if (!process.env.OPENAI_API_KEY) {
      console.warn("⚠️  OPENAI_API_KEY not set, some features will be limited");
    }

    // Connect to MongoDB with timeout
    console.log("📊 Connecting to MongoDB...");
    try {
      await Promise.race([
        mongoClient.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("MongoDB connection timeout")),
            5000
          )
        ),
      ]);
      console.log("✅ MongoDB connected successfully");
    } catch (mongoError) {
      console.warn("⚠️  MongoDB connection failed:", mongoError.message);
      console.log("⚠️  Continuing without database connection");
    }

    // Initialize agents
    console.log("🤖 Initializing AI agents...");
    try {
      await agentController.initialize();
      console.log("✅ AI agents initialized successfully");
    } catch (agentError) {
      console.warn("⚠️  Agent initialization failed:", agentError.message);
      console.log("⚠️  Agents will initialize on first request");
    }

    // Start server
    const server = app.listen(PORT, () => {
      console.log("=".repeat(50));
      console.log(`✅ AI Agent Service running on port ${PORT}`);
      console.log("=".repeat(50));

      console.log("📡 Available Endpoints:");
      console.log(`   - Health: http://localhost:${PORT}/health`);
      console.log(`   - Root: http://localhost:${PORT}/`);
      console.log("=".repeat(50));

      console.log("🎉 Server is ready to accept requests!");
      console.log("=".repeat(50));
    });

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n🛑 Received SIGINT - Shutting down gracefully...");
      server.close(async () => {
        try {
          await mongoClient.disconnect();
          console.log("✅ Server shutdown complete");
          process.exit(0);
        } catch (error) {
          console.error("❌ Error during shutdown:", error);
          process.exit(1);
        }
      });
    });
  } catch (error) {
    console.error("❌ Fatal error starting server:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

startServer();

module.exports = app;
