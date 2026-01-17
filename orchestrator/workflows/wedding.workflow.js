const logger = require('../../config/logger');

class WeddingWorkflow {
  constructor(orchestrator) {
    this.name = 'wedding-workflow';
    this.orchestrator = orchestrator;
    this.description = 'Comprehensive wedding planning workflow';
    this.requiredAgents = [
      'planning-agent',
      'budget-optimizer',
      'negotiation-agent',
      'dashboard-assistant'
    ];
    this.stages = [
      'initial_consultation',
      'budget_planning',
      'vendor_selection',
      'logistics_planning',
      'final_preparations'
    ];
  }

  async execute(input, context = {}) {
    const startTime = Date.now();
    logger.agent(this.name, `Starting wedding planning workflow`);

    try {
      const results = {
        workflow: this.name,
        stages_completed: [],
        results: {},
        recommendations: [],
        timeline: [],
        budget_summary: {},
        vendors: [],
        errors: []
      };

      // Stage 1: Initial Consultation
      await this.stageInitialConsultation(input, results, context);
      
      // Stage 2: Budget Planning
      await this.stageBudgetPlanning(input, results, context);
      
      // Stage 3: Vendor Selection
      await this.stageVendorSelection(input, results, context);
      
      // Stage 4: Logistics Planning
      await this.stageLogisticsPlanning(input, results, context);
      
      // Stage 5: Final Preparations
      await this.stageFinalPreparations(input, results, context);

      // Calculate execution time
      results.execution_time = Date.now() - startTime;
      results.completed_at = new Date().toISOString();
      
      // Generate summary
      results.summary = this.generateSummary(results);
      
      logger.success(`Wedding workflow completed in ${results.execution_time}ms`);
      
      return results;
    } catch (error) {
      logger.error(`Wedding workflow failed: ${error.message}`);
      return {
        success: false,
        workflow: this.name,
        error: error.message,
        execution_time: Date.now() - startTime
      };
    }
  }

  async stageInitialConsultation(input, results, context) {
    logger.agent(this.name, 'Stage 1: Initial Consultation');
    
    try {
      // Extract wedding details
      const weddingDetails = {
        couple_names: input.couple_names || 'Bride & Groom',
        wedding_date: input.wedding_date || new Date().toISOString().split('T')[0],
        guest_count: input.guest_count || 100,
        location: input.location || 'Kathmandu',
        theme: input.theme || 'traditional',
        budget: input.budget || 500000
      };
      
      // Use planning agent to create initial plan
      const planningResult = await this.orchestrator.routeRequest('event_planning', {
        eventType: 'wedding',
        budget: weddingDetails.budget,
        attendees: weddingDetails.guest_count,
        location: weddingDetails.location,
        date: weddingDetails.wedding_date
      }, context);
      
      results.stages_completed.push('initial_consultation');
      results.initial_plan = planningResult.combined_result?.event_plan || planningResult.results[0]?.result;
      results.wedding_details = weddingDetails;
      
      logger.agent(this.name, 'Initial consultation completed');
    } catch (error) {
      results.errors.push({
        stage: 'initial_consultation',
        error: error.message
      });
      throw error;
    }
  }

  async stageBudgetPlanning(input, results, context) {
    logger.agent(this.name, 'Stage 2: Budget Planning');
    
    try {
      const budgetData = {
        total_budget: input.budget || 500000,
        guest_count: input.guest_count || 100,
        location: input.location || 'Kathmandu',
        wedding_date: input.wedding_date || new Date().toISOString().split('T')[0]
      };
      
      // Get budget optimizer from planning agent
      const planningAgent = this.orchestrator.agents.get('planning-agent');
      if (!planningAgent) {
        throw new Error('Planning agent not available');
      }
      
      const budgetOptimizer = planningAgent.instance.budgetOptimizer;
      const optimizedBudget = await budgetOptimizer.optimizeBudget(
        budgetData.total_budget,
        'wedding',
        budgetData.guest_count,
        budgetData.location
      );
      
      results.stages_completed.push('budget_planning');
      results.budget_summary = optimizedBudget.summary;
      results.detailed_budget = optimizedBudget.breakdown;
      results.budget_recommendations = optimizedBudget.recommendations;
      
      logger.agent(this.name, `Budget planning completed: ${optimizedBudget.summary.potential_savings} potential savings`);
    } catch (error) {
      results.errors.push({
        stage: 'budget_planning',
        error: error.message
      });
      throw error;
    }
  }

