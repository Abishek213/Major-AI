const logger = require('../../../config/logger');
const mongoose = require('mongoose');

class MongoQueryAgent {
  constructor() {
    this.Event = mongoose.models.Event || require('../../../shared/schemas/event.schema');
    this.Booking = mongoose.models.Booking || require('../../../shared/schemas/booking.schema');
    this.User = mongoose.models.User || require('../../../shared/schemas/user.schema');
    this.Review = mongoose.models.Review || this.createReviewModel();
  }

  createReviewModel() {
    const reviewSchema = new mongoose.Schema({
      eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      rating: { type: Number, min: 1, max: 5 },
      comment: String,
      createdAt: { type: Date, default: Date.now }
    });
    
    return mongoose.models.Review || mongoose.model('Review', reviewSchema);
  }

  async getEventsByOrganizer(organizerId, timeframe) {
    try {
      const dateFilter = this.getDateFilter(timeframe);
      
      const events = await this.Event.find({
        organizer: organizerId,
        createdAt: { $gte: dateFilter }
      }).lean();
      
      logger.agent('MongoQueryAgent', `Found ${events.length} events for organizer ${organizerId}`);
      return events;
    } catch (error) {
      logger.error(`Failed to fetch events: ${error.message}`);
      return [];
    }
  }

  async getBookingsForOrganizer(organizerId, timeframe) {
    try {
      const dateFilter = this.getDateFilter(timeframe);
      
      // First, get organizer's events
      const organizerEvents = await this.Event.find({ organizer: organizerId }).select('_id').lean();
      const eventIds = organizerEvents.map(event => event._id);
      
      if (eventIds.length === 0) return [];
      
      // Get bookings for these events
      const bookings = await this.Booking.find({
        eventId: { $in: eventIds },
        bookedAt: { $gte: dateFilter }
      })
      .populate('eventId', 'event_name date location')
      .populate('userId', 'fullname email')
      .sort({ bookedAt: -1 })
      .lean();
      
      logger.agent('MongoQueryAgent', `Found ${bookings.length} bookings for organizer ${organizerId}`);
      return bookings;
    } catch (error) {
      logger.error(`Failed to fetch bookings: ${error.message}`);
      return [];
    }
  }

