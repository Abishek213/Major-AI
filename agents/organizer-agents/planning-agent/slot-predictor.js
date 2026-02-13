const logger = require("../../../config/logger");
const planningData = require("./planning-data.service");

/**
 * SLOT PREDICTOR (Phase 3)
 * Purpose: Suggest optimal totalSlots for an event based on historical attendance
 * Scope: Query similar events + bookings to predict realistic capacity
 * Integration: Used by Planning Agent orchestrator
 */
class SlotPredictor {
  constructor() {
    // Default slot values by category (fallback when no historical data)
    this.defaultSlotsByCategory = {
      conference: 150,
      workshop: 50,
      wedding: 200,
      concert: 500,
      festival: 1000,
      seminar: 120,
      training: 40,
      birthday: 60,
      party: 80,
      exhibition: 300,
      meetup: 80,
      webinar: 200, // virtual, but still needs slot limit
    };
  }

  // ============================================================
  // CORE TASK: SUGGEST TOTAL SLOTS
  // ============================================================
  async suggestTotalSlots(eventData) {
    try {
      const { category, location, event_date } = eventData;

      logger.agent(
        "SlotPredictor",
        `Analyzing slot requirements for ${category} in ${location}`
      );

      // Get category ID
      const categoryId = await planningData.getCategoryId(category);
      if (!categoryId) {
        logger.warn(`Category "${category}" not found, using default slots`);
        return this.getDefaultSlots(category);
      }

      // Find similar completed/ongoing events in same category & location
      const similarEvents = await planningData.findEvents(
        {
          categoryId,
          location,
          status: ["completed", "ongoing"],
        },
        30 // limit
      );

      if (similarEvents.length === 0) {
        logger.warn("No similar events found, using default slots");
        return this.getDefaultSlots(category);
      }

      // Get booking counts for these events
      const eventIds = similarEvents.map((e) => e._id);
      const bookingsMap = await planningData.getEventBookingsSummary(eventIds);

      // Calculate attendance statistics
      const attendanceRates = similarEvents.map((event) => {
        const booked =
          bookingsMap.get(event._id.toString()) || event.attendees?.length || 0;
        const totalSlots = event.totalSlots || 0;
        return {
          totalSlots,
          booked,
          rate: totalSlots > 0 ? booked / totalSlots : 0,
        };
      });

      const avgSlots =
        attendanceRates.reduce((sum, a) => sum + a.totalSlots, 0) /
        attendanceRates.length;
      const avgRate =
        attendanceRates.reduce((sum, a) => sum + a.rate, 0) /
        attendanceRates.length;

      // Suggest slots with 10% buffer above average slots
      const suggestedSlots = Math.round(avgSlots * 1.1);

      // Also suggest based on target occupancy (if we want to hit 80% full)
      const slotsFor80Percent = Math.round((avgSlots * avgRate) / 0.8);
      const finalSuggestion = Math.max(suggestedSlots, slotsFor80Percent);

      logger.success(
        `Slot suggestion: ${finalSuggestion} (avg slots: ${Math.round(
          avgSlots
        )}, avg occupancy: ${Math.round(avgRate * 100)}%)`
      );

      return {
        suggestedSlots: finalSuggestion,
        statistics: {
          averageSlots: Math.round(avgSlots),
          averageOccupancy: Math.round(avgRate * 100),
          sampleSize: similarEvents.length,
        },
        reasoning: `Based on ${
          similarEvents.length
        } similar events with ${Math.round(
          avgRate * 100
        )}% average occupancy. Recommended slots allow for growth.`,
        confidence: this.calculateConfidence(similarEvents.length),
      };
    } catch (error) {
      logger.error(`Slot suggestion failed: ${error.message}`);
      return this.getDefaultSlots(eventData.category);
    }
  }

  // ============================================================
  // HELPER: DEFAULT SLOTS (based on category)
  // ============================================================
  getDefaultSlots(category) {
    const categoryKey = category?.toLowerCase() || "";
    const slots = this.defaultSlotsByCategory[categoryKey] || 100;

    return {
      suggestedSlots: slots,
      statistics: {
        averageSlots: slots,
        averageOccupancy: 70,
        sampleSize: 0,
      },
      confidence: 0.3,
      reasoning: "Default slot count (insufficient historical data)",
    };
  }

  // ============================================================
  // HELPER: CONFIDENCE SCORE (same as budget-optimizer)
  // ============================================================
  calculateConfidence(sampleSize) {
    if (sampleSize >= 30) return 0.95;
    if (sampleSize >= 20) return 0.85;
    if (sampleSize >= 10) return 0.75;
    if (sampleSize >= 5) return 0.6;
    return 0.3;
  }
}

module.exports = SlotPredictor;