  async stageVendorSelection(input, results, context) {
    logger.agent(this.name, 'Stage 3: Vendor Selection');
    
    try {
      const vendorRequirements = {
        location: input.location || 'Kathmandu',
        budget: results.budget_summary?.optimized_amount || input.budget || 500000,
        guest_count: input.guest_count || 100,
        wedding_date: input.wedding_date || new Date().toISOString().split('T')[0],
        theme: input.theme || 'traditional'
      };
      
      // Get vendor recommendations from planning agent
      const planningAgent = this.orchestrator.agents.get('planning-agent');
      if (!planningAgent) {
        throw new Error('Planning agent not available');
      }
      
      const vendorRecommendations = await planningAgent.instance.recommendVendors(
        'wedding',
        vendorRequirements.location,
        vendorRequirements.budget
      );
      
      // Simulate negotiation for key vendors
      const negotiatedVendors = [];
      const keyVendors = ['venue', 'catering', 'photography'];
      
      for (const vendorType of keyVendors) {
        if (vendorRecommendations[vendorType]) {
          const vendor = vendorRecommendations[vendorType][0]; // Pick top recommendation
          
          // Simulate negotiation
          const negotiationResult = await this.simulateVendorNegotiation(
            vendor,
            vendorType,
            vendorRequirements.budget * 0.3 // 30% of budget for key vendor
          );
          
          negotiatedVendors.push({
            type: vendorType,
            vendor: vendor.name,
            original_estimate: negotiationResult.original_price,
            negotiated_price: negotiationResult.negotiated_price,
            savings: negotiationResult.savings,
            status: negotiationResult.status
          });
        }
      }
      
      results.stages_completed.push('vendor_selection');
      results.vendor_recommendations = vendorRecommendations;
      results.negotiated_vendors = negotiatedVendors;
      results.total_vendor_savings = negotiatedVendors.reduce((sum, v) => sum + v.savings, 0);
      
      logger.agent(this.name, `Vendor selection completed: ${negotiatedVendors.length} vendors negotiated`);
    } catch (error) {
      results.errors.push({
        stage: 'vendor_selection',
        error: error.message
      });
      throw error;
    }
  }

  async simulateVendorNegotiation(vendor, vendorType, budgetAllocation) {
    // Simulate negotiation process
    const basePrice = budgetAllocation * (0.8 + Math.random() * 0.4); // 80-120% of allocation
    
    const negotiationFactors = {
      'venue': 0.85, // 15% discount typically possible
      'catering': 0.9, // 10% discount
      'photography': 0.8, // 20% discount
      'music': 0.85,
      'decorations': 0.7 // 30% discount
    };
    
    const discountFactor = negotiationFactors[vendorType] || 0.85;
    const negotiatedPrice = basePrice * discountFactor;
    
    return {
      vendor_name: vendor.name,
      vendor_type: vendorType,
      original_price: basePrice,
      negotiated_price: negotiatedPrice,
      savings: basePrice - negotiatedPrice,
      discount_percentage: (1 - discountFactor) * 100,
      status: 'negotiated'
    };
  }

  async stageLogisticsPlanning(input, results, context) {
    logger.agent(this.name, 'Stage 4: Logistics Planning');
    
    try {
      const logisticsRequirements = {
        guest_count: input.guest_count || 100,
        location: input.location || 'Kathmandu',
        wedding_date: input.wedding_date || new Date().toISOString().split('T')[0],
        venue_type: input.venue_type || 'hotel'
      };
      
      // Generate logistics plan
      const logisticsPlan = {
        timeline: this.generateWeddingTimeline(logisticsRequirements.wedding_date),
        transportation: this.planTransportation(logisticsRequirements.guest_count, logisticsRequirements.location),
        accommodations: this.planAccommodations(logisticsRequirements.guest_count, logisticsRequirements.location),
        seating_arrangement: this.planSeatingArrangement(logisticsRequirements.guest_count),
        contingency_plans: this.generateContingencyPlans()
      };
      
      // Generate checklist
      const checklist = this.generateWeddingChecklist(logisticsRequirements);
      
      results.stages_completed.push('logistics_planning');
      results.logistics_plan = logisticsPlan;
      results.checklist = checklist;
      results.timeline = logisticsPlan.timeline;
      
      logger.agent(this.name, 'Logistics planning completed');
    } catch (error) {
      results.errors.push({
        stage: 'logistics_planning',
        error: error.message
      });
      throw error;
    }
  }

