const logger = require('../../../config/logger');
const langchainConfig = require('../../../config/langchain');

class BudgetOptimizer {
  constructor() {
    this.llmEnabled = false; // Will be set when optimize is called
    
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

  /**
   * Main optimization function - now with LLM support
   */
  async optimizeBudget(totalBudget, eventType, attendees, location, llmEnabled = false) {
    try {
      this.llmEnabled = llmEnabled;
      logger.agent('BudgetOptimizer', `Optimizing budget for ${eventType} with ${attendees} attendees (LLM: ${llmEnabled})`);
      
      // Step 1: Get event categories
      const eventCategories = this.getEventCategories(eventType);
      
      // Step 2: Calculate base allocation (algorithmic)
      const baseAllocation = this.calculateBaseAllocation(totalBudget, eventCategories);
      
      // Step 3: Apply location adjustments
      const locationAdjusted = this.applyLocationAdjustments(baseAllocation, location);
      
      // Step 4: Apply scale adjustments based on attendees
      const scaleAdjusted = this.applyScaleAdjustments(locationAdjusted, attendees);
      
      // Step 5: Optimize each category (algorithmic)
      const optimized = this.optimizeCategories(scaleAdjusted, eventType, attendees, location);
      
      // Step 6: Calculate summary
      const summary = this.calculateSummary(optimized, totalBudget);
      
      // Step 7: Generate base recommendations (algorithmic)
      const baseRecommendations = this.generateBudgetRecommendations(optimized, totalBudget);
      
      // Step 8: Enhance with LLM insights (if available)
      const enhancedRecommendations = await this.enhanceRecommendationsWithLLM(
        optimized,
        totalBudget,
        eventType,
        attendees,
        location,
        baseRecommendations
      );
      
      return {
        summary: summary,
        breakdown: optimized,
        recommendations: enhancedRecommendations,
        metadata: {
          llm_enhanced: this.llmEnabled,
          optimization_method: this.llmEnabled ? 'hybrid' : 'algorithmic'
        }
      };
    } catch (error) {
      logger.error(`Budget optimization failed: ${error.message}`);
      return this.getFallbackBudget(totalBudget, eventType);
    }
  }

  /**
   * Enhance recommendations using LLM
   */
  async enhanceRecommendationsWithLLM(breakdown, totalBudget, eventType, attendees, location, baseRecommendations) {
    if (!this.llmEnabled) {
      return baseRecommendations;
    }
    
    try {
      const model = langchainConfig.getChatModel({ temperature: 0.7, maxTokens: 500 });
      const systemPrompt = langchainConfig.createAgentPrompt('budget-optimization');
      
      // Build context for LLM
      const budgetContext = this.buildBudgetContext(breakdown, totalBudget, eventType, attendees, location);
      
      const query = `Analyze this ${eventType} budget and provide 3 specific cost-saving recommendations:

Budget: NPR ${totalBudget.toLocaleString()}
Location: ${location}
Attendees: ${attendees}

Top Categories:
${Object.entries(breakdown)
  .sort(([,a], [,b]) => b.amount - a.amount)
  .slice(0, 5)
  .map(([cat, data]) => `- ${cat}: NPR ${data.amount.toFixed(0)} (${data.percentage.toFixed(1)}%)`)
  .join('\n')}

For each recommendation:
1. Specific category to target
2. Actionable strategy (Nepal-specific if possible)
3. Realistic savings amount in NPR

Keep responses concise and practical.`;
      
      const messages = langchainConfig.buildMessageChain(
        systemPrompt,
        [],
        query,
        budgetContext
      );
      
      const response = await model.invoke(messages);
      
      // Combine base algorithmic recommendations with LLM insights
      return [
        ...baseRecommendations,
        {
          type: 'ai_insight',
          priority: 'high',
          message: 'AI-Generated Optimization Insights',
          details: response.content,
          source: 'LLM'
        }
      ];
      
    } catch (error) {
      logger.error(`LLM enhancement failed: ${error.message}`);
      // Return base recommendations on failure
      return baseRecommendations;
    }
  }

  /**
   * Build detailed context for LLM
   */
  buildBudgetContext(breakdown, totalBudget, eventType, attendees, location) {
    const summary = this.calculateSummary(breakdown, totalBudget);
    
    return `
Event Type: ${eventType}
Total Budget: NPR ${totalBudget.toLocaleString()}
Location: ${location} (Nepal)
Attendees: ${attendees}
Cost per Attendee: NPR ${(totalBudget / attendees).toFixed(0)}

Budget Allocation:
${Object.entries(breakdown)
  .map(([cat, data]) => `${cat}: NPR ${data.amount.toFixed(0)} (${data.percentage.toFixed(1)}%) - Potential savings: NPR ${data.potential_savings.toFixed(0)}`)
  .join('\n')}

Top 3 Largest Expenses:
${summary.top_categories.map(cat => `${cat.name}: ${cat.percentage.toFixed(1)}%`).join(', ')}

Context: This is a budget for an event in Nepal. Consider local market rates, cultural factors, and practical cost-saving strategies.
`;
  }

  // ========== EXISTING ALGORITHMIC METHODS (kept as-is) ==========

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
    let remainingPercentage = 1.0;
    
    categories.forEach(category => {
      const template = this.categoryTemplates[category];
      if (template) {
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
      let categoryMultiplier = multiplier;
      
      if (['venue', 'catering', 'music'].includes(category)) {
        categoryMultiplier = multiplier * 1.1;
      } else if (['materials', 'equipment'].includes(category)) {
        categoryMultiplier = multiplier * 0.9;
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
      
      if (['venue', 'catering'].includes(category)) {
        scaleMultiplier = Math.pow(scale, 0.8);
      } else if (['materials', 'equipment'].includes(category)) {
        scaleMultiplier = scale;
      } else if (['speakers', 'artists'].includes(category)) {
        scaleMultiplier = 1;
      }
      
      adjusted[category] = {
        ...data,
        amount: data.amount * scaleMultiplier,
        scale_multiplier: scaleMultiplier,
        per_attendee_cost: (data.amount * scaleMultiplier) / attendees
      };
    });
    
    return adjusted;
  }

  calculateScaleFactor(attendees) {
    if (attendees <= 50) return 1.0;
    if (attendees <= 100) return 1.5;
    if (attendees <= 500) return 2.5;
    if (attendees <= 1000) return 3.5;
    return 4.0;
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
    
    switch (category) {
      case 'venue':
        optimizations.potential_savings = data.amount * 0.1;
        optimizations.recommendations = [
          'Consider weekday rates (20-30% cheaper)',
          'Book 3+ months in advance for early bird discounts',
          'Negotiate package deals with catering included'
        ];
        optimizations.tradeoffs = ['Weekday events may have lower attendance'];
        break;
        
      case 'catering':
        optimizations.potential_savings = data.amount * 0.15;
        optimizations.recommendations = [
          'Buffet style saves 30% vs plated service',
          'Local Nepali cuisine is 20% cheaper than continental',
          'Limit beverage variety to reduce waste and cost',
          'Consider vegetarian-focused menu (15% savings)'
        ];
        optimizations.tradeoffs = ['Limited menu may not suit all guests'];
        break;
        
      case 'audio_visual':
        optimizations.potential_savings = data.amount * 0.2;
        optimizations.recommendations = [
          'Rent equipment instead of buying',
          'Use venue-provided AV systems when available',
          'Hire local technicians (40% cheaper than agencies)',
          'DIY simple setups with volunteer help'
        ];
        optimizations.tradeoffs = ['DIY requires technical knowledge'];
        break;
        
      case 'marketing':
        optimizations.potential_savings = data.amount * 0.25;
        optimizations.recommendations = [
          'Focus on digital marketing (60% cheaper than print)',
          'Leverage social media and influencer partnerships',
          'Early bird discounts drive organic word-of-mouth',
          'Use free tools: Canva, Facebook Events, WhatsApp'
        ];
        optimizations.tradeoffs = ['Digital reach may miss older demographics'];
        break;
        
      case 'photography':
        optimizations.potential_savings = data.amount * 0.12;
        optimizations.recommendations = [
          'Hire emerging photographers (30% cheaper)',
          'Limit hours instead of full-day coverage',
          'Request digital-only delivery (no albums)',
          'Use event attendees for candid shots'
        ];
        optimizations.tradeoffs = ['Less experience may affect quality'];
        break;
        
      case 'decorations':
        optimizations.potential_savings = data.amount * 0.18;
        optimizations.recommendations = [
          'DIY decorations with team/family help',
          'Rent instead of buying (flowers, backdrops)',
          'Use venue\'s existing decor elements',
          'Seasonal flowers are 40% cheaper'
        ];
        optimizations.tradeoffs = ['DIY requires time and effort'];
        break;
        
      case 'security':
        optimizations.potential_savings = data.amount * 0.08;
        optimizations.recommendations = [
          'Hire local security personnel vs agencies',
          'Use volunteer staff for crowd management',
          'Coordinate with venue security services'
        ];
        optimizations.tradeoffs = ['Volunteers may lack professional training'];
        break;
        
      default:
        optimizations.potential_savings = data.amount * 0.1;
        optimizations.recommendations = [
          'Compare multiple vendor quotes',
          'Negotiate bulk/package discounts',
          'Consider off-peak timing for better rates'
        ];
    }
    
    // Calculate recommended amount (with savings)
    const savingPercentage = optimizations.potential_savings / data.amount;
    optimizations.recommended_amount = data.amount * (1 - savingPercentage);
    
    return optimizations;
  }

  calculateSummary(breakdown, totalBudget) {
    const allocated = Object.values(breakdown).reduce((sum, item) => sum + item.amount, 0);
    const optimized = Object.values(breakdown).reduce((sum, item) => sum + (item.optimized_amount || item.amount), 0);
    
    const potentialSavings = allocated - optimized;
    
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
        message: `Good optimization potential! You can save ${summary.savings_percentage.toFixed(1)}% (NPR ${summary.potential_savings.toFixed(0)}) with smart choices.`,
        priority: 'low'
      });
    } else if (summary.savings_percentage > 5) {
      recommendations.push({
        type: 'info',
        message: `Moderate optimization potential of ${summary.savings_percentage.toFixed(1)}% (NPR ${summary.potential_savings.toFixed(0)}).`,
        priority: 'medium'
      });
    } else {
      recommendations.push({
        type: 'warning',
        message: 'Limited optimization potential. Consider increasing budget or reducing scope.',
        priority: 'high'
      });
    }
    
