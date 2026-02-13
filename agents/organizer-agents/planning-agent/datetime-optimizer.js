const logger = require("../../../config/logger");
const planningData = require("./planning-data.service");

/**
 * DATETIME OPTIMIZER (Phase 3)
 * Purpose: Suggest optimal event date/time and validate registration deadlines
 * Scope: Analyze historical successful events by day/month/time
 * Integration: Used by Planning Agent orchestrator
 */
class DateTimeOptimizer {
  constructor() {
    // Default recommendations by category (fallback)
    this.defaultsByCategory = {
      conference: {
        day: "Friday",
        month: "October",
        timeSlot: "afternoon",
        timeValue: "14:00",
      },
      workshop: {
        day: "Saturday",
        month: "September",
        timeSlot: "morning",
        timeValue: "10:00",
      },
      wedding: {
        day: "Saturday",
        month: "November",
        timeSlot: "evening",
        timeValue: "18:00",
      },
      birthday: {
        day: "Saturday",
        month: "December",
        timeSlot: "evening",
        timeValue: "19:00",
      },
      concert: {
        day: "Friday",
        month: "December",
        timeSlot: "evening",
        timeValue: "19:00",
      },
      festival: {
        day: "Saturday",
        month: "April",
        timeSlot: "afternoon",
        timeValue: "15:00",
      },
    };
  }

