const logger = require('../../../config/logger');

class BudgetOptimizer {
  constructor() {
    this.categoryTemplates = {
      'venue': {
        min_percentage: 0.25,
        max_percentage: 0.4,
        factors: ['location', 'duration', 'amenities', 'capacity']
      },
      'catering': {
        min_percentage: 0.15,
        max_percentage: 0.25,
        factors: ['attendees', 'meal_type', 'duration', 'quality']
      },
      'audio_visual': {
        min_percentage: 0.05,
        max_percentage: 0.15,
        factors: ['tech_requirements', 'duration', 'quality']
      },
      'marketing': {
        min_percentage: 0.05,
        max_percentage: 0.1,
        factors: ['reach', 'channels', 'duration']
      },
      'speakers': {
        min_percentage: 0.1,
        max_percentage: 0.2,
        factors: ['fame', 'duration', 'travel']
      },
      'materials': {
        min_percentage: 0.02,
        max_percentage: 0.05,
        factors: ['attendees', 'quality', 'complexity']
      },
      'decorations': {
        min_percentage: 0.03,
        max_percentage: 0.08,
        factors: ['venue_size', 'theme', 'quality']
      },
      'photography': {
        min_percentage: 0.03,
        max_percentage: 0.07,
        factors: ['duration', 'quality', 'deliverables']
      },
      'music': {
        min_percentage: 0.04,
        max_percentage: 0.1,
        factors: ['type', 'duration', 'popularity']
      },
      'security': {
        min_percentage: 0.02,
        max_percentage: 0.04,
        factors: ['attendees', 'duration', 'risk_level']
      },
      'contingency': {
        min_percentage: 0.05,
        max_percentage: 0.1,
        factors: ['event_complexity', 'risk_level']
      }
    };
    
    this.locationMultipliers = {
      'kathmandu': 1.0,
      'pokhara': 0.9,
      'lalitpur': 1.0,
      'bhaktapur': 0.95,
      'biratnagar': 0.85,
      'other': 0.8
    };
  }

  async optimizeBudget(totalBudget, eventType, attendees, location) {
    try {
      logger.agent('BudgetOptimizer', `Optimizing budget for ${eventType} with ${attendees} attendees`);
      
      // Get event template categories
      const eventCategories = this.getEventCategories(eventType);
      
      // Calculate base allocation
      const baseAllocation = this.calculateBaseAllocation(totalBudget, eventCategories);
      
      // Apply location adjustments
      const locationAdjusted = this.applyLocationAdjustments(baseAllocation, location);
      
      // Apply scale adjustments based on attendees
      const scaleAdjusted = this.applyScaleAdjustments(locationAdjusted, attendees);
      
      // Optimize each category
      const optimized = this.optimizeCategories(scaleAdjusted, eventType, attendees, location);
      
      // Calculate summary
      const summary = this.calculateSummary(optimized, totalBudget);
      
      return {
        summary: summary,
        breakdown: optimized,
        recommendations: this.generateBudgetRecommendations(optimized, totalBudget)
      };
    } catch (error) {
      logger.error(`Budget optimization failed: ${error.message}`);
      return this.getFallbackBudget(totalBudget, eventType);
    }
  }

  getEventCategories(eventType) {
    const eventCategories = {
      'conference': ['venue', 'catering', 'audio_visual', 'marketing', 'speakers', 'materials', 'contingency'],
      'workshop': ['venue', 'materials', 'instructor', 'refreshments', 'equipment', 'contingency'],
      'wedding': ['venue', 'catering', 'decorations', 'photography', 'music', 'attire', 'contingency'],
      'birthday': ['venue', 'food', 'decorations', 'entertainment', 'cake', 'invitations', 'contingency'],
      'concert': ['venue', 'artists', 'sound', 'lighting', 'security', 'ticketing', 'contingency'],
      'festival': ['venue', 'performers', 'food_stalls', 'decorations', 'security', 'logistics', 'contingency']
    };
    
    return eventCategories[eventType] || eventCategories.conference;
  }

  calculateBaseAllocation(totalBudget, categories) {
    const allocation = {};
    
    // Distribute budget based on category templates
    let remainingPercentage = 1.0;
    
    categories.forEach(category => {
      const template = this.categoryTemplates[category];
      if (template) {
        // Use average of min and max
        const percentage = (template.min_percentage + template.max_percentage) / 2;
        allocation[category] = {
          amount: totalBudget * percentage,
          percentage: percentage,
          min: template.min_percentage,
          max: template.max_percentage,
          factors: template.factors
        };
        remainingPercentage -= percentage;
      }
    });
    
    // Distribute remaining to contingency
    if (allocation.contingency) {
      allocation.contingency.amount += totalBudget * remainingPercentage;
      allocation.contingency.percentage += remainingPercentage;
    }
    
    return allocation;
  }

