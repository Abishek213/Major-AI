const logger = require('../../../config/logger');
const MongoQueryAgent = require('./mongo-query-agent');

class DashboardAssistant {
  constructor() {
    this.name = 'dashboard-assistant';
    this.queryAgent = new MongoQueryAgent();
    this.cache = new Map();
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes
  }

  async getDashboardData(organizerId, timeframe = 'month') {
    try {
      logger.agent(this.name, `Fetching dashboard for organizer: ${organizerId}`);
      
      const cacheKey = `dashboard_${organizerId}_${timeframe}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
        logger.agent(this.name, 'Returning cached dashboard data');
        return cached.data;
      }
      
      // Fetch data from various sources
      const [
        eventsData,
        bookingsData,
        revenueData,
        analyticsData
      ] = await Promise.all([
        this.queryAgent.getEventsByOrganizer(organizerId, timeframe),
        this.queryAgent.getBookingsForOrganizer(organizerId, timeframe),
        this.queryAgent.getRevenueData(organizerId, timeframe),
        this.queryAgent.getAnalyticsData(organizerId, timeframe)
      ]);
      
      // Process and format data
      const dashboardData = this.processDashboardData(
        eventsData,
        bookingsData,
        revenueData,
        analyticsData,
        timeframe
      );
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: dashboardData,
        timestamp: Date.now()
      });
      
      logger.success(`Dashboard data generated for organizer ${organizerId}`);
      return dashboardData;
    } catch (error) {
      logger.error(`Dashboard generation failed: ${error.message}`);
      return this.getFallbackDashboard(organizerId);
    }
  }

  processDashboardData(events, bookings, revenue, analytics, timeframe) {
    // Calculate metrics
    const totalEvents = events.length;
    const totalBookings = bookings.length;
    const totalRevenue = revenue.total || 0;
    const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;
    
    // Upcoming events
    const upcomingEvents = events.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate > new Date();
    });
    
    // Recent bookings (last 7 days)
    const recentBookings = bookings.slice(0, 10);
    
    // Revenue trends
    const revenueTrend = this.calculateRevenueTrend(revenue.history);
    
    // Popular events
    const popularEvents = this.identifyPopularEvents(events, bookings);
    
    // Performance insights
    const insights = this.generateInsights(events, bookings, revenue, timeframe);
    
    return {
      overview: {
        total_events: totalEvents,
        total_bookings: totalBookings,
        total_revenue: totalRevenue,
        avg_booking_value: avgBookingValue,
        conversion_rate: analytics.conversion_rate || 0,
        customer_satisfaction: analytics.satisfaction_score || 0
      },
      upcoming_events: upcomingEvents.slice(0, 5),
      recent_bookings: recentBookings,
      revenue_analytics: {
        total: totalRevenue,
        trend: revenueTrend,
        by_event: revenue.by_event || [],
        timeframe: timeframe
      },
      popular_events: popularEvents.slice(0, 3),
      performance_metrics: {
        attendance_rate: this.calculateAttendanceRate(events, bookings),
        repeat_customers: this.countRepeatCustomers(bookings),
        peak_booking_times: this.identifyPeakTimes(bookings)
      },
      insights: insights,
      charts: {
        revenue_over_time: this.prepareRevenueChartData(revenue.history),
        bookings_by_event: this.prepareBookingsChartData(events, bookings),
        customer_demographics: analytics.demographics || {}
      },
      generated_at: new Date().toISOString()
    };
  }

  calculateRevenueTrend(revenueHistory) {
    if (!revenueHistory || revenueHistory.length < 2) return 'stable';
    
    const recent = revenueHistory.slice(-2);
    const change = recent[1] - recent[0];
    const percentage = (change / recent[0]) * 100;
    
    if (percentage > 10) return 'increasing';
    if (percentage < -10) return 'decreasing';
    return 'stable';
  }

  identifyPopularEvents(events, bookings) {
    const eventBookings = {};
    
    bookings.forEach(booking => {
      const eventId = booking.eventId;
      eventBookings[eventId] = (eventBookings[eventId] || 0) + 1;
    });
    
    return events
      .map(event => ({
        ...event,
        bookings_count: eventBookings[event._id] || 0
      }))
      .sort((a, b) => b.bookings_count - a.bookings_count);
  }

  calculateAttendanceRate(events, bookings) {
    const totalCapacity = events.reduce((sum, event) => sum + (event.capacity || 0), 0);
    const totalAttendees = bookings.reduce((sum, booking) => sum + (booking.tickets || 1), 0);
    
    if (totalCapacity === 0) return 0;
    return (totalAttendees / totalCapacity) * 100;
  }

  countRepeatCustomers(bookings) {
    const customerCounts = {};
    
    bookings.forEach(booking => {
      const customerId = booking.userId;
      customerCounts[customerId] = (customerCounts[customerId] || 0) + 1;
    });
    
    return Object.values(customerCounts).filter(count => count > 1).length;
  }

  identifyPeakTimes(bookings) {
    const hourCounts = Array(24).fill(0);
    
    bookings.forEach(booking => {
      const hour = new Date(booking.bookedAt).getHours();
      hourCounts[hour]++;
    });
    
    const maxBookings = Math.max(...hourCounts);
    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(item => item.count >= maxBookings * 0.7)
      .map(item => `${item.hour}:00`);
    
    return peakHours;
  }

  generateInsights(events, bookings, revenue, timeframe) {
    const insights = [];
    
    // Revenue insight
    const revenueChange = this.calculatePercentageChange(revenue.history);
    if (revenueChange > 20) {
      insights.push({
        type: 'positive',
        title: 'Revenue Growth',
        message: `Your revenue increased by ${revenueChange}% compared to last ${timeframe}`,
        suggestion: 'Consider adding more events in popular categories'
      });
    } else if (revenueChange < -10) {
      insights.push({
        type: 'warning',
        title: 'Revenue Decline',
        message: `Revenue decreased by ${Math.abs(revenueChange)}%`,
        suggestion: 'Review pricing strategy and event promotion'
      });
    }
    
    // Booking pattern insight
    if (bookings.length > 50) {
      const weekdayBookings = this.analyzeBookingPatterns(bookings);
      if (weekdayBookings.weekend > weekdayBookings.weekday * 1.5) {
        insights.push({
          type: 'info',
          title: 'Weekend Popularity',
          message: 'Your events are more popular on weekends',
          suggestion: 'Consider scheduling more weekend events'
        });
      }
    }
    
    // Customer retention insight
    const repeatRate = this.calculateRepeatCustomerRate(bookings);
    if (repeatRate < 0.1) {
      insights.push({
        type: 'warning',
        title: 'Low Repeat Customers',
        message: `Only ${Math.round(repeatRate * 100)}% of customers are returning`,
        suggestion: 'Implement loyalty programs and follow-up emails'
      });
    }
    
    return insights;
  }

  calculatePercentageChange(history) {
    if (!history || history.length < 2) return 0;
    
    const [previous, current] = history.slice(-2);
    if (previous === 0) return current > 0 ? 100 : 0;
    
    return ((current - previous) / previous) * 100;
  }

  analyzeBookingPatterns(bookings) {
    const patterns = { weekday: 0, weekend: 0 };
    
    bookings.forEach(booking => {
      const day = new Date(booking.bookedAt).getDay();
      if (day === 0 || day === 6) {
        patterns.weekend++;
      } else {
        patterns.weekday++;
      }
    });
    
    return patterns;
  }

  calculateRepeatCustomerRate(bookings) {
    const customerCounts = {};
    
    bookings.forEach(booking => {
      customerCounts[booking.userId] = (customerCounts[booking.userId] || 0) + 1;
    });
    
    const totalCustomers = Object.keys(customerCounts).length;
    const repeatCustomers = Object.values(customerCounts).filter(count => count > 1).length;
    
    if (totalCustomers === 0) return 0;
    return repeatCustomers / totalCustomers;
  }

  prepareRevenueChartData(history) {
    if (!history) return [];
    
    return history.map((value, index) => ({
      period: `Period ${index + 1}`,
      revenue: value
    }));
  }

  prepareBookingsChartData(events, bookings) {
    const eventBookings = {};
    
    events.forEach(event => {
      eventBookings[event._id] = {
        name: event.event_name,
        bookings: 0
      };
    });
    
    bookings.forEach(booking => {
      if (eventBookings[booking.eventId]) {
        eventBookings[booking.eventId].bookings++;
      }
    });
    
    return Object.values(eventBookings).slice(0, 10);
  }

  getFallbackDashboard(organizerId) {
    logger.warning(`Using fallback dashboard for organizer ${organizerId}`);
    
    return {
      overview: {
        total_events: 0,
        total_bookings: 0,
        total_revenue: 0,
        avg_booking_value: 0,
        conversion_rate: 0,
        customer_satisfaction: 0
      },
      upcoming_events: [],
      recent_bookings: [],
      revenue_analytics: {
        total: 0,
        trend: 'stable',
        by_event: [],
        timeframe: 'month'
      },
      popular_events: [],
      performance_metrics: {
        attendance_rate: 0,
        repeat_customers: 0,
        peak_booking_times: []
      },
      insights: [
        {
          type: 'info',
          title: 'Getting Started',
          message: 'Start by creating your first event',
          suggestion: 'Use the event creation wizard'
        }
      ],
      charts: {
        revenue_over_time: [],
        bookings_by_event: [],
        customer_demographics: {}
      },
      generated_at: new Date().toISOString(),
      is_fallback: true
    };
  }

  clearCache() {
    this.cache.clear();
    logger.agent(this.name, 'Cache cleared');
  }
}

module.exports = DashboardAssistant;