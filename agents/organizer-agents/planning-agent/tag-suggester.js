const logger = require("../../../config/logger");
const planningData = require("./planning-data.service");
const langchainConfig = require("../../../config/langchain");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");

/**
 * TAG SUGGESTER (Phase 3)
 * Purpose: Recommend relevant tags for events using LLM + category trends
 * Scope: Query popular tags from similar events, enhance with LLM reasoning
 * Integration: Used by Planning Agent orchestrator
 */
class TagSuggester {
  constructor() {
    this.llmModel = null;
  }

  async initialize() {
    try {
      this.llmModel = langchainConfig.getChatModel({
        temperature: 0.7,
        maxTokens: 1000,
      });
      return true;
    } catch (error) {
      logger.error(`TagSuggester LLM init failed: ${error.message}`);
      return false;
    }
  }

  // ============================================================
  // CORE TASK: RECOMMEND TAGS
  // ============================================================
  async recommendTags(eventData) {
    try {
      const { event_name, description, category } = eventData;

      logger.agent(
        "TagSuggester",
        `Generating tag recommendations for: ${event_name}`
      );

      // Ensure LLM is ready
      if (!this.llmModel) {
        await this.initialize();
      }

      // Get popular tags from same category
      const popularTags = await this.getPopularTags(category);

      let aiTags = [];

      if (this.llmModel) {
        aiTags = await this.generateTagsWithLLM(
          event_name,
          description,
          category,
          popularTags
        );
      } else {
        logger.warn("LLM unavailable, using fallback tags");
        aiTags = this.getFallbackTags(category, description);
      }

      // Merge popular + AI tags, remove duplicates, limit
      const allSuggested = [
        ...new Set([...popularTags.slice(0, 3), ...aiTags]),
      ].slice(0, 8);

      logger.success(
        `Generated ${allSuggested.length} tags: ${allSuggested.join(", ")}`
      );

      return {
        suggestedTags: allSuggested,
        popularTags: popularTags.slice(0, 10),
        reasoning: this.llmModel
          ? "AI-generated tags based on event description and category trends"
          : "Fallback tags (LLM unavailable)",
        confidence: this.llmModel ? 0.85 : 0.3,
      };
    } catch (error) {
      logger.error(`Tag recommendation failed: ${error.message}`);
      return {
        suggestedTags: [
          "event",
          "gathering",
          (eventData.category || "event").toLowerCase(),
        ],
        popularTags: [],
        reasoning: "Error fallback",
        confidence: 0.2,
      };
    }
  }

  // ============================================================
  // GET POPULAR TAGS FROM DATABASE
  // ============================================================
  async getPopularTags(category) {
    try {
      const categoryId = await planningData.getCategoryId(category);
      if (!categoryId) return [];

      const db = planningData.getDb(); // We need to expose getDb() from service? Actually we can import getDb directly.
      // But better to add a method to planningData. For now, I'll import getDb.
      const { getDb } = require("../../../config/mongodb");
      const eventsCollection = db.collection("events");

      const results = await eventsCollection
        .aggregate([
          { $match: { category: categoryId } },
          { $unwind: "$tags" },
          { $group: { _id: "$tags", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ])
        .toArray();

      return results.map((t) => t._id);
    } catch (error) {
      logger.error(`Failed to fetch popular tags: ${error.message}`);
      return [];
    }
  }

  // ============================================================
  // LLM-BASED TAG GENERATION
  // ============================================================
  async generateTagsWithLLM(eventName, description, category, popularTags) {
    try {
      const systemPrompt = langchainConfig.createAgentPrompt("event-planning");
      const userQuery = `
Event Name: ${eventName}
Description: ${description}
Category: ${category}

Popular tags in this category: ${popularTags.join(", ")}

Task: Suggest 5-8 relevant tags for this event. 
- Include 2-3 from the popular tags if they are relevant
- Add 3-5 unique tags based on the description
- Format: Return ONLY a comma-separated list of tags, no explanations
- Example: "networking, professional, tech, innovation, workshop"
      `.trim();

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userQuery),
      ];

      const response = await this.llmModel.invoke(messages);
      const tags = response.content
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0 && tag.length < 30)
        .slice(0, 8);

      return tags;
    } catch (error) {
      logger.error(`LLM tag generation failed: ${error.message}`);
      return this.getFallbackTags(category, description);
    }
  }

  // ============================================================
  // FALLBACK: Rule-based tags
  // ============================================================
  getFallbackTags(category, description) {
    const categoryLower = category?.toLowerCase() || "";
    const baseTags = [categoryLower, "event"];

    // Extract keywords from description (simple word extraction)
    const words = description?.toLowerCase().split(/\W+/) || [];
    const commonWords = [
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "for",
      "with",
    ];
    const keywords = words
      .filter((w) => w.length > 3 && !commonWords.includes(w))
      .slice(0, 5);

    return [...new Set([...baseTags, ...keywords])].slice(0, 6);
  }
}

module.exports = TagSuggester;
