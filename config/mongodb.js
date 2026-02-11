const mongoose = require("mongoose");
const logger = require("./logger");

class MongoDBConfig {
  constructor() {
    this.connection = null;
    this.isConnecting = false;
    this.connectionPromise = null;
  }

  async connect(retries = 3, initialDelay = 1000) {
    if (this.connection) {
      logger.debug("Using existing MongoDB connection", "AI Agent");
      return this.connection;
    }

    if (this.isConnecting && this.connectionPromise) {
      logger.debug("Connection in progress, waiting...", "AI Agent");
      return this.connectionPromise;
    }

    this.isConnecting = true;

    this.connectionPromise = this._connectWithRetry(retries, initialDelay);

    try {
      const result = await this.connectionPromise;
      return result;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  async _connectWithRetry(retries, initialDelay) {
    const MONGODB_URI =
      process.env.MONGODB_URI || "mongodb://localhost:27017/Eventa";

    const options = {
      maxPoolSize: 10, // Maximum number of connections in pool
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      family: 4, // Use IPv4, skip trying IPv6
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(
          `MongoDB connection attempt ${attempt}/${retries}`,
          "AI Agent"
        );

        this.connection = await mongoose.connect(MONGODB_URI, options);

        this.setupEventListeners();

        logger.success("MongoDB Connected", "AI Agent");
        logger.info(`Host: ${mongoose.connection.host}`, "AI Agent");
        logger.info(`Database: ${mongoose.connection.name}`, "AI Agent");

        return this.connection;
      } catch (error) {
        logger.error(
          `MongoDB connection attempt ${attempt}/${retries} failed:`,
          error.message,
          "AI Agent"
        );

        if (attempt >= retries) {
          logger.error("All MongoDB connection attempts failed", "AI Agent");
          throw error;
        }

        const delay = initialDelay * Math.pow(2, attempt - 1);
        logger.info(`Retrying in ${delay}ms...`, "AI Agent");
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  setupEventListeners() {
    if (this._listenersSetup) return;
    this._listenersSetup = true;

    mongoose.connection.on("connected", () => {
      logger.success("MongoDB connected", "AI Agent");
    });

    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error:", err, "AI Agent");
    });

    mongoose.connection.on("disconnected", () => {
      logger.warning("MongoDB disconnected", "AI Agent");
    });

    mongoose.connection.on("reconnected", () => {
      logger.success("MongoDB reconnected", "AI Agent");
    });

    mongoose.connection.on("close", () => {
      logger.info("MongoDB connection closed", "AI Agent");
    });
  }

  getConnection() {
    return mongoose.connection;
  }

  checkHealth() {
    const state = mongoose.connection.readyState;
    const states = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    return {
      status: states[state] || "unknown",
      readyState: state,
      connected: state === 1,
      host: mongoose.connection.host || "not connected",
      name: mongoose.connection.name || "not connected",
      models: Object.keys(mongoose.connection.models).length,
    };
  }

  async disconnect() {
    if (this.connection) {
      try {
        await mongoose.disconnect();
        this.connection = null;
        this._listenersSetup = false;
        logger.info("MongoDB Disconnected", "AI Agent");
      } catch (error) {
        logger.error("Error disconnecting from MongoDB:", error, "AI Agent");
        throw error;
      }
    } else {
      logger.debug("MongoDB already disconnected", "AI Agent");
    }
  }

  getStats() {
    if (!this.connection) {
      return {
        connected: false,
        message: "Not connected",
      };
    }

    const db = mongoose.connection.db;

    return {
      connected: mongoose.connection.readyState === 1,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      database: mongoose.connection.name,
      models: Object.keys(mongoose.connection.models),
      modelCount: Object.keys(mongoose.connection.models).length,
      collections: db ? Object.keys(db.collection) : [],
    };
  }

  async testConnection() {
    try {
      if (mongoose.connection.readyState !== 1) {
        return false;
      }

      await mongoose.connection.db.admin().ping();
      logger.debug("MongoDB connection test successful", "AI Agent");
      return true;
    } catch (error) {
      logger.error("MongoDB connection test failed:", error, "AI Agent");
      return false;
    }
  }
}

module.exports = new MongoDBConfig();
