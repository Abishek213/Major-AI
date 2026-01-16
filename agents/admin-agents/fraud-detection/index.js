const logger = require('../../../config/logger');
const MLClient = require('./ml-client');

class FraudDetectionAgent {
  constructor() {
    this.name = 'fraud-detection-agent';
    this.mlClient = new MLClient();
    this.fraudPatterns = new Map();
    this.suspiciousActivities = [];
    this.riskThresholds = {
      low: 0.3,
      medium: 0.6,
      high: 0.8
    };
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return true;
    
    logger.agent(this.name, 'Initializing fraud detection agent');
    await this.mlClient.initialize();
    await this.loadFraudPatterns();
    
    this.initialized = true;
    logger.success('Fraud detection agent initialized');
    return true;
  }

  async loadFraudPatterns() {
    // Load known fraud patterns (in production, from database)
    this.fraudPatterns.set('multiple_bookings', {
      pattern: 'Same user booking multiple events with same payment method in short time',
      risk_score: 0.7,
      check_function: this.checkMultipleBookings.bind(this)
    });
    
    this.fraudPatterns.set('high_value_booking', {
      pattern: 'New user making high value booking',
      risk_score: 0.6,
      check_function: this.checkHighValueBooking.bind(this)
    });
    
    this.fraudPatterns.set('suspicious_payment', {
      pattern: 'Multiple failed payment attempts followed by success',
      risk_score: 0.8,
      check_function: this.checkSuspiciousPayment.bind(this)
    });
    
    this.fraudPatterns.set('unusual_location', {
      pattern: 'Booking from unusual location or IP address',
      risk_score: 0.5,
      check_function: this.checkUnusualLocation.bind(this)
    });
    
    this.fraudPatterns.set('fake_reviews', {
      pattern: 'Multiple similar reviews from same IP or device',
      risk_score: 0.4,
      check_function: this.checkFakeReviews.bind(this)
    });
    
    logger.agent(this.name, `Loaded ${this.fraudPatterns.size} fraud patterns`);
  }

  async analyzeBooking(bookingData, userData, eventData) {
    try {
      await this.initialize();
      
      logger.agent(this.name, `Analyzing booking ${bookingData.bookingId}`);
      
      const checks = [];
      let totalRiskScore = 0;
      let checkCount = 0;
      
      // Run all fraud pattern checks
      for (const [patternName, pattern] of this.fraudPatterns) {
        const result = await pattern.check_function(bookingData, userData, eventData);
        
        if (result.is_suspicious) {
          checks.push({
            pattern: patternName,
            description: pattern.pattern,
            risk_score: result.risk_score,
            details: result.details,
            timestamp: new Date().toISOString()
          });
          
          totalRiskScore += result.risk_score;
          checkCount++;
        }
      }
      
      // Run ML-based analysis
      const mlAnalysis = await this.mlClient.analyzeBooking(bookingData, userData, eventData);
      
      if (mlAnalysis.risk_score > 0) {
        checks.push({
          pattern: 'ml_analysis',
          description: 'Machine learning based fraud detection',
          risk_score: mlAnalysis.risk_score,
          details: mlAnalysis.details,
          confidence: mlAnalysis.confidence,
          timestamp: new Date().toISOString()
        });
        
        totalRiskScore += mlAnalysis.risk_score;
        checkCount++;
      }
      
      // Calculate overall risk score (average of all checks)
      const overallRiskScore = checkCount > 0 ? totalRiskScore / checkCount : 0;
      
      // Determine fraud status
      const fraudStatus = this.determineFraudStatus(overallRiskScore);
      
      // Generate recommendation
      const recommendation = this.generateRecommendation(fraudStatus, checks);
      
      // Log suspicious activity if needed
      if (fraudStatus !== 'low_risk') {
        await this.logSuspiciousActivity(bookingData, checks, overallRiskScore, fraudStatus);
      }
      
      const analysisResult = {
        bookingId: bookingData.bookingId,
        userId: bookingData.userId,
        eventId: bookingData.eventId,
        analysis_timestamp: new Date().toISOString(),
        risk_score: overallRiskScore,
        fraud_status: fraudStatus,
        checks_performed: checks.length,
        suspicious_patterns: checks.map(check => ({
          pattern: check.pattern,
          risk_score: check.risk_score
        })),
        recommendation: recommendation,
        details: {
          checks: checks,
          ml_analysis: mlAnalysis
        },
        action_required: fraudStatus === 'high_risk'
      };
      
      logger.agent(this.name, `Booking analysis complete: ${fraudStatus} risk`);
      
      return {
        success: true,
        analysis: analysisResult
      };
    } catch (error) {
      logger.error(`Failed to analyze booking: ${error.message}`);
      return {
        success: false,
        error: 'Failed to analyze booking for fraud',
        fallback_result: this.getFallbackAnalysis(bookingData)
      };
    }
  }

