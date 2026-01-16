const logger = require('../../../config/logger');
const SentimentCheck = require('./sentiment-check');

class FeedbackSentimentAgent {
  constructor() {
    this.name = 'feedback-sentiment-agent';
    this.sentimentCheck = new SentimentCheck();
    this.reviews = new Map();
    this.alertThreshold = -0.3; // Negative sentiment threshold
    this.analyzedCount = 0;
  }

  async initialize() {
    logger.agent(this.name, 'Initializing feedback sentiment agent');
    await this.sentimentCheck.initialize();
    return true;
  }

  async analyzeReview(reviewId, reviewText, rating, eventId, userId) {
    try {
      logger.agent(this.name, `Analyzing review ${reviewId}`);
      
      // Perform sentiment analysis
      const sentiment = await this.sentimentCheck.analyzeSentiment(reviewText);
      
      // Extract issues and topics
      const issues = await this.sentimentCheck.extractIssues(reviewText);
      const topics = await this.sentimentCheck.extractTopics(reviewText);
      
      // Calculate overall score (combining rating and sentiment)
      const overallScore = this.calculateOverallScore(rating, sentiment.score);
      
      // Determine action required
      const actionRequired = this.determineActionRequired(overallScore, issues);
      
      // Store analysis
      const analysis = {
        reviewId,
        eventId,
        userId,
        text: reviewText,
        rating,
        sentiment: {
          score: sentiment.score,
          magnitude: sentiment.magnitude,
          label: sentiment.label
        },
        issues: issues,
        topics: topics,
        overall_score: overallScore,
        action_required: actionRequired,
        analyzed_at: new Date().toISOString()
      };
      
      this.reviews.set(reviewId, analysis);
      this.analyzedCount++;
      
      // Trigger alerts if needed
      if (actionRequired.priority === 'high') {
        await this.triggerAlert(analysis);
      }
      
      logger.success(`Review ${reviewId} analyzed: ${sentiment.label} sentiment`);
      
      return {
        success: true,
        analysis: analysis,
        suggestions: this.generateSuggestions(analysis)
      };
    } catch (error) {
      logger.error(`Failed to analyze review ${reviewId}: ${error.message}`);
      return {
        success: false,
        error: 'Failed to analyze review'
      };
    }
  }

  calculateOverallScore(rating, sentimentScore) {
    // Normalize rating to -1 to 1 scale (1-5 stars to -1 to 1)
    const normalizedRating = (rating - 3) / 2;
    
    // Weighted average: 60% sentiment, 40% rating
    const weightSentiment = 0.6;
    const weightRating = 0.4;
    
    const overall = (sentimentScore * weightSentiment) + (normalizedRating * weightRating);
    
    return Math.max(-1, Math.min(1, overall)); // Clamp between -1 and 1
  }

  determineActionRequired(overallScore, issues) {
    let priority = 'low';
    let actions = [];
    
    if (overallScore <= this.alertThreshold) {
      priority = 'high';
      actions = [
        'Immediate follow-up required',
        'Notify event organizer',
        'Consider compensation or resolution'
      ];
    } else if (overallScore <= 0) {
      priority = 'medium';
      actions = [
        'Monitor for similar feedback',
        'Suggest improvements to organizer'
      ];
    } else {
      priority = 'low';
      actions = [
        'Thank customer for positive feedback',
        'Highlight positive aspects for marketing'
      ];
    }
    
    // Adjust based on specific issues
    if (issues.some(issue => issue.severity === 'critical')) {
      priority = 'high';
      actions.push('Address specific critical issues immediately');
    }
    
    return {
      priority,
      actions,
      response_needed: priority !== 'low'
    };
  }

  async triggerAlert(analysis) {
    logger.agent(this.name, `Triggering alert for review ${analysis.reviewId}`);
    
    const alert = {
      type: 'negative_feedback',
      reviewId: analysis.reviewId,
      eventId: analysis.eventId,
      userId: analysis.userId,
      sentiment_score: analysis.sentiment.score,
      overall_score: analysis.overall_score,
      critical_issues: analysis.issues.filter(i => i.severity === 'critical'),
      timestamp: new Date().toISOString(),
      action_items: analysis.action_required.actions
    };
    
    // In production, this would:
    // 1. Send email notification
    // 2. Create ticket in helpdesk
    // 3. Notify via Slack/Teams
    // 4. Update dashboard
    
    logger.warning(`Alert triggered: Negative feedback for event ${analysis.eventId}`);
    
    return alert;
  }

