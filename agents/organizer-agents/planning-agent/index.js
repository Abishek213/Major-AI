const logger = require('../../../config/logger');
const BudgetOptimizer = require('./budget-optimizer');

class PlanningAgent {
  constructor() {
    this.name = 'planning-agent';
    this.budgetOptimizer = new BudgetOptimizer();
    this.eventTemplates = {
      'conference': this.getConferenceTemplate(),
      'workshop': this.getWorkshopTemplate(),
      'wedding': this.getWeddingTemplate(),
      'birthday': this.getBirthdayTemplate(),
      'concert': this.getConcertTemplate(),
      'festival': this.getFestivalTemplate()
    };
  }

  async initialize() {
    logger.agent(this.name, 'Initializing planning agent');
    return true;
  }

  async createEventPlan(eventType, budget, attendees, location, date) {
    try {
      logger.agent(this.name, `Creating ${eventType} plan for ${attendees} attendees`);
      
      // Get template for event type
      const template = this.eventTemplates[eventType] || this.eventTemplates.conference;
      
      // Optimize budget allocation
      const optimizedBudget = await this.budgetOptimizer.optimizeBudget(
        budget,
        eventType,
        attendees,
        location
      );
      
      // Generate timeline
      const timeline = this.generateTimeline(eventType, date);
      
      // Generate checklist
      const checklist = this.generateChecklist(eventType, attendees);
      
      // Generate vendor recommendations
      const vendors = await this.recommendVendors(eventType, location, budget);
      
      // Generate risk assessment
      const risks = this.assessRisks(eventType, location, date, attendees);
      
      const eventPlan = {
        event_type: eventType,
        budget_summary: optimizedBudget.summary,
        detailed_budget: optimizedBudget.breakdown,
        timeline: timeline,
        checklist: checklist,
        vendor_recommendations: vendors,
        risk_assessment: risks,
        key_metrics: this.calculateKeyMetrics(optimizedBudget, attendees, eventType),
        recommendations: this.generateRecommendations(optimizedBudget, eventType, location),
        generated_at: new Date().toISOString()
      };
      
      logger.success(`Event plan created for ${eventType} with budget ${budget}`);
      
      return {
        success: true,
        plan: eventPlan
      };
    } catch (error) {
      logger.error(`Failed to create event plan: ${error.message}`);
      return {
        success: false,
        error: 'Failed to create event plan'
      };
    }
  }

  getConferenceTemplate() {
    return {
      name: 'Professional Conference',
      categories: ['venue', 'catering', 'audio_visual', 'marketing', 'speakers', 'materials'],
      default_timeline_days: 60,
      required_vendors: ['venue', 'catering', 'av']
    };
  }

  getWorkshopTemplate() {
    return {
      name: 'Training Workshop',
      categories: ['venue', 'materials', 'instructor', 'refreshments', 'equipment'],
      default_timeline_days: 30,
      required_vendors: ['venue', 'instructor']
    };
  }

  getWeddingTemplate() {
    return {
      name: 'Wedding Celebration',
      categories: ['venue', 'catering', 'decorations', 'photography', 'music', 'attire'],
      default_timeline_days: 180,
      required_vendors: ['venue', 'catering', 'photography']
    };
  }

  getBirthdayTemplate() {
    return {
      name: 'Birthday Party',
      categories: ['venue', 'food', 'decorations', 'entertainment', 'cake', 'invitations'],
      default_timeline_days: 30,
      required_vendors: ['venue', 'catering']
    };
  }

  getConcertTemplate() {
    return {
      name: 'Music Concert',
      categories: ['venue', 'artists', 'sound', 'lighting', 'security', 'ticketing'],
      default_timeline_days: 90,
      required_vendors: ['venue', 'sound', 'artists']
    };
  }

  getFestivalTemplate() {
    return {
      name: 'Cultural Festival',
      categories: ['venue', 'performers', 'food_stalls', 'decorations', 'security', 'logistics'],
      default_timeline_days: 120,
      required_vendors: ['venue', 'security', 'logistics']
    };
  }