  async checkMultipleBookings(bookingData, userData, eventData) {
    // In production, would query database for user's recent bookings
    const mockRecentBookings = 3; // Simulated data
    
    const isSuspicious = mockRecentBookings > 2;
    const riskScore = isSuspicious ? 0.7 : 0;
    
    return {
      is_suspicious: isSuspicious,
      risk_score: riskScore,
      details: {
        recent_bookings_count: mockRecentBookings,
        time_window: '24 hours',
        threshold_exceeded: mockRecentBookings > 2
      }
    };
  }

  async checkHighValueBooking(bookingData, userData, eventData) {
    const bookingAmount = bookingData.amount || 0;
    const userAccountAge = userData.accountAgeDays || 0;
    
    const isSuspicious = bookingAmount > 10000 && userAccountAge < 7;
    const riskScore = isSuspicious ? 0.6 : 0;
    
    return {
      is_suspicious: isSuspicious,
      risk_score: riskScore,
      details: {
        booking_amount: bookingAmount,
        user_account_age_days: userAccountAge,
        threshold_amount: 10000,
        threshold_age: 7
      }
    };
  }

  async checkSuspiciousPayment(bookingData, userData, eventData) {
    // In production, would check payment history
    const mockFailedAttempts = 2;
    const paymentMethod = bookingData.paymentMethod || 'unknown';
    
    const isSuspicious = mockFailedAttempts > 1 && paymentMethod === 'card';
    const riskScore = isSuspicious ? 0.8 : 0;
    
    return {
      is_suspicious: isSuspicious,
      risk_score: riskScore,
      details: {
        failed_attempts: mockFailedAttempts,
        payment_method: paymentMethod,
        success_after_failures: mockFailedAttempts > 0
      }
    };
  }

  async checkUnusualLocation(bookingData, userData, eventData) {
    const userLocation = userData.location || 'unknown';
    const bookingLocation = bookingData.location || 'unknown';
    const ipAddress = bookingData.ipAddress || 'unknown';
    
    // Simple check: different country or VPN detection
    const isSuspicious = userLocation !== bookingLocation || 
                        ipAddress.includes('vpn') || 
                        ipAddress.includes('proxy');
    
    const riskScore = isSuspicious ? 0.5 : 0;
    
    return {
      is_suspicious: isSuspicious,
      risk_score: riskScore,
      details: {
        user_location: userLocation,
        booking_location: bookingLocation,
        ip_address: ipAddress,
        location_mismatch: userLocation !== bookingLocation,
        vpn_detected: ipAddress.includes('vpn') || ipAddress.includes('proxy')
      }
    };
  }

  async checkFakeReviews(bookingData, userData, eventData) {
    // This would check for review fraud patterns
    const mockSimilarReviews = 0; // Simulated
    
    const isSuspicious = mockSimilarReviews > 2;
    const riskScore = isSuspicious ? 0.4 : 0;
    
    return {
      is_suspicious: isSuspicious,
      risk_score: riskScore,
      details: {
        similar_reviews_count: mockSimilarReviews,
        time_window: '1 hour',
        threshold_exceeded: mockSimilarReviews > 2
      }
    };
  }