  applyLocationAdjustments(allocation, location) {
    const multiplier = this.locationMultipliers[location.toLowerCase()] || this.locationMultipliers.other;
    
    const adjusted = {};
    Object.entries(allocation).forEach(([category, data]) => {
      // Some categories are more location-sensitive than others
      let categoryMultiplier = multiplier;
      
      if (['venue', 'catering', 'music'].includes(category)) {
        categoryMultiplier = multiplier * 1.1; // More sensitive to location
      } else if (['materials', 'equipment'].includes(category)) {
        categoryMultiplier = multiplier * 0.9; // Less sensitive
      }
      
      adjusted[category] = {
        ...data,
        amount: data.amount * categoryMultiplier,
        location_multiplier: categoryMultiplier
      };
    });
    
    return adjusted;
  }

  applyScaleAdjustments(allocation, attendees) {
    const adjusted = {};
    const scale = this.calculateScaleFactor(attendees);
    
    Object.entries(allocation).forEach(([category, data]) => {
      let scaleMultiplier = scale;
      
      // Different categories scale differently
      if (['venue', 'catering'].includes(category)) {
        scaleMultiplier = Math.pow(scale, 0.8); // Economies of scale
      } else if (['materials', 'equipment'].includes(category)) {
        scaleMultiplier = scale; // Linear scaling
      } else if (['speakers', 'artists'].includes(category)) {
        scaleMultiplier = 1; // Fixed cost
      }
      
      adjusted[category] = {
        ...data,
        amount: data.amount * scaleMultiplier,
        scale_multiplier: scaleMultiplier,
        per_attendee_cost: data.amount / attendees
      };
    });
    
    return adjusted;
  }

  calculateScaleFactor(attendees) {
    // Non-linear scaling: costs increase slower than attendees
    if (attendees <= 50) return 1.0;
    if (attendees <= 100) return 1.5;
    if (attendees <= 500) return 2.5;
    if (attendees <= 1000) return 3.5;
    return 4.0; // 1000+ attendees
  }

  optimizeCategories(allocation, eventType, attendees, location) {
    const optimized = {};
    
    Object.entries(allocation).forEach(([category, data]) => {
      const optimizations = this.optimizeCategory(category, data, eventType, attendees, location);
      
      optimized[category] = {
        ...data,
        ...optimizations,
        optimized_amount: optimizations.recommended_amount || data.amount
      };
    });
    
    return optimized;
  }

  optimizeCategory(category, data, eventType, attendees, location) {
    const optimizations = {
      potential_savings: 0,
      recommendations: [],
      tradeoffs: []
    };
    
    // Category-specific optimization logic
    switch (category) {
      case 'venue':
        optimizations.potential_savings = data.amount * 0.1; // 10% potential savings
        optimizations.recommendations = [
          'Consider weekday rates',
          'Book 3+ months in advance',
          'Negotiate package deals with catering'
        ];
        break;
        
      case 'catering':
        optimizations.potential_savings = data.amount * 0.15;
        optimizations.recommendations = [
          'Buffet style is 30% cheaper than plated',
          'Local cuisine saves 20% vs international',
          'Limit beverage options to reduce costs'
        ];
        break;
        
      case 'audio_visual':
        optimizations.potential_savings = data.amount * 0.2;
        optimizations.recommendations = [
          'Rent instead of buying equipment',
          'Use venue-provided AV when possible',
          'Hire local technicians'
        ];
        break;
        
      case 'marketing':
        optimizations.potential_savings = data.amount * 0.25;
        optimizations.recommendations = [
          'Focus on digital marketing (60% cheaper)',
          'Use social media influencers',
          'Early bird discounts drive word-of-mouth'
        ];
        break;
    }
    
    // Calculate recommended amount (10-20% below current)
    const savingPercentage = 0.15 + Math.random() * 0.05; // 15-20%
    optimizations.recommended_amount = data.amount * (1 - savingPercentage);
    
    return optimizations;
  }

  calculateSummary(breakdown, totalBudget) {
    const allocated = Object.values(breakdown).reduce((sum, item) => sum + item.amount, 0);
    const optimized = Object.values(breakdown).reduce((sum, item) => sum + (item.optimized_amount || item.amount), 0);
    
    const potentialSavings = allocated - optimized;
    
    // Identify top 3 cost categories
    const topCategories = Object.entries(breakdown)
      .sort(([,a], [,b]) => b.amount - a.amount)
      .slice(0, 3)
      .map(([name, data]) => ({
        name,
        amount: data.amount,
        percentage: (data.amount / allocated) * 100
      }));
    
    return {
      total_budget: totalBudget,
      allocated_amount: allocated,
      optimized_amount: optimized,
      potential_savings: potentialSavings,
      savings_percentage: (potentialSavings / allocated) * 100,
      top_categories: topCategories,
      cost_percentage_breakdown: Object.entries(breakdown).reduce((acc, [name, data]) => {
        acc[name] = (data.amount / allocated) * 100;
        return acc;
      }, {})
    };
  }