  generateWeddingTimeline(weddingDate) {
    const date = new Date(weddingDate);
    const timeline = [];
    
    // Key milestones (days before wedding)
    const milestones = [
      { days: 365, task: 'Set budget and create guest list' },
      { days: 270, task: 'Book venue and set date' },
      { days: 180, task: 'Hire photographer/videographer' },
      { days: 120, task: 'Order wedding dress and attire' },
      { days: 90, task: 'Book caterer and finalize menu' },
      { days: 60, task: 'Send out invitations' },
      { days: 30, task: 'Finalize decorations and flowers' },
      { days: 14, task: 'Confirm all vendor arrangements' },
      { days: 7, task: 'Final dress fitting' },
      { days: 3, task: 'Welcome out-of-town guests' },
      { days: 1, task: 'Rehearsal dinner' },
      { days: 0, task: 'Wedding day!' }
    ];
    
    milestones.forEach(milestone => {
      const milestoneDate = new Date(date);
      milestoneDate.setDate(milestoneDate.getDate() - milestone.days);
      
      timeline.push({
        date: milestoneDate.toISOString().split('T')[0],
        days_before: milestone.days,
        task: milestone.task,
        category: this.categorizeTask(milestone.task),
        priority: milestone.days <= 30 ? 'high' : milestone.days <= 90 ? 'medium' : 'low'
      });
    });
    
    return timeline.sort((a, b) => a.days_before - b.days_before);
  }

  categorizeTask(task) {
    if (task.includes('venue') || task.includes('book')) return 'venue';
    if (task.includes('dress') || task.includes('attire')) return 'attire';
    if (task.includes('cater') || task.includes('menu')) return 'food';
    if (task.includes('photo') || task.includes('video')) return 'media';
    if (task.includes('invitation') || task.includes('guest')) return 'guests';
    return 'general';
  }

  planTransportation(guestCount, location) {
    const busesNeeded = Math.ceil(guestCount / 50);
    
    return {
      transportation_needed: busesNeeded > 0,
      buses_required: busesNeeded,
      estimated_cost: busesNeeded * 15000, // 15,000 per bus
      pickup_points: ['Hotel', 'City Center', 'Airport'],
      dropoff_points: ['Venue'],
      special_requirements: 'Air-conditioned buses with wheelchair accessibility'
    };
  }

  planAccommodations(guestCount, location) {
    const roomsNeeded = Math.ceil(guestCount * 0.3); // 30% need accommodation
    
    return {
      estimated_guests_needing_accommodation: roomsNeeded,
      recommended_hotels: [
        { name: 'Hotel Yak & Yeti', distance: '2km', price_range: 'luxury' },
        { name: 'Hotel Annapurna', distance: '3km', price_range: 'mid-range' },
        { name: 'Hyatt Regency', distance: '5km', price_range: 'luxury' }
      ],
      estimated_cost: roomsNeeded * 8000, // 8,000 per room
      block_booking_discount: '10% off for group booking',
      contact_person: 'Hotel Group Sales Manager'
    };
  }

  planSeatingArrangement(guestCount) {
    const tables = Math.ceil(guestCount / 10);
    
    return {
      total_tables: tables,
      guests_per_table: 10,
      table_arrangement: 'Round tables with centerpieces',
      special_tables: ['Bridal Table', 'Parents Table', 'VIP Table'],
      seating_plan_software: 'Recommended: AllSeated or WeddingWire',
      considerations: [
        'Keep families together',
        'Separate divorced parents',
        'Group friends together',
        'Consider dietary requirements'
      ]
    };
  }

  generateContingencyPlans() {
    return [
      {
        risk: 'Bad weather (outdoor wedding)',
        contingency: 'Indoor backup venue or marquee tent',
        action_required: 'Book backup venue 3 months in advance'
      },
      {
        risk: 'Vendor cancellation',
        contingency: 'Have backup vendors on call list',
        action_required: 'Maintain list of 2-3 backup vendors per category'
      },
      {
        risk: 'Guest no-shows',
        contingency: 'Buffer of 5% extra food and seats',
        action_required: 'Confirm attendance 1 week before'
      },
      {
        risk: 'Medical emergency',
        contingency: 'First aid kit and emergency contacts',
        action_required: 'Have first aider on site and know nearest hospital'
      }
    ];
  }