    // Category-specific warnings
    summary.top_categories.forEach(category => {
      if (category.percentage > 40) {
        recommendations.push({
          type: 'warning',
          message: `${category.name} is ${category.percentage.toFixed(1)}% of total budget - high concentration risk. Consider diversifying expenses.`,
          priority: 'high'
        });
      }
    });
    
    // Find highest savings potential
    const highestSavings = Object.entries(breakdown)
      .sort(([,a], [,b]) => b.potential_savings - a.potential_savings)[0];
    
    if (highestSavings) {
      recommendations.push({
        type: 'info',
        message: `Focus on ${highestSavings[0]}: Potential to save NPR ${highestSavings[1].potential_savings.toFixed(0)} here.`,
        priority: 'medium'
      });
    }
    
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
        potential_savings: amount * 0.1,
        recommendations: ['Compare multiple vendors', 'Negotiate package deals']
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
      }],
      metadata: {
        llm_enhanced: false,
        optimization_method: 'fallback'
      }
    };
  }

  /**
   * Analyze historical data for better predictions (future enhancement)
   */
  async analyzeHistoricalData(historicalEvents) {
    logger.agent('BudgetOptimizer', 'Analyzing historical event data');
    
    const analysis = {
      total_events: historicalEvents.length,
      average_budgets: {},
      common_overspends: [],
      best_practices: []
    };
    
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
    
    const overspendCategories = new Map();
    historicalEvents.forEach(event => {
      if (event.category_spending) {
        Object.entries(event.category_spending).forEach(([category, { planned, actual }]) => {
          if (actual > planned) {
            const overspend = actual - planned;
            overspendCategories.set(category, (overspendCategories.get(category) || 0) + overspend);
          }
        });
      }
    });
    
    analysis.common_overspends = Array.from(overspendCategories.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([category, total]) => ({
        category,
        total_overspend: total,
        average_per_event: total / historicalEvents.length
      }));
    
    analysis.best_practices = this.extractBestPractices(historicalEvents);
    
    return analysis;
  }

  extractBestPractices(events) {
    const successfulEvents = events.filter(event => 
      event.actual_cost <= event.budget && event.attendance_rate >= 0.8
    );
    
    if (successfulEvents.length === 0) return [];
    
    const practices = [];
    const commonCategories = new Set();
    
    successfulEvents.forEach(event => {
      if (event.category_spending) {
        Object.entries(event.category_spending).forEach(([category, data]) => {
          if (data.actual <= data.planned * 0.9) {
            commonCategories.add(category);
          }
        });
      }
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