  generateTimeline(eventType, eventDate) {
    const template = this.eventTemplates[eventType] || this.eventTemplates.conference;
    const daysBefore = template.default_timeline_days;
    
    const eventDateObj = new Date(eventDate);
    const milestones = [];
    
    // Standard milestones for all events
    milestones.push({
      days_before: daysBefore,
      task: 'Finalize budget and secure initial funding',
      priority: 'high'
    });
    
    milestones.push({
      days_before: daysBefore - 7,
      task: 'Book venue and key vendors',
      priority: 'high'
    });
    
    milestones.push({
      days_before: daysBefore - 30,
      task: 'Start marketing and promotion',
      priority: 'medium'
    });
    
    milestones.push({
      days_before: daysBefore - 45,
      task: 'Finalize speakers/performers',
      priority: 'high'
    });
    
    milestones.push({
      days_before: 14,
      task: 'Send final confirmations to vendors',
      priority: 'medium'
    });
    
    milestones.push({
      days_before: 7,
      task: 'Final walkthrough and preparations',
      priority: 'high'
    });
    
    milestones.push({
      days_before: 1,
      task: 'Day-before preparations and briefings',
      priority: 'high'
    });
    
    milestones.push({
      days_before: 0,
      task: 'Event day execution',
      priority: 'critical'
    });
    
    // Calculate actual dates
    milestones.forEach(milestone => {
      const milestoneDate = new Date(eventDateObj);
      milestoneDate.setDate(milestoneDate.getDate() - milestone.days_before);
      milestone.date = milestoneDate.toISOString().split('T')[0];
    });
    
    return milestones.sort((a, b) => a.days_before - b.days_before);
  }

  generateChecklist(eventType, attendees) {
    const checklists = {
      'conference': [
        'Venue booking confirmation',
        'Speaker agreements signed',
        'AV equipment booked',
        'Catering menu finalized',
        'Registration system tested',
        'Name tags printed',
        'Presentation materials ready',
        'WiFi arrangements confirmed'
      ],
      'wedding': [
        'Venue booked',
        'Caterer confirmed',
        'Photographer hired',
        'Invitations sent',
        'Guest list finalized',
        'Decorations planned',
        'Music/DJ booked',
        'Attire ready'
      ],
      'workshop': [
        'Venue secured',
        'Materials prepared',
        'Attendee list confirmed',
        'Equipment tested',
        'Refreshments arranged',
        'Feedback forms ready'
      ]
    };
    
    const baseChecklist = checklists[eventType] || checklists.conference;
    
    // Add scalable items based on attendees
    if (attendees > 50) {
      baseChecklist.push('Additional staff/volunteers arranged');
      baseChecklist.push('Emergency medical arrangements');
    }
    
    if (attendees > 100) {
      baseChecklist.push('Security personnel booked');
      baseChecklist.push('Parking arrangements confirmed');
    }
    
    return baseChecklist.map((item, index) => ({
      id: `task_${index + 1}`,
      description: item,
      completed: false,
      category: this.categorizeTask(item)
    }));
  }

  categorizeTask(task) {
    if (task.includes('venue') || task.includes('book')) return 'logistics';
    if (task.includes('food') || task.includes('cater')) return 'food';
    if (task.includes('material') || task.includes('print')) return 'materials';
    if (task.includes('speaker') || task.includes('music')) return 'talent';
    if (task.includes('security') || task.includes('medical')) return 'safety';
    return 'general';
  }

  async recommendVendors(eventType, location, budget) {
    // Mock vendor database - in production, query real database
    const vendorDatabase = {
      'kathmandu': {
        'venue': [
          { name: 'Hotel Yak & Yeti', type: 'luxury', price_range: 'high' },
          { name: 'Brihaspati Vidyasadan', type: 'conference', price_range: 'medium' },
          { name: 'Park Village Resort', type: 'garden', price_range: 'medium' }
        ],
        'catering': [
          { name: 'Fire and Ice Pizzeria', cuisine: 'italian', price_range: 'medium' },
          { name: 'Roadhouse Cafe', cuisine: 'multi', price_range: 'medium' },
          { name: 'KFC', cuisine: 'fast-food', price_range: 'low' }
        ],
        'photography': [
          { name: 'Studio 7', specialty: 'events', price_range: 'high' },
          { name: 'Memory Lane', specialty: 'weddings', price_range: 'medium' }
        ]
      },
      'pokhara': {
        'venue': [
          { name: 'Fish Tail Lodge', type: 'luxury', price_range: 'high' },
          { name: 'Hotel Barahi', type: 'lakeside', price_range: 'medium' }
        ],
        'catering': [
          { name: 'Moondance Restaurant', cuisine: 'continental', price_range: 'medium' }
        ]
      }
    };
    
    const locationVendors = vendorDatabase[location.toLowerCase()] || vendorDatabase.kathmandu;
    const template = this.eventTemplates[eventType];
    
    const recommendations = {};
    
    template.required_vendors.forEach(vendorType => {
      if (locationVendors[vendorType]) {
        // Filter by budget
        const budgetLevel = this.getBudgetLevel(budget, eventType);
        const filtered = locationVendors[vendorType].filter(vendor => 
          this.vendorMatchesBudget(vendor.price_range, budgetLevel)
        );
        
        if (filtered.length > 0) {
          recommendations[vendorType] = filtered.slice(0, 3); // Top 3 recommendations
        }
      }
    });
    
    return recommendations;
  }