  determineFraudStatus(riskScore) {
    if (riskScore >= this.riskThresholds.high) {
      return 'high_risk';
    } else if (riskScore >= this.riskThresholds.medium) {
      return 'medium_risk';
    } else if (riskScore >= this.riskThresholds.low) {
      return 'low_risk';
    } else {
      return 'no_risk';
    }
  }

  generateRecommendation(fraudStatus, checks) {
    const recommendations = {
      high_risk: {
        action: 'BLOCK_BOOKING',
        message: 'High fraud risk detected. Booking should be blocked and reviewed manually.',
        steps: [
          'Hold booking confirmation',
          'Flag user account for review',
          'Contact payment provider',
          'Notify security team'
        ]
      },
      medium_risk: {
        action: 'REQUIRE_VERIFICATION',
        message: 'Medium fraud risk detected. Additional verification required.',
        steps: [
          'Require phone verification',
          'Request additional ID proof',
          'Enable two-factor authentication',
          'Monitor subsequent activity'
        ]
      },
      low_risk: {
        action: 'MONITOR',
        message: 'Low fraud risk detected. Monitor for unusual activity.',
        steps: [
          'Log for pattern analysis',
          'Watch for similar patterns',
          'No immediate action required'
        ]
      },
      no_risk: {
        action: 'APPROVE',
        message: 'No fraud risk detected.',
        steps: [
          'Proceed with normal processing',
          'Update fraud model with clean data'
        ]
      }
    };
    
    const baseRecommendation = recommendations[fraudStatus] || recommendations.no_risk;
    
    // Add specific recommendations based on detected patterns
    const patternRecommendations = [];
    
    checks.forEach(check => {
      switch (check.pattern) {
        case 'multiple_bookings':
          patternRecommendations.push('Verify user identity and booking intent');
          break;
        case 'high_value_booking':
          patternRecommendations.push('Request additional payment verification');
          break;
        case 'suspicious_payment':
          patternRecommendations.push('Contact payment provider for verification');
          break;
      }
    });
    
    return {
      ...baseRecommendation,
      pattern_specific_recommendations: patternRecommendations
    };
  }

  async logSuspiciousActivity(bookingData, checks, riskScore, fraudStatus) {
    const activity = {
      bookingId: bookingData.bookingId,
      userId: bookingData.userId,
      eventId: bookingData.eventId,
      timestamp: new Date().toISOString(),
      risk_score: riskScore,
      fraud_status: fraudStatus,
      detected_patterns: checks.map(check => ({
        pattern: check.pattern,
        risk_score: check.risk_score,
        details: check.details
      })),
      action_taken: 'logged',
      resolved: false
    };
    
    this.suspiciousActivities.push(activity);
    
    // Keep only last 1000 activities in memory
    if (this.suspiciousActivities.length > 1000) {
      this.suspiciousActivities = this.suspiciousActivities.slice(-1000);
    }
    
    logger.agent(this.name, `Logged suspicious activity for booking ${bookingData.bookingId}`);
    
    return activity;
  }

  async batchAnalyze(bookingsData) {
    try {
      logger.agent(this.name, `Batch analyzing ${bookingsData.length} bookings`);
      
      const results = [];
      const suspiciousBookings = [];
      
      for (const bookingData of bookingsData) {
        const result = await this.analyzeBooking(
          bookingData,
          bookingData.userData || {},
          bookingData.eventData || {}
        );
        
        if (result.success) {
          results.push(result.analysis);
          
          if (result.analysis.fraud_status !== 'no_risk') {
            suspiciousBookings.push({
              bookingId: bookingData.bookingId,
              risk_score: result.analysis.risk_score,
              fraud_status: result.analysis.fraud_status
            });
          }
        }
      }
      
      // Generate batch summary
      const summary = this.generateBatchSummary(results);
      
      logger.success(`Batch analysis complete: ${suspiciousBookings.length} suspicious bookings found`);
      
      return {
        success: true,
        total_analyzed: results.length,
        suspicious_count: suspiciousBookings.length,
        summary: summary,
        suspicious_bookings: suspiciousBookings,
        detailed_results: results
      };
    } catch (error) {
      logger.error(`Batch analysis failed: ${error.message}`);
      throw error;
    }
  }

