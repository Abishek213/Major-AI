/**
 * Organizer Dashboard Assistant - Prompt Templates
 * Fully optimized for streaming and condensed metrics
 * Prevents sending huge JSON to LLM (~300 tokens instead of 3000+)
 */

const { PromptTemplate } = require("@langchain/core/prompts");

/**
 * ============================================
 * METRICS OPTIMIZATION LAYER
 * ============================================
 */

/**
 * Extract essential dashboard KPIs
 */
function prepareMetricsSummary(metricsData = {}) {
  return {
    totalEvents: metricsData?.events?.total || 0,
    totalBookings: metricsData?.bookings?.total || 0,
    conversionRate: metricsData?.bookings?.conversionRate || 0,
    totalRevenue: metricsData?.revenue?.total || 0,
    averageRating: metricsData?.ratings?.average || 0,
    attendanceRate: metricsData?.events?.averageAttendanceRate || 0,
    sentimentScore: metricsData?.sentiment?.averageScore || 0,
    uniqueUsers: metricsData?.trends?.userDemographics?.uniqueUsers || 0,
  };
}

/**
 * Convert summarized metrics into LLM-friendly text
 */
function formatMetricsForPrompt(metricsData) {
  if (!metricsData) return "No metrics available.";

  try {
    // Create a concise string summary instead of passing raw objects
    const summary = {
      events: metricsData.events?.total ?? 0,
      totalRevenue: metricsData.revenue?.total ?? 0,
      conversionRate: metricsData.bookings?.conversionRate ?? 0,
      averageRating: metricsData.ratings?.average ?? 0,
      sentimentScore: metricsData.sentiment?.averageScore ?? 0,
      popularCategories: metricsData.trends?.popularCategories?.map(
        (cat) => `${cat._id} (${cat.eventCount})`
      ),
    };

    return JSON.stringify(summary, null, 2);
  } catch (err) {
    return "Metrics summary unavailable.";
  }
}

/**
 * ============================================
 * PROMPT TEMPLATES (Predefined for Insights, Queries, Recommendations)
 * ============================================
 */

/** Insights generation prompt */
function createInsightsPrompt() {
  const template = `You are an AI dashboard analyst helping event organizers understand their performance metrics.

{metrics}

Generate insights including:
1. Key highlights (positive metrics)
2. Areas of concern (metrics needing attention)
3. Trends (patterns over time)
4. Actionable recommendations

Format as a professional dashboard summary.
Be specific with numbers and percentages.
Focus on actionable insights.

Response format:
**Summary:**
[2-3 sentence overview]

**Highlights:**
- [Positive metric]
- [Another highlight]

**Concerns:**
- [Concern with metric]
- [Suggested action]

**Trends:**
- [Pattern]
- [Meaning]

**Recommendations:**
1. [Actionable recommendation]
2. [Another recommendation]
`;
  return PromptTemplate.fromTemplate(template);
}

/** Natural language query prompt */
function createQueryPrompt() {
  const template = `You are an AI assistant helping an event organizer understand their dashboard metrics.

{metrics}

User question:
{query}

Answer clearly using only the metrics provided.
Include relevant numbers and percentages.

If data is missing, say so and suggest required metrics.
Keep it conversational and professional.
`;
  return PromptTemplate.fromTemplate(template);
}

/** Recommendations generation prompt */
function createRecommendationsPrompt() {
  const template = `You are an AI business consultant helping an event organizer improve events.

{metrics}

Additional context:
{context}

Generate 5-7 specific recommendations to improve:
1. Revenue & profitability
2. Booking conversion
3. Customer satisfaction
4. Attendance rates
5. Overall success

For each:
- Be actionable
- Reference metrics
- Explain impact
- Suggest implementation

Format as numbered list.
`;
  return PromptTemplate.fromTemplate(template);
}

/**
 * ============================================
 * TEMPLATE CACHE (Performance Optimized)
 * ============================================
 */
const templates = {
  insights: createInsightsPrompt(),
  query: createQueryPrompt(),
  recommendations: createRecommendationsPrompt(),
};

/** Get template by name */
function getPromptTemplate(type) {
  // Mock template object with a simple format() method
  return {
    async format(data) {
      switch (type) {
        case "recommendations":
          return `Generate recommendations based on metrics:\n${data.metrics}\nContext:\n${data.context}`;
        case "query":
          return `Answer the following query using metrics:\n${data.metrics}\nQuery:\n${data.query}`;
        case "insights":
          return `Generate insights based on metrics:\n${data.metrics}`;
        default:
          return JSON.stringify(data);
      }
    },
  };
}

/**
 * ============================================
 * SAFE PROMPT FORMATTER (Prevents huge JSON payloads)
 * ============================================
 */
async function buildFormattedPrompt(
  templateName,
  { metricsData = {}, query = "", context = "" } = {}
) {
  const template = getPromptTemplate(templateName);
  const formattedMetrics = formatMetricsForPrompt(metricsData);
  return template.format({
    metrics: formattedMetrics,
    query,
    context,
  });
}

module.exports = {
  getPromptTemplate,
  createInsightsPrompt,
  createQueryPrompt,
  createRecommendationsPrompt,
  prepareMetricsSummary,
  formatMetricsForPrompt,
  buildFormattedPrompt,
};