  generateBudgetRecommendations(breakdown, totalBudget) {
    const recommendations = [];
    const summary = this.calculateSummary(breakdown, totalBudget);
    
    // Overall budget recommendation
    if (summary.savings_percentage > 15) {
      recommendations.push({
        type: 'success',
        message: `Good budget allocation! You can save ${summary.savings_percentage.toFixed(1)}% with optimizations.`,
        priority: 'low'
      });
    } else if (summary.savings_percentage > 5) {
      recommendations.push({
        type: 'info',
        message: `Moderate optimization potential of ${summary.savings_percentage.toFixed(1)}%.`,
        priority: 'medium'
      });
    } else {
      recommendations.push({
        type: 'warning',
        message: 'Limited optimization potential. Consider increasing budget or reducing scope.',
        priority: 'high'
      });
    }
    
    // Category-specific recommendations
    summary.top_categories.forEach(category => {
      if (category.percentage > 40) {
        recommendations.push({
          type: 'warning',
          message: `${category.name} is ${category.percentage.toFixed(1)}% of total budget - high concentration risk.`,
          priority: 'high'
        });
      }
    });
    
    return recommendations;
  }

  getFallbackBudget(totalBudget, eventType) {
    logger.warning(`Using fallback budget for ${eventType}`);
    
    const simpleAllocation = {
      'venue': totalBudget * 0.3,
      'catering': totalBudget * 0.2,
      'other': totalBudget * 0.4,
      'contingency': totalBudget * 0.1
    };
    
    const breakdown = {};
    Object.entries(simpleAllocation).forEach(([category, amount]) => {
      breakdown[category] = {
        amount: amount,
        percentage: (amount / totalBudget) * 100,
        optimized_amount: amount * 0.9,
        potential_savings: amount * 0.1
      };
    });
    
    return {
      summary: {
        total_budget: totalBudget,
        allocated_amount: totalBudget,
        optimized_amount: totalBudget * 0.9,
        potential_savings: totalBudget * 0.1,
        savings_percentage: 10,
        top_categories: [{
          name: 'venue',
          amount: simpleAllocation.venue,
          percentage: 30
        }]
      },
      breakdown: breakdown,
      recommendations: [{
        type: 'info',
        message: 'Using simplified budget allocation',
        priority: 'medium'
      }]
    };
  }

  async analyzeHistoricalData(historicalEvents) {
    logger.agent('BudgetOptimizer', 'Analyzing historical event data');
    
    const analysis = {
      total_events: historicalEvents.length,
      average_budgets: {},
      common_overspends: [],
      best_practices: []
    };
    
    // Analyze by event type
    const eventsByType = {};
    historicalEvents.forEach(event => {
      if (!eventsByType[event.type]) {
        eventsByType[event.type] = [];
      }
      eventsByType[event.type].push(event);
    });
    
    Object.entries(eventsByType).forEach(([type, events]) => {
      const totalBudget = events.reduce((sum, event) => sum + event.budget, 0);
      const totalActual = events.reduce((sum, event) => sum + event.actual_cost, 0);
      
      analysis.average_budgets[type] = {
        planned: totalBudget / events.length,
        actual: totalActual / events.length,
        variance: ((totalActual - totalBudget) / totalBudget) * 100,
        count: events.length
      };
    });
    
    // Identify common overspend categories
    const overspendCategories = new Map();
    historicalEvents.forEach(event => {
      Object.entries(event.category_spending).forEach(([category, { planned, actual }]) => {
        if (actual > planned) {
          const overspend = actual - planned;
          overspendCategories.set(category, (overspendCategories.get(category) || 0) + overspend);
        }
      });
    });
    
    analysis.common_overspends = Array.from(overspendCategories.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([category, total]) => ({
        category,
        total_overspend: total,
        average_per_event: total / historicalEvents.length
      }));
    
    // Extract best practices
    analysis.best_practices = this.extractBestPractices(historicalEvents);
    
    return analysis;
  }

  extractBestPractices(events) {
    const successfulEvents = events.filter(event => 
      event.actual_cost <= event.budget && event.attendance_rate >= 0.8
    );
    
    if (successfulEvents.length === 0) return [];
    
    const practices = [];
    
    // Common practices among successful events
    const commonCategories = new Set();
    successfulEvents.forEach(event => {
      Object.entries(event.category_spending).forEach(([category, data]) => {
        if (data.actual <= data.planned * 0.9) { // Under budget by 10%
          commonCategories.add(category);
        }
      });
    });
    
    if (commonCategories.size > 0) {
      practices.push({
        practice: 'Effective cost control in: ' + Array.from(commonCategories).join(', '),
        success_rate: (commonCategories.size / successfulEvents.length) * 100
      });
    }
    
    return practices;
  }
}

module.exports = BudgetOptimizer;