  generateWeddingChecklist(requirements) {
    const baseChecklist = [
      { task: 'Finalize guest list', category: 'guests', priority: 'high' },
      { task: 'Book wedding venue', category: 'venue', priority: 'high' },
      { task: 'Choose wedding dress and groom attire', category: 'attire', priority: 'high' },
      { task: 'Book photographer and videographer', category: 'media', priority: 'high' },
      { task: 'Finalize catering menu', category: 'food', priority: 'high' },
      { task: 'Order wedding cake', category: 'food', priority: 'medium' },
      { task: 'Book music/DJ/entertainment', category: 'entertainment', priority: 'medium' },
      { task: 'Choose wedding rings', category: 'attire', priority: 'medium' },
      { task: 'Send out invitations', category: 'guests', priority: 'medium' },
      { task: 'Plan honeymoon', category: 'travel', priority: 'low' },
      { task: 'Write vows', category: 'ceremony', priority: 'low' },
      { task: 'Plan rehearsal dinner', category: 'food', priority: 'low' }
    ];
    
    // Add location-specific tasks
    if (requirements.location.toLowerCase().includes('kathmandu')) {
      baseChecklist.push(
        { task: 'Obtain marriage registration from ward office', category: 'legal', priority: 'high' },
        { task: 'Plan for potential traffic delays', category: 'logistics', priority: 'medium' }
      );
    }
    
    return baseChecklist.map((item, index) => ({
      id: `task_${index + 1}`,
      ...item,
      completed: false,
      assigned_to: '',
      deadline: this.calculateTaskDeadline(item.priority, requirements.wedding_date)
    }));
  }

  calculateTaskDeadline(priority, weddingDate) {
    const weddingDay = new Date(weddingDate);
    const deadlines = {
      high: 30, // 30 days before
      medium: 60, // 60 days before
      low: 90 // 90 days before
    };
    
    const deadlineDate = new Date(weddingDay);
    deadlineDate.setDate(deadlineDate.getDate() - deadlines[priority] || 30);
    
    return deadlineDate.toISOString().split('T')[0];
  }

  async stageFinalPreparations(input, results, context) {
    logger.agent(this.name, 'Stage 5: Final Preparations');
    
    try {
      // Generate final summary and recommendations
      const finalRecommendations = this.generateFinalRecommendations(results);
      const riskAssessment = this.assembleFinalRisks(results);
      
      // Create dashboard view for organizer
      const dashboardData = await this.generateWeddingDashboard(results);
      
      results.stages_completed.push('final_preparations');
      results.final_recommendations = finalRecommendations;
      results.risk_assessment = riskAssessment;
      results.dashboard_view = dashboardData;
      results.success_probability = this.calculateSuccessProbability(results);
      
      logger.agent(this.name, 'Final preparations completed');
    } catch (error) {
      results.errors.push({
        stage: 'final_preparations',
        error: error.message
      });
      throw error;
    }
  }

  generateFinalRecommendations(results) {
    const recommendations = [];
    
    // Budget recommendations
    if (results.budget_summary?.savings_percentage > 15) {
      recommendations.push({
        category: 'budget',
        priority: 'low',
        message: 'Excellent budget optimization achieved',
        action: 'Consider allocating savings to honeymoon or photography upgrade'
      });
    } else if (results.budget_summary?.savings_percentage < 5) {
      recommendations.push({
        category: 'budget',
        priority: 'high',
        message: 'Limited budget optimization',
        action: 'Review vendor quotes and negotiate further'
      });
    }
    
    // Vendor recommendations
    if (results.total_vendor_savings > 50000) {
      recommendations.push({
        category: 'vendors',
        priority: 'low',
        message: 'Great vendor negotiations completed',
        action: 'Use savings for additional amenities or guest favors'
      });
    }
    
    // Timeline recommendations
    const urgentTasks = results.checklist?.filter(task => 
      task.priority === 'high' && !task.completed
    ).length || 0;
    
    if (urgentTasks > 3) {
      recommendations.push({
        category: 'timeline',
        priority: 'high',
        message: `${urgentTasks} urgent tasks pending`,
        action: 'Focus on high priority tasks in the next week'
      });
    }
    
    return recommendations;
  }