  getBudgetLevel(budget, eventType) {
    const avgBudgets = {
      'conference': 500000,
      'wedding': 1000000,
      'workshop': 100000,
      'birthday': 50000,
      'concert': 2000000,
      'festival': 3000000
    };
    
    const avg = avgBudgets[eventType] || 500000;
    
    if (budget >= avg * 2) return 'high';
    if (budget >= avg) return 'medium';
    return 'low';
  }

  vendorMatchesBudget(vendorLevel, budgetLevel) {
    const levelValues = { 'low': 1, 'medium': 2, 'high': 3 };
    return levelValues[vendorLevel] <= levelValues[budgetLevel];
  }

  assessRisks(eventType, location, date, attendees) {
    const risks = [];
    
    // Weather risks
    const eventDate = new Date(date);
    const month = eventDate.getMonth() + 1;
    
    if (['June', 'July', 'August'].includes(this.getMonthName(month))) {
      risks.push({
        type: 'weather',
        level: 'high',
        description: 'Monsoon season - risk of rain for outdoor events',
        mitigation: 'Have indoor backup venue'
      });
    }
    
    // Crowd risks for large events
    if (attendees > 100) {
      risks.push({
        type: 'crowd_management',
        level: 'medium',
        description: 'Large crowd requires proper management',
        mitigation: 'Hire professional security and medical staff'
      });
    }
    
    // Location-specific risks
    if (location.toLowerCase() === 'kathmandu') {
      risks.push({
        type: 'traffic',
        level: 'medium',
        description: 'Heavy traffic may delay setup and arrivals',
        mitigation: 'Plan for early setup and inform guests about traffic'
      });
    }
    
    // Event type specific risks
    if (eventType === 'concert' || eventType === 'festival') {
      risks.push({
        type: 'noise_complaints',
        level: 'medium',
        description: 'Potential noise complaints from neighbors',
        mitigation: 'Obtain necessary permits and inform local authorities'
      });
    }
    
    return risks;
  }

  getMonthName(month) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1];
  }

  calculateKeyMetrics(budget, attendees, eventType) {
    const costPerAttendee = budget.summary.total / attendees;
    
    const industryAverages = {
      'conference': 5000,
      'workshop': 2000,
      'wedding': 10000,
      'birthday': 1500,
      'concert': 2500,
      'festival': 1000
    };
    
    const industryAvg = industryAverages[eventType] || 3000;
    const efficiency = (industryAvg - costPerAttendee) / industryAvg * 100;
    
    return {
      cost_per_attendee: costPerAttendee,
      industry_comparison: efficiency > 0 ? 'below_average' : 'above_average',
      efficiency_percentage: Math.abs(efficiency),
      roi_estimation: this.estimateROI(budget, eventType, attendees)
    };
  }

  estimateROI(budget, eventType, attendees) {
    // Simple ROI estimation
    const revenuePerAttendee = {
      'conference': 7000,
      'workshop': 3000,
      'concert': 2000,
      'festival': 500
    };
    
    const avgRevenue = revenuePerAttendee[eventType] || 2000;
    const totalRevenue = attendees * avgRevenue * 0.8; // 80% attendance assumption
    const profit = totalRevenue - budget.summary.total;
    const roi = (profit / budget.summary.total) * 100;
    
    return {
      estimated_revenue: totalRevenue,
      estimated_profit: profit,
      roi_percentage: roi,
      break_even_attendees: Math.ceil(budget.summary.total / avgRevenue)
    };
  }

  generateRecommendations(budget, eventType, location) {
    const recommendations = [];
    
    // Budget optimization recommendations
    const largestCategory = Object.entries(budget.breakdown)
      .sort(([,a], [,b]) => b.amount - a.amount)[0];
    
    if (largestCategory) {
      recommendations.push({
        category: 'budget',
        priority: 'high',
        suggestion: `Review ${largestCategory[0]} costs as it's your largest expense`,
        potential_savings: `Could save ${Math.round(largestCategory[1].amount * 0.1)} by negotiating or finding alternatives`
      });
    }
    
    // Location-specific recommendations
    if (location.toLowerCase() === 'kathmandu') {
      recommendations.push({
        category: 'logistics',
        priority: 'medium',
        suggestion: 'Consider weekday events to avoid weekend traffic congestion',
        benefit: 'Better attendance and lower vendor costs'
      });
    }
    
    // Event type recommendations
    if (eventType === 'conference' || eventType === 'workshop') {
      recommendations.push({
        category: 'revenue',
        priority: 'medium',
        suggestion: 'Offer early bird tickets and group discounts',
        benefit: 'Increase pre-event cash flow and ensure minimum attendance'
      });
    }
    
    return recommendations;
  }

  async optimizeExistingPlan(planId, newConstraints) {
    // In production, would fetch existing plan and optimize
    logger.agent(this.name, `Optimizing plan ${planId} with new constraints`);
    
    return {
      success: true,
      message: 'Plan optimization would be implemented',
      planId,
      optimizations: []
    };
  }
}

module.exports = PlanningAgent;