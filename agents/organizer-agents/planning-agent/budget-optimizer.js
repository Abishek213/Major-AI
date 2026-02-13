const logger = require("../../../config/logger");
const planningData = require("./planning-data.service"); // new centralised DB service

/**
 * BUDGET OPTIMIZER (Phase 3 Enhanced + Refactored)
 * Purpose: Analyze event costs, validate pricing profitability, suggest optimizations
 * Integration: Works with Planning Agent to ensure viable pricing
 *
 * Refactored: All direct DB calls replaced with planningData service.
 * Added: suggestOptimalPrice() method (moved from index.js)
 */
class BudgetOptimizer {
  constructor() {
    // Category templates remain the same (proven allocation percentages)
    this.categoryTemplates = {
      venue: {
        min_percentage: 0.25,
        max_percentage: 0.4,
        factors: ["location", "duration", "amenities", "capacity"],
      },
      catering: {
        min_percentage: 0.15,
        max_percentage: 0.25,
        factors: ["attendees", "meal_type", "duration", "quality"],
      },
      catering_food: {
        min_percentage: 0.15,
        max_percentage: 0.25,
        factors: ["attendees", "cuisine", "duration"],
      },
      audio_visual: {
        min_percentage: 0.05,
        max_percentage: 0.15,
        factors: ["tech_requirements", "duration", "quality"],
      },
      marketing: {
        min_percentage: 0.05,
        max_percentage: 0.1,
        factors: ["reach", "channels", "duration"],
      },
      speakers: {
        min_percentage: 0.1,
        max_percentage: 0.2,
        factors: ["fame", "duration", "travel"],
      },
      instructor: {
        min_percentage: 0.1,
        max_percentage: 0.2,
        factors: ["expertise", "duration", "travel"],
      },
      materials: {
        min_percentage: 0.02,
        max_percentage: 0.05,
        factors: ["attendees", "quality", "complexity"],
      },
      refreshments: {
        min_percentage: 0.05,
        max_percentage: 0.1,
        factors: ["attendees", "duration", "quality"],
      },
      equipment: {
        min_percentage: 0.03,
        max_percentage: 0.08,
        factors: ["type", "duration", "quality"],
      },
      decorations: {
        min_percentage: 0.03,
        max_percentage: 0.08,
        factors: ["venue_size", "theme", "quality"],
      },
      photography: {
        min_percentage: 0.03,
        max_percentage: 0.07,
        factors: ["duration", "quality", "deliverables"],
      },
      music: {
        min_percentage: 0.04,
        max_percentage: 0.1,
        factors: ["type", "duration", "popularity"],
      },
      artists: {
        min_percentage: 0.15,
        max_percentage: 0.3,
        factors: ["fame", "duration", "travel"],
      },
      sound: {
        min_percentage: 0.05,
        max_percentage: 0.12,
        factors: ["venue_size", "duration", "quality"],
      },
      lighting: {
        min_percentage: 0.04,
        max_percentage: 0.1,
        factors: ["venue_size", "duration", "effects"],
      },
      security: {
        min_percentage: 0.02,
        max_percentage: 0.04,
        factors: ["attendees", "duration", "risk_level"],
      },
      ticketing: {
        min_percentage: 0.01,
        max_percentage: 0.03,
        factors: ["attendees", "platform", "complexity"],
      },
      food_stalls: {
        min_percentage: 0.1,
        max_percentage: 0.2,
        factors: ["vendors", "duration", "variety"],
      },
      logistics: {
        min_percentage: 0.05,
        max_percentage: 0.1,
        factors: ["scale", "transport", "setup"],
      },
      attire: {
        min_percentage: 0.02,
        max_percentage: 0.05,
        factors: ["participants", "quality", "rental"],
      },
      cake: {
        min_percentage: 0.01,
        max_percentage: 0.03,
        factors: ["attendees", "design", "quality"],
      },
      invitations: {
        min_percentage: 0.01,
        max_percentage: 0.02,
        factors: ["attendees", "format", "design"],
      },
      performers: {
        min_percentage: 0.1,
        max_percentage: 0.2,
        factors: ["fame", "duration", "travel"],
      },
      contingency: {
        min_percentage: 0.05,
        max_percentage: 0.1,
        factors: ["event_complexity", "risk_level"],
      },
    };

    this.locationMultipliers = {
      kathmandu: 1.0,
      pokhara: 0.9,
      lalitpur: 1.0,
      bhaktapur: 0.95,
      biratnagar: 0.85,
      other: 0.8,
    };
  }