  assembleFinalRisks(results) {
    const risks = [];
    
    // Budget risks
    const topExpense = results.budget_summary?.top_categories?.[0];
    if (topExpense && topExpense.percentage > 40) {
      risks.push({
        category: 'budget',
        severity: 'medium',
        description: `High concentration in ${topExpense.name} (${topExpense.percentage}% of budget)`,
        mitigation: 'Consider diversifying expenses or finding alternatives'
      });
    }
    
    // Vendor risks
    if (results.negotiated_vendors?.some(v => v.status !== 'confirmed')) {
      risks.push({
        category: 'vendors',
        severity: 'high',
        description: 'Some vendor contracts not yet confirmed',
        mitigation: 'Finalize vendor contracts within 48 hours'
      });
    }
    
    // Timeline risks
    const daysUntilWedding = this.calculateDaysUntil(results.wedding_details?.wedding_date);
    if (daysUntilWedding < 30) {
      risks.push({
        category: 'timeline',
        severity: 'high',
        description: `Only ${daysUntilWedding} days until wedding`,
        mitigation: 'Accelerate final preparations and confirmations'
      });
    }
    
    return risks;
  }

  calculateDaysUntil(weddingDate) {
    if (!weddingDate) return 0;
    
    const weddingDay = new Date(weddingDate);
    const today = new Date();
    const diffTime = weddingDay - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  async generateWeddingDashboard(results) {
    return {
      overview: {
        wedding_date: results.wedding_details?.wedding_date,
        guest_count: results.wedding_details?.guest_count,
        location: results.wedding_details?.location,
        theme: results.wedding_details?.theme,
        days_remaining: this.calculateDaysUntil(results.wedding_details?.wedding_date)
      },
      budget: {
        total: results.budget_summary?.total_budget,
        allocated: results.budget_summary?.allocated_amount,
        savings: results.budget_summary?.potential_savings,
        top_expenses: results.budget_summary?.top_categories || []
      },
      vendors: {
        total_negotiated: results.negotiated_vendors?.length || 0,
        total_savings: results.total_vendor_savings || 0,
        status_summary: results.negotiated_vendors?.reduce((acc, v) => {
          acc[v.status] = (acc[v.status] || 0) + 1;
          return acc;
        }, {}) || {}
      },
      progress: {
        stages_completed: results.stages_completed.length,
        total_stages: this.stages.length,
        completion_percentage: (results.stages_completed.length / this.stages.length) * 100,
        checklist_completion: results.checklist?.filter(t => t.completed).length || 0
      },
      next_actions: results.final_recommendations?.slice(0, 3) || []
    };
  }

  calculateSuccessProbability(results) {
    let probability = 80; // Base probability
    
    // Adjust based on budget
    if (results.budget_summary?.savings_percentage > 10) probability += 5;
    if (results.budget_summary?.savings_percentage < 0) probability -= 10;
    
    // Adjust based on vendor status
    const confirmedVendors = results.negotiated_vendors?.filter(v => v.status === 'confirmed').length || 0;
    const totalVendors = results.negotiated_vendors?.length || 1;
    const vendorConfirmationRate = (confirmedVendors / totalVendors) * 100;
    
    if (vendorConfirmationRate > 80) probability += 5;
    if (vendorConfirmationRate < 50) probability -= 15;
    
    // Adjust based on timeline
    const daysLeft = this.calculateDaysUntil(results.wedding_details?.wedding_date);
    if (daysLeft > 60) probability += 10;
    if (daysLeft < 30) probability -= 10;
    
    // Cap between 0 and 100
    return Math.max(0, Math.min(100, probability));
  }

  generateSummary(results) {
    return {
      workflow_completed: results.stages_completed.length === this.stages.length,
      total_stages: this.stages.length,
      completed_stages: results.stages_completed.length,
      total_budget: results.budget_summary?.total_budget || 0,
      estimated_savings: (results.budget_summary?.potential_savings || 0) + (results.total_vendor_savings || 0),
      vendor_negotiations: results.negotiated_vendors?.length || 0,
      checklist_items: results.checklist?.length || 0,
      success_probability: results.success_probability || 0,
      key_recommendations: results.final_recommendations?.filter(r => r.priority === 'high').length || 0,
      identified_risks: results.risk_assessment?.length || 0
    };
  }

  async getWorkflowStatus() {
    return {
      name: this.name,
      description: this.description,
      stages: this.stages,
      required_agents: this.requiredAgents,
      last_execution: this.lastExecution || 'never',
      average_execution_time: this.averageExecutionTime || 0,
      success_rate: this.successRate || 0
    };
  }
}

module.exports = WeddingWorkflow;