const { ChatOllama } = require("@langchain/ollama");
const logger = require("../../../config/logger");
const backendAPI = require("./mongo-query-agent");
const {
  getPromptTemplate,
  formatMetricsForPrompt,
} = require("./prompt-templates");

class OrganizerDashboardAssistant {
  constructor() {
    this.agentType = "organizer";
    this.agentRole = "assistant";
    this.llm = new ChatOllama({
      model: process.env.OLLAMA_MODEL || "llama3.2",
      temperature: 0.3,
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      streaming: true, // ✅ enable streaming
    });
    this.organizerId = null;
  }

  async initialize(organizerId, token) {
    try {
      logger.info(
        `Initializing Dashboard Assistant for organizer: ${organizerId}`
      );
      this.organizerId = organizerId;
      backendAPI.setAuthToken(token);

      return {
        success: true,
        message: "Dashboard Assistant initialized successfully",
        organizerId: this.organizerId,
      };
    } catch (error) {
      logger.error("Error initializing Dashboard Assistant:", error);
      throw error;
    }
  }

  async getDashboardMetrics(filters = {}) {
    if (!this.organizerId)
      throw new Error("Agent not initialized. Call initialize() first.");

    logger.info(
      `Fetching dashboard metrics for organizer: ${this.organizerId}`
    );
    const metricsData = await backendAPI.generateMetricsReport(
      this.organizerId,
      filters
    );
    const insights = await this._generateInsights(metricsData);

    return {
      success: true,
      organizerId: this.organizerId,
      timestamp: new Date().toISOString(),
      metrics: metricsData,
      insights,
      filters,
    };
  }