  generateSuggestions(analysis) {
    const suggestions = [];
    
    // Sentiment-based suggestions
    if (analysis.sentiment.score < 0) {
      suggestions.push({
        type: 'response_template',
        content: 'Thank you for your feedback. We apologize for the issues you experienced and will address them immediately.'
      });
    } else {
      suggestions.push({
        type: 'response_template',
        content: 'Thank you for your positive feedback! We\'re glad you enjoyed the event.'
      });
    }
    
    // Issue-specific suggestions
    analysis.issues.forEach(issue => {
      switch (issue.type) {
        case 'pricing':
          suggestions.push({
            type: 'improvement',
            area: 'pricing',
            suggestion: 'Review pricing strategy and consider tiered pricing or discounts'
          });
          break;
          
        case 'logistics':
          suggestions.push({
            type: 'improvement',
            area: 'operations',
            suggestion: 'Improve logistical planning and on-site management'
          });
          break;
          
        case 'quality':
          suggestions.push({
            type: 'improvement',
            area: 'quality',
            suggestion: 'Enhance service quality through staff training'
          });
          break;
      }
    });
    
    return suggestions;
  }

  async analyzeBatchReviews(reviews) {
    try {
      logger.agent(this.name, `Analyzing batch of ${reviews.length} reviews`);
      
      const results = [];
      const alerts = [];
      
      for (const review of reviews) {
        const result = await this.analyzeReview(
          review.reviewId,
          review.text,
          review.rating,
          review.eventId,
          review.userId
        );
        
        if (result.success) {
          results.push(result.analysis);
          
          if (result.analysis.action_required.priority === 'high') {
            alerts.push({
              reviewId: review.reviewId,
              eventId: review.eventId,
              score: result.analysis.overall_score,
              issues: result.analysis.issues.length
            });
          }
        }
      }
      
      // Generate summary
      const summary = this.generateBatchSummary(results);
      
      logger.success(`Batch analysis complete: ${results.length} reviews processed`);
      
      return {
        success: true,
        processed: results.length,
        summary: summary,
        alerts: alerts,
        results: results
      };
    } catch (error) {
      logger.error(`Batch analysis failed: ${error.message}`);
      throw error;
    }
  }

