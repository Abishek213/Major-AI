const logger = require("../../../config/logger");
const mongoose = require("mongoose");

/**
 * Planning Data Service (Phase 3 - FIXED)
 * Centralised database queries for ORG Planning Agent modules.
 *
 * FIX: Changed from getDb() to mongoose native connection
 */
class PlanningDataService {
  /**
   * Get MongoDB connection
   * Works with both mongoose.connection.db and direct mongoose operations
   */
  getDb() {
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection.db;
    }
    throw new Error("MongoDB not connected");
  }

  /**
   * Get category document ID by name (case-insensitive)
   * @param {string} categoryName
   * @returns {Promise<ObjectId|null>}
   */
  async getCategoryId(categoryName) {
    if (!categoryName) return null;
    try {
      const db = this.getDb();
      const categoriesCollection = db.collection("categories");
      const categoryDoc = await categoriesCollection.findOne({
        categoryName: { $regex: new RegExp(`^${categoryName}$`, "i") },
      });
      return categoryDoc?._id || null;
    } catch (error) {
      logger.error(`PlanningDataService.getCategoryId error: ${error.message}`);
      return null;
    }
  }

  /**
   * Find events with flexible filters
   * @param {Object} filters
   * @param {ObjectId} filters.categoryId
   * @param {string} filters.location (partial match, case-insensitive)
   * @param {Array} filters.status
   * @param {Object} filters.price - { gt, lt, gte, lte }
   * @param {Object} filters.slots - { gte, lte }
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async findEvents(filters = {}, limit = 50) {
    try {
      const db = this.getDb();
      const eventsCollection = db.collection("events");
      const query = {};

      if (filters.categoryId) {
        query.category = filters.categoryId;
      }
      if (filters.location) {
        query.location = { $regex: new RegExp(filters.location, "i") };
      }
      if (filters.status?.length) {
        query.status = { $in: filters.status };
      }
      if (filters.price) {
        query.price = {};
        if (filters.price.gt) query.price.$gt = filters.price.gt;
        if (filters.price.lt) query.price.$lt = filters.price.lt;
        if (filters.price.gte) query.price.$gte = filters.price.gte;
        if (filters.price.lte) query.price.$lte = filters.price.lte;
      }
      if (filters.slots) {
        query.totalSlots = {};
        if (filters.slots.gte) query.totalSlots.$gte = filters.slots.gte;
        if (filters.slots.lte) query.totalSlots.$lte = filters.slots.lte;
      }

      return await eventsCollection.find(query).limit(limit).toArray();
    } catch (error) {
      logger.error(`PlanningDataService.findEvents error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get booking summary (total seats booked) for a list of event IDs
   * @param {Array<ObjectId>} eventIds
   * @returns {Promise<Map<string, number>>} Map of eventId -> totalBookedSeats
   */
  async getEventBookingsSummary(eventIds) {
    try {
      if (!eventIds.length) return new Map();
      const db = this.getDb();
      const bookingsCollection = db.collection("bookings");
      const pipeline = [
        { $match: { eventId: { $in: eventIds } } },
        {
          $group: {
            _id: "$eventId",
            totalBooked: { $sum: "$numberOfSeats" },
          },
        },
      ];
      const results = await bookingsCollection.aggregate(pipeline).toArray();
      const map = new Map();
      results.forEach((r) => map.set(r._id.toString(), r.totalBooked));
      return map;
    } catch (error) {
      logger.error(
        `PlanningDataService.getEventBookingsSummary error: ${error.message}`
      );
      return new Map();
    }
  }

  /**
   * Get similar events for price/slot analysis
   * Convenience method combining category, location, status and size range.
   */
  async findSimilarEventsForPricing(
    categoryId,
    location,
    slots,
    status = ["approved", "completed", "ongoing"],
    limit = 50
  ) {
    const filters = {
      categoryId,
      location,
      status,
      price: { gt: 0 },
    };
    if (slots) {
      filters.slots = {
        gte: Math.floor(slots * 0.7),
        lte: Math.ceil(slots * 1.3),
      };
    }
    return this.findEvents(filters, limit);
  }

  /**
   * Get historical cost data (used by BudgetOptimizer)
   * Returns events with similar category, location, and size range.
   */
  async findHistoricalEventsForCost(
    categoryId,
    location,
    slots,
    status = ["completed"],
    limit = 20
  ) {
    const filters = {
      categoryId,
      location,
      status,
    };
    if (slots) {
      filters.slots = {
        gte: Math.floor(slots * 0.7),
        lte: Math.ceil(slots * 1.3),
      };
    }
    return this.findEvents(filters, limit);
  }
}

module.exports = new PlanningDataService();
