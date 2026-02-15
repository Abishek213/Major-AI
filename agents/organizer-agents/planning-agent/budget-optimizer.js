const logger = require("../../../config/logger");
const planningData = require("./planning-data.service");

class BudgetOptimizer {
  constructor() {
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

    this.eventTypeCategories = {
      conference: ["venue", "catering", "audio_visual", "marketing", "speakers", "materials", "contingency"],
      workshop: ["venue", "instructor", "materials", "refreshments", "equipment", "contingency"],
      wedding: ["venue", "catering_food", "decorations", "photography", "music", "cake", "invitations", "contingency"],
      birthday: ["venue", "catering_food", "decorations", "cake", "music", "contingency"],
      concert: ["venue", "artists", "sound", "lighting", "security", "ticketing", "marketing", "contingency"],
      festival: ["venue", "artists", "sound", "lighting", "food_stalls", "security", "logistics", "marketing", "contingency"],
      seminar: ["venue", "speakers", "catering", "audio_visual", "materials", "contingency"],
      training: ["venue", "instructor", "materials", "catering", "equipment", "contingency"],
      party: ["venue", "catering_food", "music", "decorations", "contingency"],
      exhibition: ["venue", "logistics", "security", "marketing", "contingency"],
      meetup: ["venue", "refreshments", "audio_visual", "contingency"],
      webinar: ["audio_visual", "marketing", "contingency"],
    };

    // Category name to event type mapping (MongoDB categories to internal types)
    this.categoryMapping = {
      conference: "conference",
      workshop: "workshop",
      wedding: "wedding",
      birthday: "birthday",
      concert: "concert",
      festival: "festival",
      seminar: "seminar",
      training: "training",
      party: "party",
      exhibition: "exhibition",
      meetup: "meetup",
      webinar: "webinar",
      // Aliases
      "tech conference": "conference",
      "business conference": "conference",
      "music concert": "concert",
      "food festival": "festival",
      "art exhibition": "exhibition",
      "networking meetup": "meetup",
      "online workshop": "webinar",
      "corporate training": "training",
      "birthday party": "birthday",
      "wedding ceremony": "wedding",
    };
  }

  // ============================================================
  // CORE TASK 1: SUGGEST OPTIMAL PRICE
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
  // PROFITABILITY ANALYSIS
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
  // COST ESTIMATION
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

      const eventType = this.getEventTypeFromCategory(category);
      const categories = this.getEventCategories(eventType);
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
  // CATEGORY MAPPING METHODS
  // ============================================================
  async mapCategoryToEventType(category) {
    try {
      // If category is already a string (category name), use direct mapping
      if (typeof category === "string") {
        const lowerCategory = category.toLowerCase();
        return this.categoryMapping[lowerCategory] || "conference";
      }

      // If category is ObjectId, fetch from database
      const categoryId = await planningData.getCategoryId(category);
      if (!categoryId) return "conference";

      // Get category document to get name
      const { getDb } = require("../../../config/mongodb");
      const db = getDb();
      const categoryDoc = await db.collection("categories").findOne({ _id: categoryId });
      
      if (categoryDoc && categoryDoc.categoryName) {
        const lowerCategory = categoryDoc.categoryName.toLowerCase();
        return this.categoryMapping[lowerCategory] || "conference";
      }

      return "conference";
    } catch (error) {
      logger.error(`Category mapping failed: ${error.message}`);
      return "conference";
    }
  }

  getEventTypeFromCategory(category) {
    const lowerCategory = (category || "").toLowerCase();
    return this.categoryMapping[lowerCategory] || "conference";
  }

  // ============================================================
  // TEMPLATE-BASED COST ESTIMATION
  // ============================================================
  estimateCostsFromTemplate(eventType, totalSlots, location) {
    try {
      // Base cost per attendee (in NPR) - varies by event type
      const baseCostPerAttendee = {
        conference: 2500,
        workshop: 1500,
        wedding: 3000,
        birthday: 1200,
        concert: 2000,
        festival: 1800,
        seminar: 2000,
        training: 1800,
        party: 1500,
        exhibition: 2200,
        meetup: 800,
        webinar: 500,
      };

      const perAttendeeCost = baseCostPerAttendee[eventType] || 2000;
      const baseTotalCost = perAttendeeCost * totalSlots;

      // Get cost categories for this event type
      const categories = this.getEventCategories(eventType);

      // Calculate base allocation
      let breakdown = this.calculateBaseAllocation(baseTotalCost, categories);

      // Apply location adjustments
      breakdown = this.applyLocationAdjustments(breakdown, location);

      // Apply scale adjustments (economies of scale for larger events)
      const avgSlots = 100; // Average event size
      breakdown = this.applyScaleAdjustments(breakdown, totalSlots, avgSlots);

      // Calculate final summary
      const summary = this.calculateSummary(breakdown);

      logger.agent(
        "BudgetOptimizer",
        `Template estimate: NPR ${summary.totalCosts} for ${totalSlots} attendees`
      );

      return {
        totalCosts: summary.totalCosts,
        breakdown: breakdown,
        sampleSize: 0,
        confidence: 0.5,
        method: "template_estimation",
      };
    } catch (error) {
      logger.error(`Template estimation failed: ${error.message}`);
      return this.getFallbackBudget(totalSlots);
    }
  }

