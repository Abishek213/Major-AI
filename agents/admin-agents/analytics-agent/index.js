const logger = require('../../../config/logger');
const ReportTrigger = require('./report-trigger');

class AnalyticsAgent {
  constructor() {
    this.name = 'analytics-agent';
    this.reportTrigger = new ReportTrigger();
    this.cache = new Map();
    this.cacheTTL = 10 * 60 * 1000; // 10 minutes
  }

  async initialize() {
    logger.agent(this.name, 'Initializing analytics agent');
    await this.reportTrigger.initialize();
    return true;
  }

  async getPlatformAnalytics(timeframe = 'month', filters = {}) {
    try {
      logger.agent(this.name, `Getting platform analytics for ${timeframe}`);
      
      const cacheKey = `analytics_${timeframe}_${JSON.stringify(filters)}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        logger.agent(this.name, 'Returning cached analytics');
        return cached.data;
      }
      
      // Collect data from various sources
      const [
        userAnalytics,
        eventAnalytics,
        bookingAnalytics,
        revenueAnalytics,
        agentAnalytics
      ] = await Promise.all([
        this.getUserAnalytics(timeframe, filters),
        this.getEventAnalytics(timeframe, filters),
        this.getBookingAnalytics(timeframe, filters),
        this.getRevenueAnalytics(timeframe, filters),
        this.getAgentAnalytics(timeframe, filters)
      ]);
      
      // Generate insights
      const insights = await this.generateInsights([
        userAnalytics,
        eventAnalytics,
        bookingAnalytics,
        revenueAnalytics,
        agentAnalytics
      ], timeframe);
      
      // Calculate KPIs
      const kpis = this.calculateKPIs(userAnalytics, eventAnalytics, bookingAnalytics, revenueAnalytics);
      
      // Generate trends
      const trends = this.identifyTrends([
        userAnalytics.trends,
        eventAnalytics.trends,
        bookingAnalytics.trends,
        revenueAnalytics.trends
      ]);
      
      const analyticsData = {
        timeframe: timeframe,
        filters: filters,
        summary: {
          users: userAnalytics.summary,
          events: eventAnalytics.summary,
          bookings: bookingAnalytics.summary,
          revenue: revenueAnalytics.summary,
          agents: agentAnalytics.summary
        },
        detailed: {
          users: userAnalytics.detailed,
          events: eventAnalytics.detailed,
          bookings: bookingAnalytics.detailed,
          revenue: revenueAnalytics.detailed,
          agents: agentAnalytics.detailed
        },
        kpis: kpis,
        trends: trends,
        insights: insights,
        anomalies: await this.detectAnomalies([
          userAnalytics,
          eventAnalytics,
          bookingAnalytics,
          revenueAnalytics
        ]),
        recommendations: this.generateRecommendations(kpis, insights, timeframe),
        generated_at: new Date().toISOString()
      };
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: analyticsData,
        timestamp: Date.now()
      });
      
      logger.success(`Analytics generated for ${timeframe}`);
      
      return analyticsData;
    } catch (error) {
      logger.error(`Failed to get platform analytics: ${error.message}`);
      return this.getFallbackAnalytics(timeframe);
    }
  }

  async getUserAnalytics(timeframe, filters) {
    // In production, query MongoDB
    const mockData = {
      summary: {
        total_users: 1250,
        active_users: 850,
        new_users: 150,
        returning_users: 700,
        user_growth: 12.5
      },
      detailed: {
        by_role: {
          organizers: 300,
          attendees: 950
        },
        by_location: {
          'Kathmandu': 800,
          'Pokhara': 250,
          'Lalitpur': 150,
          'Other': 50
        },
        demographics: {
          age_groups: {
            '18-25': 400,
            '26-35': 500,
            '36-50': 300,
            '51+': 50
          },
          gender: {
            male: 700,
            female: 500,
            other: 50
          }
        }
      },
      trends: {
        daily_signups: [45, 52, 48, 55, 50, 47, 53],
        user_retention: [75, 78, 76, 80, 82, 79, 77]
      }
    };
    
    return mockData;
  }

  async getEventAnalytics(timeframe, filters) {
    const mockData = {
      summary: {
        total_events: 89,
        active_events: 45,
        upcoming_events: 32,
        completed_events: 12,
        cancellation_rate: 5.2
      },
      detailed: {
        by_category: {
          'Music': 25,
          'Business': 20,
          'Workshop': 18,
          'Social': 15,
          'Other': 11
        },
        by_status: {
          'published': 45,
          'draft': 15,
          'cancelled': 5,
          'completed': 12,
          'archived': 12
        },
        by_location: {
          'Kathmandu': 50,
          'Pokhara': 20,
          'Lalitpur': 10,
          'Biratnagar': 5,
          'Other': 4
        },
        attendance_rates: {
          average: 78,
          high: 95,
          low: 45
        }
      },
      trends: {
        events_created: [8, 10, 7, 12, 9, 11, 10],
        average_attendance: [75, 78, 76, 80, 82, 79, 77]
      }
    };
    
    return mockData;
  }

  async getBookingAnalytics(timeframe, filters) {
    const mockData = {
      summary: {
        total_bookings: 1250,
        confirmed_bookings: 1100,
        pending_bookings: 100,
        cancelled_bookings: 50,
        conversion_rate: 8.5
      },
      detailed: {
        by_event_type: {
          'Conference': 450,
          'Workshop': 300,
          'Concert': 250,
          'Wedding': 150,
          'Other': 100
        },
        by_payment_method: {
          'eSewa': 600,
          'Khalti': 400,
          'Card': 200,
          'Bank Transfer': 50
        },
        booking_value: {
          average: 2500,
          total: 3125000,
          highest: 50000,
          lowest: 500
        },
        time_to_booking: {
          immediate: 400,
          '1_day': 300,
          '2-7_days': 350,
          '1_week+': 200
        }
      },
      trends: {
        daily_bookings: [35, 42, 38, 45, 40, 37, 43],
        booking_value: [2200, 2400, 2300, 2500, 2600, 2400, 2500]
      }
    };
    
    return mockData;
  }

  async getRevenueAnalytics(timeframe, filters) {
    const mockData = {
      summary: {
        total_revenue: 3125000,
        net_revenue: 2800000,
        average_ticket_price: 2500,
        revenue_growth: 15.2,
        refund_amount: 125000
      },
      detailed: {
        by_event_category: {
          'Conference': 1125000,
          'Workshop': 750000,
          'Concert': 625000,
          'Wedding': 375000,
          'Other': 250000
        },
        by_organizer: {
          'top_5': 1500000,
          'others': 1625000
        },
        revenue_streams: {
          ticket_sales: 2500000,
          sponsorships: 500000,
          premium_features: 125000
        },
        seasonality: {
          high_season: 1500000,
          medium_season: 1000000,
          low_season: 625000
        }
      },
      trends: {
        daily_revenue: [85000, 92000, 88000, 95000, 90000, 87000, 93000],
        revenue_growth: [10, 12, 11, 15, 14, 13, 15]
      }
    };
    
    return mockData;
  }

  async getAgentAnalytics(timeframe, filters) {
    const mockData = {
      summary: {
        total_agents: 8,
        active_agents: 8,
        agent_requests: 12500,
        average_response_time: 1.2,
        success_rate: 92.5
      },
      detailed: {
        by_agent_type: {
          user: 4500,
          organizer: 5000,
          admin: 3000
        },
        by_function: {
          recommendation: 4000,
          support: 3500,
          negotiation: 2000,
          analytics: 1500,
          sentiment: 1000,
          fraud: 500
        },
        performance: {
          recommendation_accuracy: 85,
          support_satisfaction: 90,
          negotiation_success: 75,
          fraud_detection: 95
        },
        costs: {
          total: 50000,
          per_request: 4.0,
          savings_generated: 250000
        }
      },
      trends: {
        agent_usage: [1500, 1800, 1700, 1900, 2000, 1850, 1950],
        success_rates: [90, 91, 92, 93, 92, 91, 92]
      }
    };
    
    return mockData;
  }

  calculateKPIs(userAnalytics, eventAnalytics, bookingAnalytics, revenueAnalytics) {
    const userRetention = userAnalytics.summary.returning_users / userAnalytics.summary.total_users * 100;
    const eventSuccessRate = (eventAnalytics.summary.active_events / eventAnalytics.summary.total_events) * 100;
    const bookingConversion = bookingAnalytics.summary.conversion_rate;
    const revenuePerUser = revenueAnalytics.summary.total_revenue / userAnalytics.summary.total_users;
    const agentROI = 250000 / 50000; // Savings / Costs
    
    return {
      user_retention_rate: userRetention,
      event_success_rate: eventSuccessRate,
      booking_conversion_rate: bookingConversion,
      average_revenue_per_user: revenuePerUser,
      agent_roi: agentROI,
      platform_health_score: this.calculateHealthScore([
        userRetention,
        eventSuccessRate,
        bookingConversion,
        revenuePerUser
      ])
    };
  }

  calculateHealthScore(kpis) {
    // Weighted average of normalized KPIs
    const weights = {
      user_retention_rate: 0.3,
      event_success_rate: 0.25,
      booking_conversion_rate: 0.25,
      average_revenue_per_user: 0.2
    };
    
    let totalScore = 0;
    let totalWeight = 0;
    
    Object.entries(kpis).forEach(([kpi, value]) => {
      if (weights[kpi]) {
        // Normalize score to 0-100
        const normalized = Math.min(Math.max(value, 0), 100);
        totalScore += normalized * weights[kpi];
        totalWeight += weights[kpi];
      }
    });
    
    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }

  identifyTrends(trendArrays) {
    const trends = {
      overall: 'stable',
      details: []
    };
    
    // Analyze each trend array
    trendArrays.forEach((trendData, index) => {
      if (trendData && Array.isArray(trendData)) {
        const slope = this.calculateSlope(trendData);
        
        let trend = 'stable';
        if (slope > 0.1) trend = 'increasing';
        if (slope < -0.1) trend = 'decreasing';
        
        trends.details.push({
          index,
          slope,
          trend,
          last_value: trendData[trendData.length - 1],
          change: trendData[trendData.length - 1] - trendData[0]
        });
      }
    });
    
    // Determine overall trend
    const increasing = trends.details.filter(t => t.trend === 'increasing').length;
    const decreasing = trends.details.filter(t => t.trend === 'decreasing').length;
    
    if (increasing > decreasing * 2) {
      trends.overall = 'increasing';
    } else if (decreasing > increasing * 2) {
      trends.overall = 'decreasing';
    }
    
    return trends;
  }

  calculateSlope(data) {
    if (data.length < 2) return 0;
    
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  async generateInsights(dataArrays, timeframe) {
    const insights = [];
    
    const [
      userAnalytics,
      eventAnalytics,
      bookingAnalytics,
      revenueAnalytics,
      agentAnalytics
    ] = dataArrays;
    
    // User growth insight
    if (userAnalytics.summary.user_growth > 20) {
      insights.push({
        type: 'positive',
        category: 'users',
        title: 'Rapid User Growth',
        message: `User base growing at ${userAnalytics.summary.user_growth}%`,
        impact: 'high',
        recommendation: 'Scale infrastructure to handle growth'
      });
    }
    
    // Event category insight
    const topCategory = Object.entries(eventAnalytics.detailed.by_category)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (topCategory) {
      insights.push({
        type: 'info',
        category: 'events',
        title: 'Popular Event Category',
        message: `${topCategory[0]} events are most popular (${topCategory[1]} events)`,
        impact: 'medium',
        recommendation: 'Promote similar events and onboard more organizers in this category'
      });
    }
    
    // Revenue concentration insight
    const top5Revenue = revenueAnalytics.detailed.by_organizer.top_5;
    const totalRevenue = revenueAnalytics.summary.total_revenue;
    const concentration = (top5Revenue / totalRevenue) * 100;
    
    if (concentration > 60) {
      insights.push({
        type: 'warning',
        category: 'revenue',
        title: 'High Revenue Concentration',
        message: `Top 5 organizers generate ${concentration.toFixed(1)}% of total revenue`,
        impact: 'high',
        recommendation: 'Diversify revenue sources and onboard more organizers'
      });
    }
    
    // Agent performance insight
    if (agentAnalytics.detailed.performance.recommendation_accuracy < 70) {
      insights.push({
        type: 'warning',
        category: 'agents',
        title: 'Low Recommendation Accuracy',
        message: `Recommendation accuracy is ${agentAnalytics.detailed.performance.recommendation_accuracy}%`,
        impact: 'medium',
        recommendation: 'Retrain recommendation models with more data'
      });
    }
    
    return insights;
  }

  async detectAnomalies(dataArrays) {
    const anomalies = [];
    
    // Check for sudden drops in key metrics
    const metrics = [
      { name: 'daily_signups', data: dataArrays[0]?.trends?.daily_signups, threshold: 0.3 },
      { name: 'daily_bookings', data: dataArrays[2]?.trends?.daily_bookings, threshold: 0.25 },
      { name: 'daily_revenue', data: dataArrays[3]?.trends?.daily_revenue, threshold: 0.2 }
    ];
    
    metrics.forEach(metric => {
      if (metric.data && metric.data.length >= 3) {
        const last = metric.data[metric.data.length - 1];
        const previous = metric.data[metric.data.length - 2];
        const change = (last - previous) / previous;
        
        if (Math.abs(change) > metric.threshold) {
          anomalies.push({
            metric: metric.name,
            change: change * 100,
            direction: change > 0 ? 'increase' : 'decrease',
            severity: Math.abs(change) > 0.5 ? 'high' : 'medium',
            timestamp: new Date().toISOString()
          });
        }
      }
    });
    
    return anomalies;
  }

  generateRecommendations(kpis, insights, timeframe) {
    const recommendations = [];
    
    // Based on KPIs
    if (kpis.user_retention_rate < 60) {
      recommendations.push({
        priority: 'high',
        action: 'Improve user retention',
        details: 'Implement loyalty programs and personalized notifications',
        expected_impact: 'Increase retention by 10-15%'
      });
    }
    
    if (kpis.booking_conversion_rate < 5) {
      recommendations.push({
        priority: 'high',
        action: 'Optimize booking flow',
        details: 'Simplify checkout process and add trust signals',
        expected_impact: 'Increase conversion by 3-5%'
      });
    }
    
    // Based on insights
    insights.forEach(insight => {
      if (insight.type === 'warning' && insight.impact === 'high') {
        recommendations.push({
          priority: 'high',
          action: `Address ${insight.category} issue`,
          details: insight.recommendation,
          expected_impact: 'Mitigate risk and improve stability'
        });
      }
    });
    
    // Timeframe-specific recommendations
    if (timeframe === 'month') {
      recommendations.push({
        priority: 'medium',
        action: 'Review monthly performance',
        details: 'Compare with previous month and set goals for next month',
        expected_impact: 'Maintain growth trajectory'
      });
    }
    
    return recommendations.slice(0, 5); // Top 5 recommendations
  }

  async generateReport(reportType, timeframe, format = 'json') {
    try {
      logger.agent(this.name, `Generating ${reportType} report for ${timeframe}`);
      
      const analytics = await this.getPlatformAnalytics(timeframe);
      
      let report;
      switch (reportType) {
        case 'executive':
          report = this.generateExecutiveReport(analytics);
          break;
        case 'detailed':
          report = this.generateDetailedReport(analytics);
          break;
        case 'performance':
          report = this.generatePerformanceReport(analytics);
          break;
        default:
          report = analytics;
      }
      
      // Trigger report delivery
      await this.reportTrigger.deliverReport(report, reportType, format);
      
      return {
        success: true,
        report_type: reportType,
        timeframe: timeframe,
        format: format,
        generated_at: new Date().toISOString(),
        download_url: `/reports/${reportType}_${timeframe}_${Date.now()}.${format}`
      };
    } catch (error) {
      logger.error(`Failed to generate report: ${error.message}`);
      throw error;
    }
  }

  generateExecutiveReport(analytics) {
    return {
      title: 'Executive Summary Report',
      period: analytics.timeframe,
      highlights: {
        total_revenue: analytics.summary.revenue.total_revenue,
        user_growth: analytics.summary.users.user_growth,
        top_performing_category: Object.entries(analytics.detailed.events.by_category)
          .sort(([,a], [,b]) => b - a)[0],
        key_insights: analytics.insights.filter(i => i.impact === 'high'),
        platform_health: analytics.kpis.platform_health_score
      },
      recommendations: analytics.recommendations.filter(r => r.priority === 'high'),
      generated: analytics.generated_at
    };
  }

  generateDetailedReport(analytics) {
    return {
      title: 'Detailed Analytics Report',
      period: analytics.timeframe,
      sections: {
        user_analytics: analytics.detailed.users,
        event_analytics: analytics.detailed.events,
        booking_analytics: analytics.detailed.bookings,
        revenue_analytics: analytics.detailed.revenue,
        agent_analytics: analytics.detailed.agents
      },
      metrics: analytics.kpis,
      trends: analytics.trends,
      anomalies: analytics.anomalies,
      generated: analytics.generated_at
    };
  }

  generatePerformanceReport(analytics) {
    return {
      title: 'Performance Report',
      period: analytics.timeframe,
      performance_indicators: analytics.kpis,
      growth_metrics: {
        user_growth: analytics.summary.users.user_growth,
        revenue_growth: analytics.summary.revenue.revenue_growth,
        booking_growth: analytics.trends.details.filter(t => t.trend === 'increasing').length
      },
      efficiency_metrics: {
        cost_per_booking: analytics.detailed.revenue.total_revenue / analytics.summary.bookings.total_bookings,
        agent_efficiency: analytics.detailed.agents.performance,
        platform_uptime: 99.8 // Would come from monitoring system
      },
      benchmarks: {
        industry_average_retention: 65,
        industry_average_conversion: 7.5,
        target_platform_health: 85
      },
      generated: analytics.generated_at
    };
  }

  getFallbackAnalytics(timeframe) {
    logger.warning(`Using fallback analytics for ${timeframe}`);
    
    return {
      timeframe: timeframe,
      summary: {
        users: { total_users: 0, active_users: 0 },
        events: { total_events: 0, active_events: 0 },
        bookings: { total_bookings: 0, confirmed_bookings: 0 },
        revenue: { total_revenue: 0, net_revenue: 0 },
        agents: { total_agents: 0, active_agents: 0 }
      },
      kpis: {
        platform_health_score: 0
      },
      insights: [],
      recommendations: [],
      generated_at: new Date().toISOString(),
      is_fallback: true
    };
  }

  clearCache() {
    this.cache.clear();
    logger.agent(this.name, 'Cache cleared');
  }
}

module.exports = AnalyticsAgent;