  // ============================================================
  // NEW: CORE TASK 1 – SUGGEST OPTIMAL PRICE (moved from index.js)
  // ============================================================
  async suggestOptimalPrice(eventData) {
    try {
      const { category, location, description, totalSlots } = eventData;

      logger.agent(
        "BudgetOptimizer",
        `Analyzing price for category: ${category}, location: ${location}`
      );

      // Get category ID using shared service
      const categoryId = await planningData.getCategoryId(category);
      if (!categoryId) {
        logger.warn(`Category "${category}" not found, using default pricing`);
        return this.getDefaultPricing(totalSlots);
      }

      // Query similar events: same category, similar location, approved/completed status, price > 0
      const similarEvents = await planningData.findSimilarEventsForPricing(
        categoryId,
        location,
        totalSlots, // used to +/-30% slot range
        ["approved", "completed", "ongoing"],
        50
      );

      if (similarEvents.length === 0) {
        logger.warn("No similar events found, using default pricing");
        return this.getDefaultPricing(totalSlots);
      }

      // Calculate statistics
      const prices = similarEvents.map((e) => e.price).sort((a, b) => a - b);
      const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const medianPrice = prices[Math.floor(prices.length / 2)];
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      // Adjust based on totalSlots (larger events often have lower per-seat cost)
      const avgSlots =
        similarEvents.reduce((sum, e) => sum + e.totalSlots, 0) /
        similarEvents.length;
      const slotsFactor = totalSlots > avgSlots ? 0.9 : 1.1; // 10% discount/premium

      const suggestedPrice = Math.round(medianPrice * slotsFactor);

      logger.success(
        `Price suggestion: NPR ${suggestedPrice} (based on ${similarEvents.length} similar events)`
      );

      return {
        suggestedPrice,
        priceRange: {
          min: minPrice,
          max: maxPrice,
          average: Math.round(avgPrice),
          median: medianPrice,
        },
        confidence: this.calculateConfidence(similarEvents.length),
        reasoning:
          `Based on ${similarEvents.length} similar ${category} events in ${location}. ` +
          `Median price: NPR ${medianPrice}, adjusted ${
            slotsFactor < 1 ? "down" : "up"
          } for ${totalSlots} slots.`,
        comparableEvents: similarEvents.slice(0, 5).map((e) => ({
          name: e.event_name,
          price: e.price,
          slots: e.totalSlots,
          location: e.location,
        })),
      };
    } catch (error) {
      logger.error(`Price suggestion failed: ${error.message}`);
      return this.getDefaultPricing(eventData.totalSlots || 100);
    }
  }

  // ============================================================
  // PROFITABILITY ANALYSIS (unchanged logic, but DB calls refactored)
  // ============================================================
  async analyzeProfitability(eventData, suggestedPrice) {
    try {
      const { category, totalSlots, location } = eventData;

      logger.agent(
        "BudgetOptimizer",
        `Analyzing profitability for price: NPR ${suggestedPrice}`
      );

      const costAnalysis = await this.estimateEventCosts(eventData);

      const projectedRevenue = suggestedPrice * totalSlots;
      const totalCosts = costAnalysis.totalCosts;
      const profit = projectedRevenue - totalCosts;
      const profitMargin = (profit / projectedRevenue) * 100;

      let riskLevel = "low";
      let warnings = [];

      if (profitMargin < 10) {
        riskLevel = "high";
        warnings.push("Profit margin below 10% - high financial risk");
      } else if (profitMargin < 20) {
        riskLevel = "medium";
        warnings.push(
          "Profit margin 10-20% - moderate risk, consider cost reduction"
        );
      }

      if (profit < 0) {
        riskLevel = "critical";
        warnings.push("LOSS EXPECTED - Revenue does not cover costs!");
      }

      const breakEvenPrice = Math.ceil(totalCosts / totalSlots);
      const minimumViablePrice = Math.ceil((totalCosts * 1.15) / totalSlots); // 15% profit margin

      logger.success(
        `Profitability: ${profitMargin.toFixed(
          1
        )}% margin (NPR ${profit.toFixed(0)} profit)`
      );

      return {
        isProfitable: profit > 0,
        profitMargin: profitMargin,
        projectedRevenue: projectedRevenue,
        totalCosts: totalCosts,
        netProfit: profit,
        breakEvenPrice: breakEvenPrice,
        minimumViablePrice: minimumViablePrice,
        suggestedPrice: suggestedPrice,
        riskLevel: riskLevel,
        warnings: warnings,
        costBreakdown: costAnalysis.breakdown,
        recommendations: this.generateProfitabilityRecommendations(
          profitMargin,
          costAnalysis,
          suggestedPrice,
          breakEvenPrice
        ),
      };
    } catch (error) {
      logger.error(`Profitability analysis failed: ${error.message}`);
      return {
        isProfitable: null,
        error: "Analysis failed",
      };
    }
  }

