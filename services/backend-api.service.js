const axios = require("axios");
const logger = require("../config/logger");

class BackendAPIService {
  constructor() {
    this.baseURL = process.env.BACKEND_API_URL || "http://localhost:3001/api";
    this.timeout = 10000;

    logger.info(`Backend API Service initialized: ${this.baseURL}`);
  }

  async getActiveEvents(limit = 100) {
    try {
      const response = await axios.get(`${this.baseURL}/events`, {
        params: {
          status: "active",
          limit: limit,
          sort: "-createdAt",
        },
        timeout: this.timeout,
      });

      if (response.data.success) {
        return response.data.data || [];
      }
      return [];
    } catch (error) {
      logger.error(`Error fetching events from backend: ${error.message}`);
      return [];
    }
  }

  async getUserPreferences(userId) {
    try {
      // TODO: Create this endpoint in backend if it doesn't exist
      // For now, return basic user info
      const response = await axios.get(`${this.baseURL}/users/${userId}`, {
        timeout: this.timeout,
      });

      if (response.data.success) {
        return {
          userId: userId,
          userData: response.data.data,
          preferences: {
            // Extract from user data or use defaults
            categories: ["music", "conference", "workshop"],
            price_range: { min: 0, max: 5000 },
            locations: ["Kathmandu", "Pokhara"],
          },
        };
      }
      return this.getDefaultPreferences(userId);
    } catch (error) {
      logger.error(`Error fetching user preferences: ${error.message}`);
      return this.getDefaultPreferences(userId);
    }
  }

  async getUserEventHistory(userId) {
    try {
      // Get user's bookings to infer preferences
      const response = await axios.get(
        `${this.baseURL}/bookings/user/${userId}`,
        {
          params: { limit: 50 },
          timeout: this.timeout,
        }
      );

      if (response.data.success) {
        return response.data.data || [];
      }
      return [];
    } catch (error) {
      logger.warn(`Could not fetch user history: ${error.message}`);
      return [];
    }
  }

  getDefaultPreferences(userId) {
    return {
      userId: userId,
      preferences: {
        categories: ["music", "conference", "workshop"],
        price_range: { min: 0, max: 5000 },
        locations: ["Kathmandu", "Pokhara"],
        interests: ["technology", "business", "entertainment"],
      },
      history: [],
    };
  }

  // Health check to backend
  async checkBackendHealth() {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 5000,
      });

      return {
        status: response.data.success ? "healthy" : "unhealthy",
        response: response.data,
      };
    } catch (error) {
      return {
        status: "unreachable",
        error: error.message,
      };
    }
  }
}

module.exports = new BackendAPIService();