  // ============================================================
  // BUDGET ALLOCATION METHODS
  // ============================================================
  getEventCategories(eventType) {
    return this.eventTypeCategories[eventType] || this.eventTypeCategories.conference;
  }

  calculateBaseAllocation(totalBudget, categories) {
    const breakdown = {};

    categories.forEach((categoryKey) => {
      const template = this.categoryTemplates[categoryKey];
      if (!template) return;

      // Use average of min and max percentage
      const avgPercentage =
        (template.min_percentage + template.max_percentage) / 2;
      const amount = totalBudget * avgPercentage;

      breakdown[categoryKey] = {
        amount: Math.round(amount),
        percentage: avgPercentage * 100,
        min: Math.round(totalBudget * template.min_percentage),
        max: Math.round(totalBudget * template.max_percentage),
        factors: template.factors,
      };
    });

    return breakdown;
  }

  applyLocationAdjustments(breakdown, location) {
    const locationKey = (location || "").toLowerCase();
    const multiplier = this.locationMultipliers[locationKey] || this.locationMultipliers.other;

    const adjusted = {};
    Object.keys(breakdown).forEach((key) => {
      adjusted[key] = {
        ...breakdown[key],
        amount: Math.round(breakdown[key].amount * multiplier),
        min: Math.round(breakdown[key].min * multiplier),
        max: Math.round(breakdown[key].max * multiplier),
      };
    });

    return adjusted;
  }

  applyScaleAdjustments(breakdown, actualSlots, avgSlots) {
    const scaleFactor = this.calculateScaleFactor(actualSlots, avgSlots);

    const adjusted = {};
    Object.keys(breakdown).forEach((key) => {
      // Venue, security, logistics scale more with size
      const scaleSensitive = ["venue", "security", "logistics", "ticketing"];
      const factor = scaleSensitive.includes(key) ? scaleFactor : 1.0;

      adjusted[key] = {
        ...breakdown[key],
        amount: Math.round(breakdown[key].amount * factor),
        min: Math.round(breakdown[key].min * factor),
        max: Math.round(breakdown[key].max * factor),
      };
    });

    return adjusted;
  }

  calculateScaleFactor(actualSlots, avgSlots) {
    if (actualSlots > avgSlots * 2) {
      return 0.85; // 15% discount for very large events
    } else if (actualSlots > avgSlots * 1.5) {
      return 0.9; // 10% discount for large events
    } else if (actualSlots < avgSlots * 0.5) {
      return 1.15; // 15% premium for small events
    } else if (actualSlots < avgSlots * 0.7) {
      return 1.1; // 10% premium for smaller events
    }
    return 1.0; // No adjustment
  }

  calculateSummary(breakdown) {
    const totalCosts = Object.values(breakdown).reduce(
      (sum, cat) => sum + cat.amount,
      0
    );

    return {
      totalCosts: Math.round(totalCosts),
      categoriesCount: Object.keys(breakdown).length,
      largestCategory: this.findLargestCategory(breakdown),
    };
  }

  findLargestCategory(breakdown) {
    let largest = { name: "", amount: 0 };
    Object.entries(breakdown).forEach(([name, data]) => {
      if (data.amount > largest.amount) {
        largest = { name, amount: data.amount };
      }
    });
    return largest;
  }

  // ============================================================
  // RECOMMENDATION GENERATION
  // ============================================================
  generateProfitabilityRecommendations(
    profitMargin,
    costAnalysis,
    suggestedPrice,
    breakEvenPrice
  ) {
    const recommendations = [];

    // Profit margin recommendations
    if (profitMargin < 0) {
      recommendations.push({
        priority: "critical",
        category: "pricing",
        message: `URGENT: Current pricing leads to loss. Increase price to at least NPR ${breakEvenPrice} to break even.`,
      });
    } else if (profitMargin < 10) {
      recommendations.push({
        priority: "high",
        category: "pricing",
        message: `Low profit margin (${profitMargin.toFixed(
          1
        )}%). Consider increasing price by 10-15% or reducing costs.`,
      });
    } else if (profitMargin > 50) {
      recommendations.push({
        priority: "low",
        category: "pricing",
        message: `High profit margin (${profitMargin.toFixed(
          1
        )}%). Consider lowering price to attract more attendees or investing in premium services.`,
      });
    }

    // Cost optimization recommendations
    if (costAnalysis.breakdown) {
      const largest = this.findLargestCategory(costAnalysis.breakdown);
      if (largest.amount > costAnalysis.totalCosts * 0.4) {
        recommendations.push({
          priority: "medium",
          category: "costs",
          message: `${largest.name} represents ${(
            (largest.amount / costAnalysis.totalCosts) *
            100
          ).toFixed(1)}% of costs. Consider negotiating better rates.`,
        });
      }
    }

    // General recommendations
    recommendations.push({
      priority: "low",
      category: "strategy",
      message: "Consider early-bird pricing to improve cash flow and reduce financial risk.",
    });

    recommendations.push({
      priority: "low",
      category: "strategy",
      message: "Explore sponsorship opportunities to offset costs and increase profitability.",
    });

    return recommendations;
  }