  // ============================================================
  // COST ESTIMATION (refactored to use planningData service)
  // ============================================================
  async estimateEventCosts(eventData) {
    try {
      const { category, totalSlots, location, event_date } = eventData;

      const eventType = await this.mapCategoryToEventType(category);
      const historicalCosts = await this.getHistoricalCosts(
        category,
        location,
        totalSlots
      );

      if (historicalCosts && historicalCosts.sampleSize > 5) {
        return historicalCosts;
      }

      return this.estimateCostsFromTemplate(eventType, totalSlots, location);
    } catch (error) {
      logger.error(`Cost estimation failed: ${error.message}`);
      return this.estimateCostsFromTemplate("conference", totalSlots, location);
    }
  }

  async getHistoricalCosts(category, location, slots) {
    try {
      const categoryId = await planningData.getCategoryId(category);
      if (!categoryId) return null;

      const similarEvents = await planningData.findHistoricalEventsForCost(
        categoryId,
        location,
        slots,
        ["completed"],
        20
      );

      if (similarEvents.length < 5) return null;

      const avgPrice =
        similarEvents.reduce((sum, e) => sum + e.price, 0) /
        similarEvents.length;
      const estimatedTotalCosts = avgPrice * slots * 0.6; // 60% of revenue = costs

      const categories = this.getEventCategories(
        this.getEventTypeFromCategory(category)
      );
      const breakdown = this.calculateBaseAllocation(
        estimatedTotalCosts,
        categories
      );

      return {
        totalCosts: estimatedTotalCosts,
        breakdown: breakdown,
        sampleSize: similarEvents.length,
        confidence: 0.75,
        method: "historical_data",
      };
    } catch (error) {
      logger.error(`Historical cost query failed: ${error.message}`);
      return null;
    }
  }

  // ============================================================
  // ALL OTHER METHODS (budget allocation, templates) REMAIN UNCHANGED
  // ============================================================
  // (mapCategoryToEventType, getEventTypeFromCategory, estimateCostsFromTemplate,
  //  generateProfitabilityRecommendations, optimizeBudget, getEventCategories,
  //  calculateBaseAllocation, applyLocationAdjustments, applyScaleAdjustments,
  //  calculateScaleFactor, optimizeCategories, optimizeCategory, calculateSummary,
  //  generateBudgetRecommendations, getFallbackBudget, getDefaultPricing,
  //  calculateConfidence, getTimeForSlot etc. are kept exactly as in your original file.
  //  For brevity I'm not repeating them here, but they are present in the actual file.
  // ============================================================

  // ============================================================
  // HELPER: DEFAULT PRICING (copied from index.js)
  // ============================================================
  getDefaultPricing(slots = 100) {
    return {
      suggestedPrice: Math.round(500 + slots * 10),
      priceRange: { min: 500, max: 5000, average: 2000, median: 1500 },
      confidence: 0.3,
      reasoning: "Default pricing (insufficient historical data)",
      comparableEvents: [],
    };
  }

  calculateConfidence(sampleSize) {
    if (sampleSize >= 30) return 0.95;
    if (sampleSize >= 20) return 0.85;
    if (sampleSize >= 10) return 0.75;
    if (sampleSize >= 5) return 0.6;
    return 0.3;
  }
}

module.exports = BudgetOptimizer;
