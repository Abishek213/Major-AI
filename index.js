const express = require("express");
const cors = require("cors");
require("dotenv").config();

const logger = require("./config/logger");
const mongoClient = require("./config/mongodb");
const agentController = require("./api/controllers/agent.controller");

const app = express();
const PORT = process.env.PORT || 3002;

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  logger.debug(`➡️ ${req.method} ${req.path}`);

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.debug(
      `⬅️ ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
    );
  });

  next();
});

// ============================================================================
// ROUTES
// ============================================================================
const apiRoutes = require("./api");
app.use("/api/agents", apiRoutes);

// Legacy direct endpoints
app.post("/api/recommendations", agentController.postRecommendations);
app.post("/recommendations", agentController.postRecommendations);

// Root
app.get("/", (req, res) => {
  res.json({
    service: "Eventa AI Agent Service",
    version: "1.0.0",
    status: "running",
    phase: "1.2 - Booking Support Agent (Ollama powered)",
    health: "/health",
    timestamp: new Date().toISOString(),
  });
});

// Health
app.get("/health", agentController.getHealth);

// ============================================================================
// ERROR HANDLING
// ============================================================================
// 404
app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    error: "Route not found",
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);

  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ============================================================================
// SERVER START
// ============================================================================
async function startServer() {
  try {
    // Environment checks
    if (!process.env.MONGODB_URI) {
      logger.warn("MONGODB_URI not set, using default");
      process.env.MONGODB_URI = "mongodb://localhost:27017/Eventa";
    }

    if (!process.env.OLLAMA_BASE_URL) {
      logger.info(
        "OLLAMA_BASE_URL not set, using default: http://localhost:11434"
      );
    }
    if (!process.env.OLLAMA_MODEL) {
      logger.info("OLLAMA_MODEL not set, using default: llama3.2");
    }
    if (!process.env.OLLAMA_EMBEDDING_MODEL) {
      logger.info(
        "OLLAMA_EMBEDDING_MODEL not set, using default: nomic-embed-text"
      );
    }

    // MongoDB connection (with timeout)
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
    } catch (mongoError) {
      logger.warn("MongoDB connection failed:", mongoError.message);
      logger.warn("Continuing without database connection");
    }

    // Agent initialization
    try {
      await agentController.initialize();
    } catch (agentError) {
      logger.warn("Agent initialization failed:", agentError.message);
      logger.warn("Agents will initialize on first request");
    }

    const server = app.listen(PORT, () => {
      logger.separator();
      logger.success(`✅ AI Agent Service running on port ${PORT}`);
      logger.separator();

      logger.info("📡 Available Endpoints:");
      logger.info(`   - Health: http://localhost:${PORT}/health`);
      logger.info(`   - Root: http://localhost:${PORT}/`);
      logger.separator();

      logger.success("🎉 Server is ready to accept requests!");
      logger.separator();
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
      logger.warn("\n🛑 Received SIGINT - Shutting down gracefully...");
      server.close(async () => {
        try {
          await mongoClient.disconnect();
          logger.success("✅ Server shutdown complete");
          process.exit(0);
        } catch (error) {
          logger.error("❌ Error during shutdown:", error);
          process.exit(1);
        }
      });
    });
  } catch (error) {
    logger.error("❌ Fatal error starting server:", error.message);
    logger.error("Stack:", error.stack);
    process.exit(1);
  }
}

startServer();

module.exports = app;