  // ============================================================
  // CORE TASK 1: SUGGEST EVENT DATE & TIME
  // ============================================================
  async suggestEventDateTime(eventData) {
    try {
      const { category, description } = eventData;

      logger.agent(
        "DateTimeOptimizer",
        `Analyzing optimal date/time for ${category}`
      );

      const categoryId = await planningData.getCategoryId(category);
      if (!categoryId) {
        logger.warn(`Category "${category}" not found, using defaults`);
        return this.getDefaultDateTime(category);
      }

      // Find successful completed events in this category
      const events = await planningData.findEvents(
        {
          categoryId,
          status: ["completed"],
        },
        100
      );

      if (events.length < 5) {
        logger.warn("Insufficient historical events, using defaults");
        return this.getDefaultDateTime(category);
      }

      // Get booking data to identify successful events (60%+ occupancy)
      const eventIds = events.map((e) => e._id);
      const bookingsMap = await planningData.getEventBookingsSummary(eventIds);

      const successfulEvents = events.filter((event) => {
        const booked =
          bookingsMap.get(event._id.toString()) || event.attendees?.length || 0;
        const rate = event.totalSlots > 0 ? booked / event.totalSlots : 0;
        return rate > 0.6;
      });

      const analysisEvents =
        successfulEvents.length >= 3 ? successfulEvents : events;

      // Analyze patterns
      const dayOfWeekCount = {};
      const monthCount = {};
      const timeSlots = { morning: 0, afternoon: 0, evening: 0 };

      analysisEvents.forEach((event) => {
        const date = new Date(event.event_date);
        const day = date.getDay(); // 0=Sunday, 6=Saturday
        const month = date.getMonth();

        dayOfWeekCount[day] = (dayOfWeekCount[day] || 0) + 1;
        monthCount[month] = (monthCount[month] || 0) + 1;

        if (event.time) {
          const hour = parseInt(event.time.split(":")[0]);
          if (hour >= 6 && hour < 12) timeSlots.morning++;
          else if (hour >= 12 && hour < 17) timeSlots.afternoon++;
          else timeSlots.evening++;
        }
      });

      // Find best day, month, time slot
      const bestDay = Object.entries(dayOfWeekCount).sort(
        (a, b) => b[1] - a[1]
      )[0];
      const bestMonth = Object.entries(monthCount).sort(
        (a, b) => b[1] - a[1]
      )[0];
      const bestTimeSlot = Object.entries(timeSlots).sort(
        (a, b) => b[1] - a[1]
      )[0];

      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      const suggestedTime = this.getTimeForSlot(bestTimeSlot[0]);

      logger.success(
        `Suggested: ${dayNames[bestDay[0]]} in ${monthNames[bestMonth[0]]}, ${
          bestTimeSlot[0]
        } (${suggestedTime})`
      );

      return {
        suggestedDayOfWeek: dayNames[parseInt(bestDay[0])],
        suggestedMonth: monthNames[parseInt(bestMonth[0])],
        suggestedTimeSlot: bestTimeSlot[0],
        suggestedTime: suggestedTime,
        reasoning: `Based on ${
          analysisEvents.length
        } successful ${category} events. ${
          dayNames[bestDay[0]]
        }s have ${Math.round(
          (bestDay[1] / analysisEvents.length) * 100
        )}% success rate.`,
        patterns: {
          bestDays: Object.entries(dayOfWeekCount)
            .map(([day, count]) => ({ day: dayNames[day], count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3),
          bestMonths: Object.entries(monthCount)
            .map(([month, count]) => ({ month: monthNames[month], count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3),
        },
        confidence: this.calculateConfidence(analysisEvents.length),
      };
    } catch (error) {
      logger.error(`DateTime suggestion failed: ${error.message}`);
      return this.getDefaultDateTime(eventData.category);
    }
  }

  // ============================================================
  // CORE TASK 2: VALIDATE REGISTRATION DEADLINE
  // ============================================================
  validateRegistrationDeadline(eventDate, registrationDeadline) {
    try {
      if (!eventDate || !registrationDeadline) {
        return {
          isValid: false,
          error: "Missing date parameters",
        };
      }

      const eventDateObj = new Date(eventDate);
      const deadlineObj = new Date(registrationDeadline);

      if (isNaN(eventDateObj.getTime()) || isNaN(deadlineObj.getTime())) {
        return {
          isValid: false,
          error: "Invalid date format",
        };
      }

      const isValid = deadlineObj < eventDateObj;
      const daysDiff = Math.floor(
        (eventDateObj - deadlineObj) / (1000 * 60 * 60 * 24)
      );

      if (!isValid) {
        const suggestedDate = new Date(
          eventDateObj.getTime() - 7 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .split("T")[0];
        return {
          isValid: false,
          error: "Registration deadline must be before event date",
          suggestion: suggestedDate,
        };
      }

      let warning = null;
      if (daysDiff < 3) {
        warning =
          "Consider setting deadline at least 3-7 days before event for better planning";
      }

      logger.success(
        `Deadline validation passed: ${daysDiff} days before event`
      );

      return {
        isValid: true,
        daysDifference: daysDiff,
        warning,
        recommendation:
          daysDiff < 7
            ? "7-14 days recommended for optimal registration"
            : null,
      };
    } catch (error) {
      logger.error(`Deadline validation failed: ${error.message}`);
      return {
        isValid: false,
        error: "Validation error",
      };
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================
  getDefaultDateTime(category) {
    const cat = category?.toLowerCase() || "";
    const def =
      this.defaultsByCategory[cat] || this.defaultsByCategory.conference;

    return {
      suggestedDayOfWeek: def.day,
      suggestedMonth: def.month,
      suggestedTimeSlot: def.timeSlot,
      suggestedTime: def.timeValue,
      reasoning: "Default timing recommendation (insufficient historical data)",
      patterns: { bestDays: [], bestMonths: [] },
      confidence: 0.3,
    };
  }

  getTimeForSlot(slot) {
    const times = {
      morning: "10:00",
      afternoon: "14:00",
      evening: "18:00",
    };
    return times[slot] || "14:00";
  }

  calculateConfidence(sampleSize) {
    if (sampleSize >= 30) return 0.95;
    if (sampleSize >= 20) return 0.85;
    if (sampleSize >= 10) return 0.75;
    if (sampleSize >= 5) return 0.6;
    return 0.3;
  }
}

module.exports = DateTimeOptimizer;
