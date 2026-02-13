const logger = require("../../../config/logger");
const BudgetOptimizer = require("./budget-optimizer");
const SlotPredictor = require("./slot-predictor");
const TagSuggester = require("./tag-suggester");
const DateTimeOptimizer = require("./datetime-optimizer");

/**
 * ORG PLANNING AGENT (Phase 3 - Refactored)
 * Purpose: Assist organizers with intelligent event creation
 * Scope: Orchestrates specialized modules for price, slots, tags, datetime, deadline
 * Agent Type: 'organizer'
 *
 * Refactored: Now a thin orchestrator – all business logic moved to dedicated classes.
 */
class PlanningAgent {
  constructor() {
    this.name = "planning-agent";
    this.agentType = "organizer";

    // Initialize all specialized modules
    this.budgetOptimizer = new BudgetOptimizer();
    this.slotPredictor = new SlotPredictor();
    this.tagSuggester = new TagSuggester();
    this.dateTimeOptimizer = new DateTimeOptimizer();
  }

  async initialize() {
    try {
      logger.agent(this.name, "Initializing ORG Planning Agent (Phase 3)");

      // Initialize tag suggester LLM (if needed)
      await this.tagSuggester.initialize();

      logger.success(`${this.name} initialized successfully`);
      return true;
    } catch (error) {
      logger.error(`${this.name} initialization failed: ${error.message}`);
      return false;
    }
  }

  // ============================================================
  // MASTER METHOD: OPTIMIZE EVENT CREATION
  // ============================================================
  async optimizeEventCreation(eventData) {
    try {
      logger.agent(
        this.name,
        `Optimizing event creation for: ${eventData.event_name}`
      );

      // Run all optimization tasks in parallel
      const [priceData, tagsData, slotsData, dateTimeData] = await Promise.all([
        this.budgetOptimizer.suggestOptimalPrice(eventData),
        this.tagSuggester.recommendTags(eventData),
        this.slotPredictor.suggestTotalSlots(eventData),
        this.dateTimeOptimizer.suggestEventDateTime(eventData),
      ]);

      // Validate registration deadline if provided
      let deadlineValidation = { isValid: true };
      if (eventData.registrationDeadline && eventData.event_date) {
        deadlineValidation =
          this.dateTimeOptimizer.validateRegistrationDeadline(
            eventData.event_date,
            eventData.registrationDeadline
          );
      }

      // Generate comprehensive recommendations using LLM
      const recommendations = await this.generateComprehensiveRecommendations(
        eventData,
        { priceData, tagsData, slotsData, dateTimeData }
      );

      const optimizedEvent = {
        originalData: eventData,
        suggestions: {
          price: priceData,
          tags: tagsData,
          totalSlots: slotsData,
          dateTime: dateTimeData,
          registrationDeadline: deadlineValidation,
        },
        recommendations,
        initialStatus: "pending", // Admin approval required
        confidence: {
          overall: this.calculateOverallConfidence([
            priceData.confidence,
            tagsData.confidence,
            slotsData.confidence,
            dateTimeData.confidence,
          ]),
          breakdown: {
            price: priceData.confidence,
            tags: tagsData.confidence,
            slots: slotsData.confidence,
            dateTime: dateTimeData.confidence,
          },
        },
        generatedAt: new Date().toISOString(),
      };

      logger.success(
        `Event optimization complete with ${optimizedEvent.confidence.overall}% confidence`
      );

      return {
        success: true,
        data: optimizedEvent,
      };
    } catch (error) {
      logger.error(`Event optimization failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================
  // HELPER: LLM RECOMMENDATIONS (unchanged from original)
  // ============================================================
  async generateComprehensiveRecommendations(eventData, suggestions) {
    // This method remains exactly as in the original index.js
    // It uses langchainConfig and llmModel – we'll need to import it here.
    // For brevity, I'm including the full method below.
    const langchainConfig = require("../../../config/langchain");
    const { HumanMessage, SystemMessage } = require("@langchain/core/messages");

    try {
      const systemPrompt = langchainConfig.createAgentPrompt("event-planning");
      const userQuery = `
Event: ${eventData.event_name}
Category: ${eventData.category}
Location: ${eventData.location}

AI Analysis:
- Suggested Price: NPR ${suggestions.priceData.suggestedPrice} (based on ${
        suggestions.priceData.comparableEvents?.length || 0
      } similar events)
- Suggested Slots: ${suggestions.slotsData.suggestedSlots} (avg occupancy: ${
        suggestions.slotsData.statistics?.averageOccupancy || 0
      }%)
- Best Day: ${suggestions.dateTimeData.suggestedDayOfWeek}
- Best Time: ${suggestions.dateTimeData.suggestedTimeSlot}

Task: Provide 3-5 actionable recommendations for the organizer to maximize event success.
Format: Return a JSON array of strings, each recommendation should be specific and actionable.
Example: ["Consider early-bird pricing to boost registrations", "Partner with local vendors to reduce costs"]
      `.trim();

      const llmModel = langchainConfig.getChatModel({
        temperature: 0.7,
        maxTokens: 1500,
      });

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userQuery),
      ];

      const response = await llmModel.invoke(messages);

      try {
        const parsed = JSON.parse(response.content);
        return Array.isArray(parsed) ? parsed : [response.content];
      } catch {
        // Fallback: split by newlines
        return response.content
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .slice(0, 5);
      }
    } catch (error) {
      logger.warn(
        `LLM recommendations failed, using fallback: ${error.message}`
      );
      return [
        `Set competitive pricing around NPR ${suggestions.priceData.suggestedPrice}`,
        `Plan for ${suggestions.slotsData.suggestedSlots} attendees based on category trends`,
        `Schedule event on ${suggestions.dateTimeData.suggestedDayOfWeek} for better turnout`,
      ];
    }
  }

  // ============================================================
  // HELPER: CONFIDENCE (unchanged)
  // ============================================================
  calculateOverallConfidence(confidences) {
    const avg = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    return Math.round(avg * 100);
  }

  // ============================================================
  // AGENT STATUS
  // ============================================================
  async getAgentStatus() {
    const langchainConfig = require("../../../config/langchain");
    return {
      name: this.name,
      type: this.agentType,
      status: "active",
      capabilities: [
        "price_optimization",
        "tag_recommendation",
        "slot_suggestion",
        "datetime_optimization",
        "deadline_validation",
      ],
      llmProvider: langchainConfig.provider,
      llmStatus: langchainConfig.isConfigured ? "ready" : "mock_mode",
    };
  }
}

module.exports = PlanningAgent;