  generateBatchSummary(results) {
    const total = results.length;
    if (total === 0) return { total: 0 };
    
    let noRisk = 0, lowRisk = 0, mediumRisk = 0, highRisk = 0;
    let totalRiskScore = 0;
    const patternCounts = {};
    
    results.forEach(result => {
      totalRiskScore += result.risk_score;
      
      switch (result.fraud_status) {
        case 'no_risk': noRisk++; break;
        case 'low_risk': lowRisk++; break;
        case 'medium_risk': mediumRisk++; break;
        case 'high_risk': highRisk++; break;
      }
      
      // Count patterns
      result.suspicious_patterns.forEach(pattern => {
        patternCounts[pattern.pattern] = (patternCounts[pattern.pattern] || 0) + 1;
      });
    });
    
    // Sort patterns by frequency
    const topPatterns = Object.entries(patternCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count, percentage: (count / total) * 100 }));
    
    return {
      total: total,
      average_risk_score: totalRiskScore / total,
      distribution: {
        no_risk: { count: noRisk, percentage: (noRisk / total) * 100 },
        low_risk: { count: lowRisk, percentage: (lowRisk / total) * 100 },
        medium_risk: { count: mediumRisk, percentage: (mediumRisk / total) * 100 },
        high_risk: { count: highRisk, percentage: (highRisk / total) * 100 }
      },
      top_patterns: topPatterns,
      recommendations: this.generateBatchRecommendations(highRisk, mediumRisk, total)
    };
  }

  generateBatchRecommendations(highRiskCount, mediumRiskCount, total) {
    const recommendations = [];
    
    const highRiskPercentage = (highRiskCount / total) * 100;
    const mediumRiskPercentage = (mediumRiskCount / total) * 100;
    
    if (highRiskPercentage > 5) {
      recommendations.push({
        priority: 'high',
        action: 'Review fraud detection rules',
        details: `High risk bookings are ${highRiskPercentage.toFixed(1)}% of total`,
        urgency: 'immediate'
      });
    }
    
    if (mediumRiskPercentage > 15) {
      recommendations.push({
        priority: 'medium',
        action: 'Enhance verification procedures',
        details: `Medium risk bookings are ${mediumRiskPercentage.toFixed(1)}% of total`,
        urgency: 'soon'
      });
    }
    
    if (highRiskCount === 0 && mediumRiskCount === 0) {
      recommendations.push({
        priority: 'low',
        action: 'Maintain current procedures',
        details: 'No significant fraud risk detected',
        urgency: 'monitor'
      });
    }
    
    return recommendations;
  }

  async getSuspiciousActivities(timeframe = '24h') {
    const now = new Date();
    let cutoffTime;
    
    switch (timeframe) {
      case '1h':
        cutoffTime = new Date(now - 60 * 60 * 1000);
        break;
      case '24h':
        cutoffTime = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffTime = new Date(0); // All time
    }
    
    const filtered = this.suspiciousActivities.filter(activity => 
      new Date(activity.timestamp) >= cutoffTime
    );
    
    return {
      success: true,
      timeframe: timeframe,
      count: filtered.length,
      activities: filtered.slice(0, 100), // Limit response
      summary: this.summarizeActivities(filtered)
    };
  }

  summarizeActivities(activities) {
    if (activities.length === 0) return { total: 0 };
    
    let highRisk = 0, mediumRisk = 0, lowRisk = 0;
    let totalRiskScore = 0;
    const patternDistribution = {};
    
    activities.forEach(activity => {
      totalRiskScore += activity.risk_score;
      
      switch (activity.fraud_status) {
        case 'high_risk': highRisk++; break;
        case 'medium_risk': mediumRisk++; break;
        case 'low_risk': lowRisk++; break;
      }
      
      activity.detected_patterns.forEach(pattern => {
        patternDistribution[pattern.pattern] = (patternDistribution[pattern.pattern] || 0) + 1;
      });
    });
    
    return {
      total: activities.length,
      average_risk_score: totalRiskScore / activities.length,
      risk_distribution: {
        high_risk: highRisk,
        medium_risk: mediumRisk,
        low_risk: lowRisk
      },
      pattern_distribution: patternDistribution,
      unresolved_count: activities.filter(a => !a.resolved).length
    };
  }

  async markAsResolved(activityId, resolutionData) {
    // In production, would update in database
    // For now, update in memory
    
    const activity = this.suspiciousActivities.find(a => 
      a.bookingId === activityId || a._id === activityId
    );
    
    if (!activity) {
      return {
        success: false,
        error: 'Activity not found'
      };
    }
    
    activity.resolved = true;
    activity.resolved_at = new Date().toISOString();
    activity.resolution_data = resolutionData;
    
    logger.agent(this.name, `Marked activity ${activityId} as resolved`);
    
    return {
      success: true,
      activityId: activityId,
      resolved: true,
      timestamp: activity.resolved_at
    };
  }

  async updateRiskThresholds(newThresholds) {
    this.riskThresholds = {
      ...this.riskThresholds,
      ...newThresholds
    };
    
    logger.agent(this.name, 'Updated risk thresholds', this.riskThresholds);
    
    return {
      success: true,
      thresholds: this.riskThresholds
    };
  }

  async addFraudPattern(patternName, patternData) {
    if (this.fraudPatterns.has(patternName)) {
      return {
        success: false,
        error: `Pattern ${patternName} already exists`
      };
    }
    
    this.fraudPatterns.set(patternName, {
      pattern: patternData.description,
      risk_score: patternData.risk_score || 0.5,
      check_function: patternData.check_function || (() => ({ is_suspicious: false, risk_score: 0 }))
    });
    
    logger.agent(this.name, `Added new fraud pattern: ${patternName}`);
    
    return {
      success: true,
      pattern_name: patternName,
      patterns_count: this.fraudPatterns.size
    };
  }

  async getFraudPatterns() {
    const patterns = Array.from(this.fraudPatterns.entries()).map(([name, data]) => ({
      name,
      description: data.pattern,
      risk_score: data.risk_score,
      enabled: true
    }));
    
    return {
      success: true,
      count: patterns.length,
      patterns: patterns
    };
  }

  async getAgentStats() {
    const activities = this.suspiciousActivities;
    
    return {
      total_analyses: activities.length,
      detection_rate: activities.length > 0 ? 
        (activities.filter(a => a.fraud_status !== 'no_risk').length / activities.length) * 100 : 0,
      average_processing_time: 0.2, // seconds
      patterns_loaded: this.fraudPatterns.size,
      ml_model_version: this.mlClient.getModelVersion()
    };
  }

  getFallbackAnalysis(bookingData) {
    return {
      bookingId: bookingData.bookingId,
      risk_score: 0,
      fraud_status: 'no_risk',
      recommendation: {
        action: 'APPROVE',
        message: 'Fallback analysis: No fraud detection available',
        steps: ['Proceed with caution']
      },
      is_fallback: true
    };
  }

  clearData() {
    this.suspiciousActivities = [];
    logger.agent(this.name, 'Cleared all fraud detection data');
  }
}

module.exports = FraudDetectionAgent;