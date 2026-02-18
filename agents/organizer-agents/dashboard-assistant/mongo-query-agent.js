/**
 * Backend API Query Agent for Organizer Dashboard
 * Communicates with Backend service via REST API
 * NO direct database access - maintains microservice boundaries
 */

const axios = require("axios");
const logger = require("../../../config/logger");

// Backend API base URL from environment
const BACKEND_API_URL =
  process.env.BACKEND_API_URL || "http://localhost:4001/api/v1";

// Create axios instance with defaults
const backendAPI = axios.create({
  baseURL: BACKEND_API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Generate comprehensive metrics report for organizer
 * @param {string} organizerId - User._id of organizer
 * @param {Object} filters - Date range and status filters
 * @returns {Object} Complete metrics report
 */
async function generateMetricsReport(organizerId, filters = {}) {
  try {
    logger.info(`Generating metrics report for organizer: ${organizerId}`);

    // Call Backend API endpoint that aggregates all metrics
    const response = await backendAPI.get(
      `/ai/dashboard/metrics/${organizerId}`,
      {
        params: filters,
      }
    );

    if (response.data.success) {
      logger.info("Metrics report generated successfully");
      return response.data.data;
    } else {
      throw new Error(response.data.message || "Failed to fetch metrics");
    }
  } catch (error) {
    logger.error("Error generating metrics report:", error.message);
    throw error;
  }
}

/**
 * Get event-related metrics from Backend
 */
async function getEventMetrics(organizerId, filters = {}) {
  try {
    const response = await backendAPI.get(
      `/ai/dashboard/events/${organizerId}`,
      {
        params: filters,
      }
    );

    return response.data.success ? response.data.data : null;
  } catch (error) {
    logger.error("Error fetching event metrics:", error.message);
    throw error;
  }
}

/**
 * Get revenue-related metrics from Backend
 */
async function getRevenueMetrics(organizerId, filters = {}) {
  try {
    const response = await backendAPI.get(
      `/ai/dashboard/revenue/${organizerId}`,
      {
        params: filters,
      }
    );

    return response.data.success ? response.data.data : null;
  } catch (error) {
    logger.error("Error fetching revenue metrics:", error.message);
    throw error;
  }
}

/**
 * Get booking-related metrics from Backend
 */
async function getBookingMetrics(organizerId, filters = {}) {
  try {
    const response = await backendAPI.get(
      `/ai/dashboard/bookings/${organizerId}`,
      {
        params: filters,
      }
    );

    return response.data.success ? response.data.data : null;
  } catch (error) {
    logger.error("Error fetching booking metrics:", error.message);
    throw error;
  }
}

/**
 * Get rating-related metrics from Backend
 */
async function getRatingMetrics(organizerId, filters = {}) {
  try {
    const response = await backendAPI.get(
      `/ai/dashboard/ratings/${organizerId}`,
      {
        params: filters,
      }
    );

    return response.data.success ? response.data.data : null;
  } catch (error) {
    logger.error("Error fetching rating metrics:", error.message);
    throw error;
  }
}

/**
 * Get sentiment analysis metrics from Backend
 */
async function getSentimentMetrics(organizerId, filters = {}) {
  try {
    const response = await backendAPI.get(
      `/ai/dashboard/sentiment/${organizerId}`,
      {
        params: filters,
      }
    );

    return response.data.success ? response.data.data : null;
  } catch (error) {
    logger.error("Error fetching sentiment metrics:", error.message);
    throw error;
  }
}

/**
 * Get trends and analytics metrics from Backend
 */
async function getTrendsMetrics(organizerId, filters = {}) {
  try {
    const response = await backendAPI.get(
      `/ai/dashboard/trends/${organizerId}`,
      {
        params: filters,
      }
    );

    return response.data.success ? response.data.data : null;
  } catch (error) {
    logger.error("Error fetching trends metrics:", error.message);
    throw error;
  }
}

/**
 * Set authentication token for API requests
 */
function setAuthToken(token) {
  if (token) {
    backendAPI.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete backendAPI.defaults.headers.common["Authorization"];
  }
}

module.exports = {
  generateMetricsReport,
  getEventMetrics,
  getRevenueMetrics,
  getBookingMetrics,
  getRatingMetrics,
  getSentimentMetrics,
  getTrendsMetrics,
  setAuthToken,
  backendAPI,
};