  generateBatchSummary(results) {
    const total = results.length;
    if (total === 0) return { total: 0 };
    
    let positive = 0, neutral = 0, negative = 0;
    let totalScore = 0;
    const commonIssues = {};
    
    results.forEach(result => {
      totalScore += result.overall_score;
      
      if (result.overall_score > 0.2) positive++;
      else if (result.overall_score < -0.2) negative++;
      else neutral++;
      
      // Count issues
      result.issues.forEach(issue => {
        commonIssues[issue.type] = (commonIssues[issue.type] || 0) + 1;
      });
    });
    
    // Sort common issues
    const topIssues = Object.entries(commonIssues)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count, percentage: (count / total) * 100 }));
    
    return {
      total: total,
      average_score: totalScore / total,
      distribution: {
        positive: { count: positive, percentage: (positive / total) * 100 },
        neutral: { count: neutral, percentage: (neutral / total) * 100 },
        negative: { count: negative, percentage: (negative / total) * 100 }
      },
      top_issues: topIssues,
      alerts_generated: results.filter(r => r.action_required.priority === 'high').length,
      average_issues_per_review: Object.values(commonIssues).reduce((a, b) => a + b, 0) / total
    };
  }

  async getEventSentiment(eventId) {
    try {
      logger.agent(this.name, `Getting sentiment for event ${eventId}`);
      
      // Filter reviews for this event
      const eventReviews = Array.from(this.reviews.values())
        .filter(review => review.eventId === eventId);
      
      if (eventReviews.length === 0) {
        return {
          success: true,
          eventId,
          message: 'No reviews analyzed for this event',
          sentiment_score: 0
        };
      }
      
      // Calculate averages
      const totalScore = eventReviews.reduce((sum, review) => sum + review.overall_score, 0);
      const averageScore = totalScore / eventReviews.length;
      
      // Count by sentiment
      const sentimentCounts = {
        positive: eventReviews.filter(r => r.sentiment.label === 'positive').length,
        neutral: eventReviews.filter(r => r.sentiment.label === 'neutral').length,
        negative: eventReviews.filter(r => r.sentiment.label === 'negative').length
      };
      
      // Aggregate issues
      const allIssues = eventReviews.flatMap(r => r.issues);
      const issueCounts = {};
      
      allIssues.forEach(issue => {
        issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
      });
      
      // Sort issues by frequency
      const topIssues = Object.entries(issueCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([type, count]) => ({ type, count }));
      
      // Generate recommendations
      const recommendations = this.generateEventRecommendations(averageScore, topIssues, eventReviews.length);
      
      return {
        success: true,
        eventId,
        total_reviews: eventReviews.length,
        sentiment: {
          average_score: averageScore,
          label: this.getSentimentLabel(averageScore),
          distribution: sentimentCounts
        },
        common_issues: topIssues,
        recommendations: recommendations,
        recent_reviews: eventReviews.slice(-5).map(r => ({
          id: r.reviewId,
          sentiment: r.sentiment.label,
          score: r.overall_score,
          issues: r.issues.length
        }))
      };
    } catch (error) {
      logger.error(`Failed to get event sentiment: ${error.message}`);
      return {
        success: false,
        error: 'Failed to analyze event sentiment'
      };
    }
  }

  getSentimentLabel(score) {
    if (score > 0.2) return 'positive';
    if (score < -0.2) return 'negative';
    return 'neutral';
  }

  generateEventRecommendations(score, topIssues, reviewCount) {
    const recommendations = [];
    
    if (score < 0) {
      recommendations.push({
        priority: 'high',
        action: 'Address negative feedback',
        details: 'Implement immediate improvements based on common issues'
      });
    }
    
    if (reviewCount < 10) {
      recommendations.push({
        priority: 'medium',
        action: 'Collect more feedback',
        details: 'Request more reviews to get better sentiment analysis'
      });
    }
    
    topIssues.forEach(issue => {
      if (issue.count >= 3) {
        recommendations.push({
          priority: 'high',
          action: `Fix ${issue.type} issues`,
          details: `${issue.count} reviews mentioned this issue`
        });
      }
    });
    
    return recommendations;
  }

  async getOrganizerSentiment(organizerId) {
    try {
      logger.agent(this.name, `Getting sentiment for organizer ${organizerId}`);
      
      // In production, would query reviews for organizer's events
      // For now, return mock data
      
      const mockData = {
        organizerId,
        total_events: 5,
        total_reviews: 45,
        average_sentiment: 0.3,
        event_breakdown: [
          { eventId: 'event1', name: 'Tech Conference', sentiment: 0.4, reviews: 15 },
          { eventId: 'event2', name: 'Workshop', sentiment: 0.2, reviews: 10 },
          { eventId: 'event3', name: 'Networking', sentiment: 0.5, reviews: 20 }
        ],
        trends: {
          last_month: 0.2,
          current_month: 0.3,
          change: 0.1
        },
        top_issues: [
          { type: 'logistics', count: 12 },
          { type: 'pricing', count: 8 },
          { type: 'quality', count: 5 }
        ]
      };
      
      return {
        success: true,
        ...mockData
      };
    } catch (error) {
      logger.error(`Failed to get organizer sentiment: ${error.message}`);
      throw error;
    }
  }

  async trainModel(trainingData) {
    try {
      logger.agent(this.name, 'Training sentiment model');
      
      // In production, would train machine learning model
      // For now, simulate training
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const accuracy = 0.87 + Math.random() * 0.1; // 87-97% accuracy
      
      return {
        success: true,
        trained_samples: trainingData.length,
        accuracy: accuracy,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Model training failed: ${error.message}`);
      throw error;
    }
  }

  async getAnalysisStats() {
    return {
      total_analyzed: this.analyzedCount,
      sentiment_distribution: this.getSentimentDistribution(),
      common_issues: this.getCommonIssues(),
      alert_stats: this.getAlertStats(),
      performance: {
        average_processing_time: 0.5, // seconds
        accuracy: 0.89
      }
    };
  }

  getSentimentDistribution() {
    const reviews = Array.from(this.reviews.values());
    const total = reviews.length;
    
    if (total === 0) return { positive: 0, neutral: 0, negative: 0 };
    
    const positive = reviews.filter(r => r.sentiment.label === 'positive').length;
    const neutral = reviews.filter(r => r.sentiment.label === 'neutral').length;
    const negative = reviews.filter(r => r.sentiment.label === 'negative').length;
    
    return {
      positive: { count: positive, percentage: (positive / total) * 100 },
      neutral: { count: neutral, percentage: (neutral / total) * 100 },
      negative: { count: negative, percentage: (negative / total) * 100 }
    };
  }

  getCommonIssues() {
    const reviews = Array.from(this.reviews.values());
    const issueCounts = {};
    
    reviews.forEach(review => {
      review.issues.forEach(issue => {
        issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
      });
    });
    
    return Object.entries(issueCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));
  }

  getAlertStats() {
    const reviews = Array.from(this.reviews.values());
    const alerts = reviews.filter(r => r.action_required.priority === 'high').length;
    
    return {
      total_alerts: alerts,
      alert_rate: (alerts / reviews.length) * 100,
      most_common_alert_reason: this.getMostCommonAlertReason()
    };
  }

  getMostCommonAlertReason() {
    const reviews = Array.from(this.reviews.values());
    const alertReasons = {};
    
    reviews
      .filter(r => r.action_required.priority === 'high')
      .forEach(review => {
        review.issues.forEach(issue => {
          alertReasons[issue.type] = (alertReasons[issue.type] || 0) + 1;
        });
      });
    
    const entries = Object.entries(alertReasons);
    if (entries.length === 0) return 'none';
    
    return entries.sort(([,a], [,b]) => b - a)[0][0];
  }

  clearData() {
    this.reviews.clear();
    this.analyzedCount = 0;
    logger.agent(this.name, 'Cleared all sentiment data');
  }
}

module.exports = FeedbackSentimentAgent;