  // ============================================================
  // OPTIMIZATION METHODS
  // ============================================================
  async optimizeBudget(eventData, targetMargin = 20) {
    try {
      const costAnalysis = await this.estimateEventCosts(eventData);
      const { totalSlots } = eventData;

      // Calculate target revenue for desired margin
      const targetRevenue = costAnalysis.totalCosts / (1 - targetMargin / 100);
      const targetPrice = Math.ceil(targetRevenue / totalSlots);

      // Optimize categories to reduce costs if needed
      const optimizedBreakdown = this.optimizeCategories(
        costAnalysis.breakdown,
        targetMargin
      );

      const optimizedTotal = Object.values(optimizedBreakdown).reduce(
        (sum, cat) => sum + cat.amount,
        0
      );

      return {
        originalCosts: costAnalysis.totalCosts,
        optimizedCosts: optimizedTotal,
        savings: costAnalysis.totalCosts - optimizedTotal,
        targetPrice: targetPrice,
        optimizedBreakdown: optimizedBreakdown,
        recommendations: this.generateBudgetRecommendations(
          costAnalysis.breakdown,
          optimizedBreakdown
        ),
      };
    } catch (error) {
      logger.error(`Budget optimization failed: ${error.message}`);
      return null;
    }
  }

  optimizeCategories(breakdown, targetMargin) {
    const optimized = {};

    Object.entries(breakdown).forEach(([key, data]) => {
      // Try to reduce non-essential categories by 10-15%
      const nonEssential = [
        "decorations",
        "photography",
        "marketing",
        "contingency",
      ];
      const reductionFactor = nonEssential.includes(key) ? 0.85 : 0.95;

      optimized[key] = {
        ...data,
        amount: Math.round(data.amount * reductionFactor),
        optimized: reductionFactor < 1,
      };
    });

    return optimized;
  }

  optimizeCategory(categoryKey, currentAmount, reduction = 0.1) {
    return {
      original: currentAmount,
      optimized: Math.round(currentAmount * (1 - reduction)),
      reduction: reduction * 100,
      category: categoryKey,
    };
  }

  generateBudgetRecommendations(originalBreakdown, optimizedBreakdown) {
    const recommendations = [];

    Object.keys(originalBreakdown).forEach((key) => {
      const original = originalBreakdown[key].amount;
      const optimized = optimizedBreakdown[key].amount;

      if (original > optimized) {
        const savings = original - optimized;
        const savingsPercent = ((savings / original) * 100).toFixed(1);

        recommendations.push({
          category: key,
          suggestion: `Reduce ${key} costs by ${savingsPercent}% (NPR ${savings})`,
          originalAmount: original,
          optimizedAmount: optimized,
          savings: savings,
        });
      }
    });

    return recommendations;
  }

  // ============================================================
  // FALLBACK METHODS
  // ============================================================
  getFallbackBudget(totalSlots) {
    const baseCost = 2000 * totalSlots; // NPR 2000 per person

    return {
      totalCosts: baseCost,
      breakdown: {
        venue: { amount: baseCost * 0.3, percentage: 30 },
        catering: { amount: baseCost * 0.25, percentage: 25 },
        audio_visual: { amount: baseCost * 0.1, percentage: 10 },
        marketing: { amount: baseCost * 0.08, percentage: 8 },
        speakers: { amount: baseCost * 0.15, percentage: 15 },
        contingency: { amount: baseCost * 0.12, percentage: 12 },
      },
      sampleSize: 0,
      confidence: 0.3,
      method: "fallback_estimation",
    };
  }

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

  // ============================================================
  // UTILITY METHODS
  // ============================================================
  getTimeForSlot(slot) {
    const times = {
      morning: "10:00",
      afternoon: "14:00",
      evening: "18:00",
    };
    return times[slot] || "14:00";
  }
}

module.exports = BudgetOptimizer;