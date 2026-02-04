const mongoose = require("mongoose");

class MongoDBConfig {
  constructor() {
    this.connection = null;
  }

  async connect() {
    if (this.connection) return this.connection;

    const MONGODB_URI =
      process.env.MONGODB_URI || "mongodb://localhost:27017/Eventa";

    try {
      this.connection = await mongoose.connect(MONGODB_URI);
      console.log("AI Agent MongoDB Connected");
      return this.connection;
    } catch (error) {
      console.error("AI Agent MongoDB Connection Error:", error);
      throw error;
    }
  }

  getConnection() {
    return mongoose.connection;
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
      this.connection = null;
      console.log(" AI Agent MongoDB Disconnected");
    }
  }
}

module.exports = new MongoDBConfig();
