const axios = require("axios");
const logger = require("../config/logger");

class BackendAPIService {
  constructor() {
    this.baseURL =
      process.env.BACKEND_API_URL || "http://localhost:4001/api/v1";

    this.timeout = 30000;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        "Content-Type": "application/json",
      },
    });

    logger.info(`Backend API Service initialized: ${this.baseURL}`);
  }

  setAuthToken(token) {
    if (token) {
      this.client.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      logger.debug("Auth token set on BackendAPIService");
    } else {
      delete this.client.defaults.headers.common["Authorization"];
      logger.debug("Auth token cleared from BackendAPIService");
    }
  }

  async checkBackendHealth() {
    try {
      const response = await this.client.get("/health", {
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

  // ==================== SHARED METHODS (used by multiple agents) ====================
  async getActiveEvents(limit = 100) {
    try {
      const response = await this.client.get("/events", {
        params: {
          status: "active",
          limit: limit,
          sort: "-createdAt",
        },
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
      const response = await this.client.get(`/users/${userId}`);

      if (response.data.success) {
        return {
          userId: userId,
          userData: response.data.data,
          preferences: {
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
      const response = await this.client.get(`/bookings/user/${userId}`, {
        params: { limit: 50 },
      });

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

  async generateMetricsReport(organizerId, filters = {}) {
    try {
      logger.info(
        `Fetching dashboard metrics for organizer: ${organizerId}`,
        filters
      );

      const response = await this.client.get(
        `/ai/dashboard/metrics/${organizerId}`,
        {
          params: filters,
        }
      );

      if (response.data.success) {
        // FIX: logger.success() does not exist in winston/pino — use logger.info()
        logger.info(
          `Dashboard metrics fetched successfully for ${organizerId}`
        );
        return response.data.data;
      }

      logger.warn(`Dashboard metrics returned unsuccessful response`);
      return this.getEmptyDashboardMetrics(organizerId);
    } catch (error) {
      // FIX: Log HTTP status code if available for better debugging
      if (error.response) {
        logger.error(
          `HTTP ${
            error.response.status
          } fetching dashboard metrics for ${organizerId}: ${
            error.response.data?.message || error.message
          }`
        );
      } else {
        logger.error(
          `Error fetching dashboard metrics for ${organizerId}: ${error.message}`
        );
      }
      return this.getEmptyDashboardMetrics(organizerId);
    }
  }

  async getEventMetrics(organizerId, filters = {}) {
    try {
      const response = await this.client.get(
        `/ai/dashboard/events/${organizerId}`,
        { params: filters }
      );

      if (response.data.success) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      if (error.response) {
        logger.error(
          `HTTP ${
            error.response.status
          } fetching event metrics for ${organizerId}: ${
            error.response.data?.message || error.message
          }`
        );
      } else {
        logger.error(
          `Error fetching event metrics for ${organizerId}: ${error.message}`
        );
      }
      return null;
    }
  }

  async getRevenueMetrics(organizerId, filters = {}) {
    try {
      const response = await this.client.get(
        `/ai/dashboard/revenue/${organizerId}`,
        { params: filters }
      );

      if (response.data.success) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      if (error.response) {
        logger.error(
          `HTTP ${
            error.response.status
          } fetching revenue metrics for ${organizerId}: ${
            error.response.data?.message || error.message
          }`
        );
      } else {
        logger.error(
          `Error fetching revenue metrics for ${organizerId}: ${error.message}`
        );
      }
      return null;
    }
  }

  async getBookingMetrics(organizerId, filters = {}) {
    try {
      const response = await this.client.get(
        `/ai/dashboard/bookings/${organizerId}`,
        { params: filters }
      );

      if (response.data.success) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      if (error.response) {
        logger.error(
          `HTTP ${
            error.response.status
          } fetching booking metrics for ${organizerId}: ${
            error.response.data?.message || error.message
          }`
        );
      } else {
        logger.error(
          `Error fetching booking metrics for ${organizerId}: ${error.message}`
        );
      }
      return null;
    }
  }

  async getRatingMetrics(organizerId, filters = {}) {
    try {
      const response = await this.client.get(
        `/ai/dashboard/ratings/${organizerId}`,
        { params: filters }
      );

      if (response.data.success) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      if (error.response) {
        logger.error(
          `HTTP ${
            error.response.status
          } fetching rating metrics for ${organizerId}: ${
            error.response.data?.message || error.message
          }`
        );
      } else {
        logger.error(
          `Error fetching rating metrics for ${organizerId}: ${error.message}`
        );
      }
      return null;
    }
  }

  async getSentimentMetrics(organizerId, filters = {}) {
    try {
      const response = await this.client.get(
        `/ai/dashboard/sentiment/${organizerId}`,
        { params: filters }
      );

      if (response.data.success) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      if (error.response) {
        logger.error(
          `HTTP ${
            error.response.status
          } fetching sentiment metrics for ${organizerId}: ${
            error.response.data?.message || error.message
          }`
        );
      } else {
        logger.error(
          `Error fetching sentiment metrics for ${organizerId}: ${error.message}`
        );
      }
      return null;
    }
  }

  async getTrendsMetrics(organizerId, filters = {}) {
    try {
      const response = await this.client.get(
        `/ai/dashboard/trends/${organizerId}`,
        { params: filters }
      );

      if (response.data.success) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      if (error.response) {
        logger.error(
          `HTTP ${
            error.response.status
          } fetching trends metrics for ${organizerId}: ${
            error.response.data?.message || error.message
          }`
        );
      } else {
        logger.error(
          `Error fetching trends metrics for ${organizerId}: ${error.message}`
        );
      }
      return null;
    }
  }

  async getOrganizerEvents(organizerId, filters = {}) {
    try {
      const response = await this.client.get("/events", {
        params: {
          org_ID: organizerId,
          ...filters,
        },
      });

      if (response.data.success) {
        return response.data.data || [];
      }
      return [];
    } catch (error) {
      logger.error(`Error fetching organizer events: ${error.message}`);
      return [];
    }
  }

  async getOrganizerBookings(organizerId, filters = {}) {
    try {
      const events = await this.getOrganizerEvents(organizerId, {});
      const eventIds = events.map((e) => e._id);

      if (eventIds.length === 0) {
        return [];
      }

      const response = await this.client.get("/bookings", {
        params: {
          eventIds: eventIds.join(","),
          ...filters,
        },
      });

      if (response.data.success) {
        return response.data.data || [];
      }
      return [];
    } catch (error) {
      logger.error(`Error fetching organizer bookings: ${error.message}`);
      return [];
    }
  }

  // ==================== FALLBACK HELPERS ====================
  getEmptyDashboardMetrics(organizerId) {
    return {
      organizerId,
      dateRange: "all_time",
      generatedAt: new Date().toISOString(),
      events: {
        total: 0,
        byStatus: {},
        byCategory: [],
        averageAttendanceRate: 0,
        attendanceDetails: [],
      },
      revenue: {
        total: 0,
        totalBookings: 0,
        averageBookingValue: 0,
        byMonth: [],
        byEvent: [],
      },
      bookings: {
        total: 0,
        completed: 0,
        byStatus: {},
        totalSeatsBooked: 0,
        totalAvailableSlots: 0,
        conversionRate: 0,
        byPaymentMethod: [],
      },
      ratings: {
        average: 0,
        total: 0,
        max: 0,
        min: 0,
        distribution: {},
        byEvent: [],
      },
      sentiment: {
        averageScore: 0,
        totalAnalyzed: 0,
        distribution: {
          positive: 0,
          neutral: 0,
          negative: 0,
        },
        commonIssues: [],
        overTime: [],
      },
      trends: {
        peakBookingTimes: [],
        userDemographics: {
          uniqueUsers: 0,
          repeatCustomers: 0,
        },
        popularCategories: [],
      },
    };
  }
}

module.exports = new BackendAPIService();