  async getSpecificMetric(metricType, options = {}) {
    if (!this.organizerId)
      throw new Error("Agent not initialized. Call initialize() first.");

    logger.info(`Fetching ${metricType} for organizer: ${this.organizerId}`);
    let specificData;

    switch (metricType.toLowerCase()) {
      case "revenue":
        specificData = await backendAPI.getRevenueMetrics(
          this.organizerId,
          options
        );
        break;
      case "bookings":
        specificData = await backendAPI.getBookingMetrics(
          this.organizerId,
          options
        );
        break;
      case "ratings":
        specificData = await backendAPI.getRatingMetrics(
          this.organizerId,
          options
        );
        break;
      case "sentiment":
        specificData = await backendAPI.getSentimentMetrics(
          this.organizerId,
          options
        );
        break;
      case "events":
        specificData = await backendAPI.getEventMetrics(
          this.organizerId,
          options
        );
        break;
      case "trends":
        specificData = await backendAPI.getTrendsMetrics(
          this.organizerId,
          options
        );
        break;
      default:
        throw new Error(`Unknown metric type: ${metricType}`);
    }

    return {
      success: true,
      metricType,
      data: specificData,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * =========================
   * Streaming Recommendations
   * =========================
   */
  async getRecommendations(context = {}) {
    if (!this.organizerId)
      throw new Error("Agent not initialized. Call initialize() first.");
    logger.info(
      `Generating recommendations for organizer: ${this.organizerId}`
    );

    const metricsData = await backendAPI.generateMetricsReport(
      this.organizerId,
      context.filters || {}
    );

    const metricsSummary = formatMetricsForPrompt(metricsData);
    const prompt = getPromptTemplate("recommendations");
    const formattedPrompt = await prompt.format({
      metrics: metricsSummary,
      context: JSON.stringify(context, null, 2),
    });

    let recommendationsText = "";
    const stream = await this.llm.stream(formattedPrompt);

    for await (const token of stream) {
      // ✅ Append only string content
      if (typeof token === "string") {
        recommendationsText += token;
      } else if (token?.text) {
        recommendationsText += token.text;
      } else {
        recommendationsText += JSON.stringify(token);
      }
    }

    return {
      success: true,
      recommendations: recommendationsText,
      basedOn: "Current metrics and historical trends",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * =========================
   * Streaming Query Answer
   * =========================
   */
  async answerQuery(query) {
    if (!this.organizerId)
      throw new Error("Agent not initialized. Call initialize() first.");
    logger.info(`Processing query for organizer ${this.organizerId}: ${query}`);

    const metricsData = await backendAPI.generateMetricsReport(
      this.organizerId,
      {}
    );
    const metricsSummary = formatMetricsForPrompt(metricsData);

    const prompt = getPromptTemplate("query");
    const formattedPrompt = await prompt.format({
      metrics: metricsSummary,
      query,
    });

    let answerText = "";
    const stream = await this.llm.stream(formattedPrompt);

    for await (const token of stream) {
      // ✅ Append only string content
      if (typeof token === "string") {
        answerText += token;
      } else if (token?.text) {
        answerText += token.text;
      } else {
        answerText += JSON.stringify(token);
      }
    }

    return {
      success: true,
      query,
      answer: answerText,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * =========================
   * Streaming Insights
   * =========================
   */
  async _generateInsights(metricsData) {
    try {
      const metricsSummary = formatMetricsForPrompt(metricsData);
      const prompt = getPromptTemplate("insights");
      const formattedPrompt = await prompt.format({ metrics: metricsSummary });

      let summaryText = "";
      const stream = await this.llm.stream(formattedPrompt);

      for await (const token of stream) {
        // ✅ Append only string content
        if (typeof token === "string") {
          summaryText += token;
        } else if (token?.text) {
          summaryText += token.text;
        } else {
          summaryText += JSON.stringify(token);
        }
      }

      return {
        summary: summaryText,
        highlights: this._extractHighlights(metricsData),
        concerns: this._identifyConcerns(metricsData),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Error generating insights:", error);
      return {
        summary: "Unable to generate AI summary at this time",
        highlights: this._extractHighlights(metricsData),
        concerns: this._identifyConcerns(metricsData),
        error: error.message,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  _extractHighlights(metricsData) {
    const highlights = [];
    if (metricsData?.revenue?.total > 10000)
      highlights.push({
        type: "revenue",
        message: `Strong revenue: NPR ${metricsData.revenue.total.toLocaleString()}`,
      });
    if (metricsData?.bookings?.conversionRate > 0.7)
      highlights.push({
        type: "conversion",
        message: `Excellent booking conversion: ${(
          metricsData.bookings.conversionRate * 100
        ).toFixed(1)}%`,
      });
    if (metricsData?.ratings?.average > 4.0)
      highlights.push({
        type: "rating",
        message: `High customer satisfaction: ${metricsData.ratings.average.toFixed(
          1
        )}/5.0`,
      });
    if (metricsData?.sentiment?.averageScore > 0.6)
      highlights.push({
        type: "sentiment",
        message: `Positive feedback sentiment: ${(
          metricsData.sentiment.averageScore * 100
        ).toFixed(0)}%`,
      });
    return highlights;
  }

  _identifyConcerns(metricsData) {
    const concerns = [];
    if (metricsData?.bookings?.conversionRate < 0.3)
      concerns.push({
        type: "conversion",
        severity: "high",
        message: `Low booking conversion rate: ${(
          metricsData.bookings.conversionRate * 100
        ).toFixed(1)}%`,
        suggestion: "Review pricing strategy and event descriptions",
      });
    if (metricsData?.ratings?.average < 3.0)
      concerns.push({
        type: "rating",
        severity: "high",
        message: `Below-average ratings: ${metricsData.ratings.average.toFixed(
          1
        )}/5.0`,
        suggestion: "Review recent feedback and address common complaints",
      });
    if (metricsData?.sentiment?.averageScore < 0)
      concerns.push({
        type: "sentiment",
        severity: "high",
        message: `Negative feedback sentiment detected`,
        suggestion: "Analyze negative reviews and implement improvements",
      });
    if (metricsData?.events?.averageAttendanceRate < 0.5)
      concerns.push({
        type: "attendance",
        severity: "medium",
        message: `Low average attendance rate: ${(
          metricsData.events.averageAttendanceRate * 100
        ).toFixed(1)}%`,
        suggestion: "Better promotion and reminders before events",
      });

    return concerns;
  }
}

module.exports = OrganizerDashboardAssistant;