  async getRevenueData(organizerId, timeframe) {
    try {
      const dateFilter = this.getDateFilter(timeframe);
      
      // Get organizer's events
      const organizerEvents = await this.Event.find({ organizer: organizerId }).select('_id event_name').lean();
      const eventIds = organizerEvents.map(event => event._id);
      
      if (eventIds.length === 0) {
        return {
          total: 0,
          by_event: [],
          history: []
        };
      }
      
      // Get revenue by event
      const revenueByEvent = await this.Booking.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            bookedAt: { $gte: dateFilter },
            status: { $in: ['confirmed', 'completed'] }
          }
        },
        {
          $group: {
            _id: '$eventId',
            totalRevenue: { $sum: '$totalPrice' },
            bookingCount: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'events',
            localField: '_id',
            foreignField: '_id',
            as: 'event'
          }
        },
        {
          $unwind: '$event'
        },
        {
          $project: {
            eventId: '$_id',
            eventName: '$event.event_name',
            totalRevenue: 1,
            bookingCount: 1
          }
        },
        {
          $sort: { totalRevenue: -1 }
        }
      ]);
      
      // Calculate total revenue
      const totalRevenue = revenueByEvent.reduce((sum, item) => sum + item.totalRevenue, 0);
      
      // Generate historical data (simplified - in production would have actual time series)
      const history = this.generateRevenueHistory(timeframe, totalRevenue);
      
      return {
        total: totalRevenue,
        by_event: revenueByEvent,
        history: history
      };
    } catch (error) {
      logger.error(`Failed to fetch revenue data: ${error.message}`);
      return {
        total: 0,
        by_event: [],
        history: []
      };
    }
  }

  async getAnalyticsData(organizerId, timeframe) {
    try {
      const dateFilter = this.getDateFilter(timeframe);
      
      // Get organizer's events
      const organizerEvents = await this.Event.find({ organizer: organizerId }).select('_id').lean();
      const eventIds = organizerEvents.map(event => event._id);
      
      if (eventIds.length === 0) {
        return {
          conversion_rate: 0,
          satisfaction_score: 0,
          demographics: {}
        };
      }
      
      // Get total views (simulated - in production would track views)
      const totalBookings = await this.Booking.countDocuments({
        eventId: { $in: eventIds },
        bookedAt: { $gte: dateFilter }
      });
      
      const totalViews = totalBookings * 10; // Simulated conversion rate of 10%
      const conversionRate = totalViews > 0 ? (totalBookings / totalViews) * 100 : 0;
      
      // Get average rating
      const reviews = await this.Review.find({
        eventId: { $in: eventIds }
      }).lean();
      
      const satisfactionScore = reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
        : 0;
      
      // Get customer demographics (simplified)
      const bookings = await this.Booking.find({
        eventId: { $in: eventIds },
        bookedAt: { $gte: dateFilter }
      }).populate('userId').lean();
      
      const demographics = this.analyzeDemographics(bookings);
      
      return {
        conversion_rate: conversionRate,
        satisfaction_score: satisfactionScore,
        demographics: demographics
      };
    } catch (error) {
      logger.error(`Failed to fetch analytics data: ${error.message}`);
      return {
        conversion_rate: 0,
        satisfaction_score: 0,
        demographics: {}
      };
    }
  }

  getDateFilter(timeframe) {
    const now = new Date();
    
    switch (timeframe) {
      case 'day':
        return new Date(now.setDate(now.getDate() - 1));
      case 'week':
        return new Date(now.setDate(now.getDate() - 7));
      case 'month':
        return new Date(now.setMonth(now.getMonth() - 1));
      case 'quarter':
        return new Date(now.setMonth(now.getMonth() - 3));
      case 'year':
        return new Date(now.setFullYear(now.getFullYear() - 1));
      default:
        return new Date(0); // All time
    }
  }

  generateRevenueHistory(timeframe, currentRevenue) {
    const periods = {
      'day': 24,
      'week': 7,
      'month': 30,
      'quarter': 12,
      'year': 12
    };
    
    const periodCount = periods[timeframe] || 12;
    const history = [];
    
    // Generate simulated historical data
    for (let i = periodCount - 1; i >= 0; i--) {
      const baseValue = currentRevenue * (0.7 + Math.random() * 0.6); // 70-130% of current
      const trend = i < periodCount / 2 ? 1.1 : 0.9; // Simulate growth
      history.push(Math.round(baseValue * Math.pow(trend, i)));
    }
    
    return history;
  }

  analyzeDemographics(bookings) {
    const demographics = {
      age_groups: { '18-25': 0, '26-35': 0, '36-50': 0, '51+': 0 },
      locations: {},
      booking_frequency: { 'first_time': 0, 'repeat': 0 }
    };
    
    const userSet = new Set();
    
    bookings.forEach(booking => {
      if (booking.userId) {
        const userId = booking.userId._id || booking.userId;
        
        // Count unique users
        if (userSet.has(userId.toString())) {
          demographics.booking_frequency.repeat++;
        } else {
          demographics.booking_frequency.first_time++;
          userSet.add(userId.toString());
        }
        
        // Location distribution (simulated)
        const locations = ['Kathmandu', 'Pokhara', 'Lalitpur', 'Biratnagar', 'Other'];
        const location = locations[Math.floor(Math.random() * locations.length)];
        demographics.locations[location] = (demographics.locations[location] || 0) + 1;
        
        // Age groups (simulated)
        const ageGroups = ['18-25', '26-35', '36-50', '51+'];
        const ageGroup = ageGroups[Math.floor(Math.random() * ageGroups.length)];
        demographics.age_groups[ageGroup]++;
      }
    });
    
    return demographics;
  }

  async executeCustomQuery(query) {
    try {
      logger.agent('MongoQueryAgent', 'Executing custom query');
      
      // For safety, validate query structure
      const safeQuery = this.validateQuery(query);
      
      // Execute query
      const result = await this.Booking.aggregate(safeQuery);
      
      return {
        success: true,
        result: result,
        count: result.length
      };
    } catch (error) {
      logger.error(`Custom query failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  validateQuery(query) {
    // Basic validation to prevent malicious queries
    // In production, implement more comprehensive validation
    
    const maxStages = 10;
    if (query.length > maxStages) {
      throw new Error(`Query exceeds maximum of ${maxStages} stages`);
    }
    
    // Check for dangerous operations
    const dangerousOps = ['$eval', '$where', '$function'];
    for (const stage of query) {
      for (const op of dangerousOps) {
        if (JSON.stringify(stage).includes(op)) {
          throw new Error(`Dangerous operation ${op} not allowed`);
        }
      }
    }
    
    return query;
  }
}

module.exports = MongoQueryAgent;