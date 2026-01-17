const logger = require('../../config/logger');

class BirthdayWorkflow {
  constructor(orchestrator) {
    this.name = 'birthday-workflow';
    this.orchestrator = orchestrator;
    this.description = 'Birthday party planning workflow';
    this.requiredAgents = [
      'planning-agent',
      'budget-optimizer',
      'event-recommendation'
    ];
    this.stages = [
      'party_concept',
      'budget_planning',
      'vendor_booking',
      'entertainment_planning',
      'final_arrangements'
    ];
    this.partyThemes = [
      'traditional',
      'themed',
      'surprise',
      'destination',
      'virtual'
    ];
  }

  async execute(input, context = {}) {
    const startTime = Date.now();
    logger.agent(this.name, `Starting birthday planning workflow`);

    try {
      const results = {
        workflow: this.name,
        stages_completed: [],
        results: {},
        party_plan: {},
        budget_summary: {},
        entertainment_options: [],
        checklist: [],
        errors: []
      };

      // Stage 1: Party Concept
      await this.stagePartyConcept(input, results, context);
      
      // Stage 2: Budget Planning
      await this.stageBudgetPlanning(input, results, context);
      
      // Stage 3: Vendor Booking
      await this.stageVendorBooking(input, results, context);
      
      // Stage 4: Entertainment Planning
      await this.stageEntertainmentPlanning(input, results, context);
      
      // Stage 5: Final Arrangements
      await this.stageFinalArrangements(input, results, context);

      // Calculate execution time
      results.execution_time = Date.now() - startTime;
      results.completed_at = new Date().toISOString();
      
      // Generate summary
      results.summary = this.generateSummary(results);
      
      logger.success(`Birthday workflow completed in ${results.execution_time}ms`);
      
      return results;
    } catch (error) {
      logger.error(`Birthday workflow failed: ${error.message}`);
      return {
        success: false,
        workflow: this.name,
        error: error.message,
        execution_time: Date.now() - startTime
      };
    }
  }

  async stagePartyConcept(input, results, context) {
    logger.agent(this.name, 'Stage 1: Party Concept');
    
    try {
      // Extract birthday details
      const birthdayDetails = {
        celebrant_name: input.celebrant_name || 'Guest of Honor',
        age: input.age || 30,
        party_date: input.party_date || new Date().toISOString().split('T')[0],
        guest_count: input.guest_count || 50,
        location: input.location || 'Kathmandu',
        theme: this.determineTheme(input.theme, input.age)
      };
      
      // Generate party concept
      const partyConcept = {
        theme: birthdayDetails.theme,
        suggested_venue_types: this.suggestVenueTypes(birthdayDetails),
        decor_ideas: this.generateDecorIdeas(birthdayDetails.theme, birthdayDetails.age),
        color_scheme: this.suggestColorScheme(birthdayDetails.theme, birthdayDetails.age),
        invitee_list_suggestions: this.suggestInviteeCategories(birthdayDetails.age)
      };
      
      results.stages_completed.push('party_concept');
      results.birthday_details = birthdayDetails;
      results.party_concept = partyConcept;
      
      logger.agent(this.name, `Party concept created: ${birthdayDetails.theme} theme`);
    } catch (error) {
      results.errors.push({
        stage: 'party_concept',
        error: error.message
      });
      throw error;
    }
  }

  determineTheme(inputTheme, age) {
    if (inputTheme && this.partyThemes.includes(inputTheme)) {
      return inputTheme;
    }
    
    // Auto-suggest theme based on age
    if (age < 13) return 'themed'; // Kids love themes
    if (age < 21) return 'surprise'; // Teens/young adults
    if (age < 40) return 'destination'; // Adults
    if (age < 60) return 'traditional'; // Middle age
    return 'traditional'; // Seniors
  }

  suggestVenueTypes(birthdayDetails) {
    const venueTypes = [];
    
    if (birthdayDetails.guest_count <= 20) {
      venueTypes.push('Home party', 'Restaurant private room', 'Small hall');
    } else if (birthdayDetails.guest_count <= 50) {
      venueTypes.push('Banquet hall', 'Hotel conference room', 'Garden party venue');
    } else {
      venueTypes.push('Large banquet hall', 'Community center', 'Outdoor venue with tent');
    }
    
    // Add theme-specific venues
    switch (birthdayDetails.theme) {
      case 'themed':
        venueTypes.push('Theme park', 'Activity center', 'Movie theater');
        break;
      case 'destination':
        venueTypes.push('Resort', 'Beach venue', 'Mountain lodge');
        break;
    }
    
    return venueTypes;
  }

  generateDecorIdeas(theme, age) {
    const decorIdeas = [];
    
    switch (theme) {
      case 'themed':
        decorIdeas.push('Theme-specific decorations', 'Character cutouts', 'Themed table settings');
        break;
      case 'surprise':
        decorIdeas.push('Surprise banners', 'Balloon drop', 'Hidden decorations');
        break;
      case 'destination':
        decorIdeas.push('Travel-themed decor', 'Suitcase centerpieces', 'Passport invitations');
        break;
      default:
        decorIdeas.push('Elegant decorations', 'Flower arrangements', 'Personalized items');
    }
    
    // Age-specific additions
    if (age < 13) {
      decorIdeas.push('Fun games area', 'Candy buffet', 'Balloon animals');
    } else if (age === 21) {
      decorIdeas.push('"21" decorations', 'Champagne theme', 'Legal drinking age celebration');
    } else if (age >= 50) {
      decorIdeas.push('Elegant mature decor', 'Photo timeline', 'Milestone celebration');
    }
    
    return decorIdeas;
  }

  suggestColorScheme(theme, age) {
    const colorSchemes = {
      'traditional': ['Gold & White', 'Blue & Silver', 'Classic Black & White'],
      'themed': ['Bright Rainbow', 'Theme-specific colors', 'Vibrant multi-color'],
      'surprise': ['Bold Red & Yellow', 'Contrasting colors', 'Party mix'],
      'destination': ['Earth tones', 'Beach colors', 'Cultural theme colors']
    };
    
    const baseScheme = colorSchemes[theme] || colorSchemes.traditional;
    
    // Adjust for age
    if (age < 13) {
      return ['Bright Primary Colors', ...baseScheme];
    } else if (age < 30) {
      return ['Modern Pastels', ...baseScheme];
    } else {
      return ['Elegant Jewel Tones', ...baseScheme];
    }
  }

  suggestInviteeCategories(age) {
    const categories = ['Family', 'Close Friends', 'Colleagues'];
    
    if (age < 13) {
      categories.push('School Friends', 'Neighborhood Kids', 'Parents of Friends');
    } else if (age < 21) {
      categories.push('College Friends', 'Sports Team', 'Club Members');
    } else if (age < 40) {
      categories.push('Work Colleagues', 'Professional Contacts', 'Alumni');
    } else {
      categories.push('Long-time Friends', 'Community Members', 'Family from out of town');
    }
    
    return categories;
  }

  async stageBudgetPlanning(input, results, context) {
    logger.agent(this.name, 'Stage 2: Budget Planning');
    
    try {
      const budgetData = {
        total_budget: input.budget || 100000,
        guest_count: input.guest_count || 50,
        location: input.location || 'Kathmandu',
        party_date: input.party_date || new Date().toISOString().split('T')[0],
        theme: results.birthday_details?.theme || 'traditional'
      };
      
      // Get budget optimizer from planning agent
      const planningAgent = this.orchestrator.agents.get('planning-agent');
      if (!planningAgent) {
        throw new Error('Planning agent not available');
      }
      
      const budgetOptimizer = planningAgent.instance.budgetOptimizer;
      const optimizedBudget = await budgetOptimizer.optimizeBudget(
        budgetData.total_budget,
        'birthday',
        budgetData.guest_count,
        budgetData.location
      );
      
      // Adjust budget for theme
      const themeAdjustment = this.calculateThemeAdjustment(budgetData.theme);
      const themeAdjustedBudget = {
        ...optimizedBudget,
        summary: {
          ...optimizedBudget.summary,
          optimized_amount: optimizedBudget.summary.optimized_amount * themeAdjustment
        }
      };
      
      results.stages_completed.push('budget_planning');
      results.budget_summary = themeAdjustedBudget.summary;
      results.detailed_budget = themeAdjustedBudget.breakdown;
      results.budget_recommendations = themeAdjustedBudget.recommendations;
      
      logger.agent(this.name, `Budget planning completed: ${optimizedBudget.summary.potential_savings} potential savings`);
    } catch (error) {
      results.errors.push({
        stage: 'budget_planning',
        error: error.message
      });
      throw error;
    }
  }

  calculateThemeAdjustment(theme) {
    // Different themes have different cost multipliers
    const adjustments = {
      'traditional': 1.0,
      'themed': 1.3, // 30% more expensive
      'surprise': 1.1, // 10% more expensive
      'destination': 1.5, // 50% more expensive
      'virtual': 0.5 // 50% less expensive
    };
    
    return adjustments[theme] || 1.0;
  }

  async stageVendorBooking(input, results, context) {
    logger.agent(this.name, 'Stage 3: Vendor Booking');
    
    try {
      const vendorRequirements = {
        location: input.location || 'Kathmandu',
        budget: results.budget_summary?.optimized_amount || input.budget || 100000,
        guest_count: input.guest_count || 50,
        party_date: input.party_date || new Date().toISOString().split('T')[0],
        theme: results.birthday_details?.theme || 'traditional'
      };
      
      // Get vendor recommendations from planning agent
      const planningAgent = this.orchestrator.agents.get('planning-agent');
      if (!planningAgent) {
        throw new Error('Planning agent not available');
      }
      
      const vendorRecommendations = await planningAgent.instance.recommendVendors(
        'birthday',
        vendorRequirements.location,
        vendorRequirements.budget
      );
      
      // Filter vendors based on theme
      const filteredVendors = this.filterVendorsByTheme(vendorRecommendations, vendorRequirements.theme);
      
      // Generate vendor package options
      const vendorPackages = this.generateVendorPackages(filteredVendors, vendorRequirements);
      
      results.stages_completed.push('vendor_booking');
      results.vendor_recommendations = filteredVendors;
      results.vendor_packages = vendorPackages;
      results.recommended_package = this.recommendBestPackage(vendorPackages, vendorRequirements);
      
      logger.agent(this.name, `Vendor booking options generated: ${vendorPackages.length} packages`);
    } catch (error) {
      results.errors.push({
        stage: 'vendor_booking',
        error: error.message
      });
      throw error;
    }
  }

  filterVendorsByTheme(vendors, theme) {
    const filtered = {};
    
    Object.entries(vendors).forEach(([category, vendorList]) => {
      // Simple theme-based filtering
      const themeKeywords = {
        'themed': ['theme', 'character', 'costume'],
        'destination': ['travel', 'resort', 'destination'],
        'surprise': ['surprise', 'secret', 'hidden']
      };
      
      const keywords = themeKeywords[theme] || [];
      
      if (keywords.length === 0) {
        filtered[category] = vendorList;
      } else {
        filtered[category] = vendorList.filter(vendor => {
          const vendorText = JSON.stringify(vendor).toLowerCase();
          return keywords.some(keyword => vendorText.includes(keyword));
        }).slice(0, 3); // Limit to 3 per category
      }
    });
    
    return filtered;
  }

  generateVendorPackages(vendors, requirements) {
    const packages = [];
    
    // Budget package (economical)
    packages.push({
      name: 'Budget Package',
      description: 'Essential services at affordable prices',
      vendors: {
        venue: vendors.venue?.[0] || { name: 'Basic Venue' },
        catering: vendors.catering?.[0] || { name: 'Basic Catering' },
        decorations: vendors.decorations?.[0] || { name: 'Simple Decor' }
      },
      estimated_cost: requirements.budget * 0.6, // 60% of budget
      features: ['Essential services', 'Basic decorations', 'Standard catering'],
      best_for: 'Small gatherings, budget-conscious'
    });
    
    // Standard package
    packages.push({
      name: 'Standard Package',
      description: 'Balanced package with good value',
      vendors: {
        venue: vendors.venue?.[1] || vendors.venue?.[0] || { name: 'Standard Venue' },
        catering: vendors.catering?.[1] || vendors.catering?.[0] || { name: 'Standard Catering' },
        decorations: vendors.decorations?.[1] || vendors.decorations?.[0] || { name: 'Standard Decor' },
        entertainment: vendors.entertainment?.[0] || { name: 'Basic Entertainment' }
      },
      estimated_cost: requirements.budget * 0.8, // 80% of budget
      features: ['Good venue', 'Quality catering', 'Basic entertainment', 'Themed decorations'],
      best_for: 'Most birthday parties, good value'
    });
    
    // Premium package
    packages.push({
      name: 'Premium Package',
      description: 'Full-service luxury package',
      vendors: {
        venue: vendors.venue?.[2] || vendors.venue?.[1] || vendors.venue?.[0] || { name: 'Premium Venue' },
        catering: vendors.catering?.[2] || vendors.catering?.[1] || vendors.catering?.[0] || { name: 'Premium Catering' },
        decorations: vendors.decorations?.[2] || vendors.decorations?.[1] || vendors.decorations?.[0] || { name: 'Premium Decor' },
        entertainment: vendors.entertainment?.[1] || vendors.entertainment?.[0] || { name: 'Premium Entertainment' },
        photography: vendors.photography?.[0] || { name: 'Professional Photographer' }
      },
      estimated_cost: requirements.budget * 1.1, // 110% of budget
      features: ['Luxury venue', 'Gourmet catering', 'Professional entertainment', 'Full photography', 'Custom decorations'],
      best_for: 'Milestone birthdays, luxury celebrations'
    });
    
    return packages;
  }

  recommendBestPackage(packages, requirements) {
    const budget = requirements.budget;
    
    // Find package closest to budget
    let bestPackage = packages[0];
    let smallestDiff = Math.abs(packages[0].estimated_cost - budget);
    
    for (const pkg of packages.slice(1)) {
      const diff = Math.abs(pkg.estimated_cost - budget);
      if (diff < smallestDiff) {
        smallestDiff = diff;
        bestPackage = pkg;
      }
    }
    
    // Adjust recommendation based on theme
    if (requirements.theme === 'destination' || requirements.theme === 'themed') {
      // Prefer premium for special themes
      bestPackage = packages.find(p => p.name === 'Premium Package') || bestPackage;
    }
    
    return {
      package: bestPackage.name,
      estimated_cost: bestPackage.estimated_cost,
      budget_match: ((budget - bestPackage.estimated_cost) / budget) * 100,
      justification: bestPackage.description
    };
  }

  async stageEntertainmentPlanning(input, results, context) {
    logger.agent(this.name, 'Stage 4: Entertainment Planning');
    
    try {
      const entertainmentRequirements = {
        age: input.age || 30,
        guest_count: input.guest_count || 50,
        theme: results.birthday_details?.theme || 'traditional',
        location: input.location || 'Kathmandu',
        budget_allocation: results.budget_summary?.optimized_amount * 0.15 || 15000 // 15% of budget
      };
      
      // Generate entertainment options
      const entertainmentOptions = this.generateEntertainmentOptions(entertainmentRequirements);
      
      // Get event recommendations for similar parties
      const eventRecommendations = await this.getSimilarEventRecommendations(entertainmentRequirements);
      
      // Create entertainment schedule
      const entertainmentSchedule = this.createEntertainmentSchedule(entertainmentRequirements, entertainmentOptions);
      
      results.stages_completed.push('entertainment_planning');
      results.entertainment_options = entertainmentOptions;
      results.event_recommendations = eventRecommendations;
      results.entertainment_schedule = entertainmentSchedule;
      results.interactive_elements = this.suggestInteractiveElements(entertainmentRequirements);
      
      logger.agent(this.name, 'Entertainment planning completed');
    } catch (error) {
      results.errors.push({
        stage: 'entertainment_planning',
        error: error.message
      });
      throw error;
    }
  }

  generateEntertainmentOptions(requirements) {
    const options = [];
    
    // Age-based entertainment
    if (requirements.age < 13) {
      options.push(
        { type: 'magician', cost_range: '5000-10000', duration: '1 hour' },
        { type: 'clown', cost_range: '3000-8000', duration: '2 hours' },
        { type: 'face_painting', cost_range: '2000-5000', duration: '2 hours' },
        { type: 'bouncy_castle', cost_range: '8000-15000', duration: 'full day' }
      );
    } else if (requirements.age < 21) {
      options.push(
        { type: 'DJ', cost_range: '10000-20000', duration: '3 hours' },
        { type: 'karaoke', cost_range: '5000-10000', duration: '2 hours' },
        { type: 'video_games', cost_range: '8000-15000', duration: '3 hours' },
        { type: 'photo_booth', cost_range: '5000-10000', duration: '3 hours' }
      );
    } else {
      options.push(
        { type: 'live_band', cost_range: '20000-50000', duration: '2 hours' },
        { type: 'standup_comedy', cost_range: '15000-30000', duration: '1 hour' },
        { type: 'wine_tasting', cost_range: '10000-25000', duration: '2 hours' },
        { type: 'casino_night', cost_range: '15000-30000', duration: '3 hours' }
      );
    }
    
    // Theme-based additions
    if (requirements.theme === 'destination') {
      options.push(
        { type: 'virtual_reality_travel', cost_range: '15000-25000', duration: '2 hours' },
        { type: 'cultural_performance', cost_range: '10000-20000', duration: '1 hour' }
      );
    } else if (requirements.theme === 'themed') {
      options.push(
        { type: 'character_actors', cost_range: '8000-15000', duration: '2 hours' },
        { type: 'theme_activities', cost_range: '5000-12000', duration: '2 hours' }
      );
    }
    
    // Filter by budget
    const budget = requirements.budget_allocation;
    const affordableOptions = options.filter(option => {
      const minCost = parseInt(option.cost_range.split('-')[0]);
      return minCost <= budget * 1.2; // Allow 20% over budget
    });
    
    return affordableOptions.slice(0, 5); // Return top 5 options
  }

  async getSimilarEventRecommendations(requirements) {
    try {
      // Get event recommendation agent
      const recommendationAgent = this.orchestrator.agents.get('event-recommendation');
      if (!recommendationAgent) {
        return [];
      }
      
      // Mock user ID for recommendation
      const mockUserId = 'birthday_planner';
      
      // Get recommendations
      const recommendations = await recommendationAgent.instance.getRecommendations(mockUserId, 3);
      
      // Filter for birthday-related events
      const birthdayEvents = recommendations.filter(event => 
        event.event_name.toLowerCase().includes('birthday') || 
        event.tags?.some(tag => tag.toLowerCase().includes('party'))
      );
      
      return birthdayEvents.slice(0, 3);
    } catch (error) {
      logger.error(`Failed to get event recommendations: ${error.message}`);
      return [];
    }
  }

  createEntertainmentSchedule(requirements, options) {
    const schedule = [];
    let currentTime = '14:00'; // Party start time
    
    // Welcome activities
    schedule.push({
      time: currentTime,
      activity: 'Guests Arrival & Welcome Drinks',
      duration: '30 minutes',
      responsible: 'Host/Coordinator'
    });
    
    // Main entertainment (pick 2-3 options)
    const selectedOptions = options.slice(0, 3);
    
    selectedOptions.forEach((option, index) => {
      currentTime = this.addTime(currentTime, index === 0 ? '30' : '0'); // Add 30 minutes after arrival
      
      schedule.push({
        time: currentTime,
        activity: option.type.replace('_', ' ').toUpperCase(),
        duration: option.duration,
        responsible: 'Entertainment Provider',
        cost_estimate: option.cost_range,
        notes: `Budget allocated: ${requirements.budget_allocation}`
      });
      
      currentTime = this.addTime(currentTime, option.duration.split(' ')[0]);
    });
    
    // Cake cutting
    schedule.push({
      time: this.addTime(currentTime, '30'),
      activity: 'Cake Cutting Ceremony',
      duration: '20 minutes',
      responsible: 'Celebrant & Host'
    });
    
    // Free time/socializing
    schedule.push({
      time: this.addTime(currentTime, '50'),
      activity: 'Free Time & Socializing',
      duration: '1 hour',
      responsible: 'Guests',
      notes: 'Background music, photo opportunities'
    });
    
    return schedule;
  }

  addTime(currentTime, minutesToAdd) {
    const [hours, minutes] = currentTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + parseInt(minutesToAdd);
    
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMinutes = totalMinutes % 60;
    
    return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
  }

  suggestInteractiveElements(requirements) {
    const elements = [];
    
    // Age-based interactive elements
    if (requirements.age < 13) {
      elements.push(
        { element: 'Treasure Hunt', setup: '30 minutes', materials: 'Clues, small prizes' },
        { element: 'Craft Station', setup: '20 minutes', materials: 'Art supplies, aprons' },
        { element: 'Balloon Animals', setup: '15 minutes', materials: 'Balloons, pump' }
      );
    } else if (requirements.age < 21) {
      elements.push(
        { element: 'Photo Booth with Props', setup: '20 minutes', materials: 'Backdrop, props, camera' },
        { element: 'Dance Competition', setup: '15 minutes', materials: 'Music system, prizes' },
        { element: 'Memory Wall', setup: '25 minutes', materials: 'Board, photos, markers' }
      );
    } else {
      elements.push(
        { element: 'Wishing Tree', setup: '15 minutes', materials: 'Tree branch, cards, pens' },
        { element: 'Advice Jar', setup: '10 minutes', materials: 'Jar, paper slips' },
        { element: 'Timeline Display', setup: '30 minutes', materials: 'Photos, timeline board' }
      );
    }
    
    return elements.slice(0, 3);
  }

  async stageFinalArrangements(input, results, context) {
    logger.agent(this.name, 'Stage 5: Final Arrangements');
    
    try {
      // Generate comprehensive checklist
      const comprehensiveChecklist = this.generateComprehensiveChecklist(results);
      
      // Create timeline with deadlines
      const timelineWithDeadlines = this.createTimelineWithDeadlines(results);
      
      // Generate shopping list
      const shoppingList = this.generateShoppingList(results);
      
      // Create emergency contacts list
      const emergencyContacts = this.generateEmergencyContacts(results);
      
      results.stages_completed.push('final_arrangements');
      results.comprehensive_checklist = comprehensiveChecklist;
      results.timeline_with_deadlines = timelineWithDeadlines;
      results.shopping_list = shoppingList;
      results.emergency_contacts = emergencyContacts;
      results.final_recommendations = this.generateFinalBirthdayRecommendations(results);
      
      logger.agent(this.name, 'Final arrangements completed');
    } catch (error) {
      results.errors.push({
        stage: 'final_arrangements',
        error: error.message
      });
      throw error;
    }
  }

  generateComprehensiveChecklist(results) {
    const checklist = [];
    
    // One month before
    checklist.push({
      timeframe: 'One month before',
      tasks: [
        'Finalize guest list',
        'Send out invitations',
        'Book all major vendors',
        'Plan menu with caterer',
        'Order birthday cake'
      ]
    });
    
    // Two weeks before
    checklist.push({
      timeframe: 'Two weeks before',
      tasks: [
        'Confirm RSVPs',
        'Purchase decorations',
        'Plan seating arrangement',
        'Create playlist',
        'Buy party favors'
      ]
    });
    
    // One week before
    checklist.push({
      timeframe: 'One week before',
      tasks: [
        'Confirm vendor arrangements',
        'Purchase groceries/drinks',
        'Prepare games/activities',
        'Charge cameras/batteries',
        'Clean party venue'
      ]
    });
    
    // Day before
    checklist.push({
      timeframe: 'Day before',
      tasks: [
        'Set up decorations',
        'Prepare food that can be made ahead',
        'Charge all electronics',
        'Prepare welcome area',
        'Get cash for tips/emergencies'
      ]
    });
    
    // Party day
    checklist.push({
      timeframe: 'Party day',
      tasks: [
        'Pick up cake',
        'Set up food/drink stations',
        'Test entertainment equipment',
        'Welcome early helpers',
        'Enjoy the party!'
      ]
    });
    
    return checklist;
  }

  createTimelineWithDeadlines(results) {
    const partyDate = new Date(results.birthday_details?.party_date || new Date());
    const timeline = [];
    
    const deadlines = [
      { days: 30, task: 'Send invitations', priority: 'high' },
      { days: 21, task: 'Book entertainment', priority: 'high' },
      { days: 14, task: 'Finalize menu', priority: 'medium' },
      { days: 7, task: 'Purchase decorations', priority: 'medium' },
      { days: 3, task: 'Confirm RSVPs', priority: 'low' },
      { days: 1, task: 'Setup decorations', priority: 'high' }
    ];
    
    deadlines.forEach(deadline => {
      const deadlineDate = new Date(partyDate);
      deadlineDate.setDate(deadlineDate.getDate() - deadline.days);
      
      timeline.push({
        deadline: deadlineDate.toISOString().split('T')[0],
        days_before_party: deadline.days,
        task: deadline.task,
        priority: deadline.priority,
        status: deadlineDate < new Date() ? 'overdue' : 'pending'
      });
    });
    
    return timeline;
  }

  generateShoppingList(results) {
    const shoppingList = [];
    const guestCount = results.birthday_details?.guest_count || 50;
    
    // Decorations
    shoppingList.push({
      category: 'Decorations',
      items: [
        { item: 'Balloons', quantity: guestCount * 2, estimated_cost: 2000 },
        { item: 'Streamers', quantity: 5, estimated_cost: 500 },
        { item: 'Banners', quantity: 2, estimated_cost: 1000 },
        { item: 'Table centerpieces', quantity: Math.ceil(guestCount / 10), estimated_cost: 3000 }
      ]
    });
    
    // Party supplies
    shoppingList.push({
      category: 'Party Supplies',
      items: [
        { item: 'Paper plates', quantity: guestCount * 3, estimated_cost: 1000 },
        { item: 'Cups', quantity: guestCount * 3, estimated_cost: 800 },
        { item: 'Napkins', quantity: guestCount * 3, estimated_cost: 600 },
        { item: 'Utensils', quantity: guestCount * 3, estimated_cost: 1200 }
      ]
    });
    
    // Food & Drink (basic)
    shoppingList.push({
      category: 'Food & Drink',
      items: [
        { item: 'Soft drinks', quantity: guestCount * 2, estimated_cost: 3000 },
        { item: 'Snacks', quantity: guestCount * 5, estimated_cost: 5000 },
        { item: 'Birthday cake', quantity: 1, estimated_cost: 5000 }
      ]
    });
    
    return shoppingList;
  }

  generateEmergencyContacts(results) {
    const location = results.birthday_details?.location || 'Kathmandu';
    
    const contacts = [
      { type: 'Medical Emergency', contact: 'Local Hospital', number: '102' },
      { type: 'Police', contact: 'Local Police Station', number: '100' },
      { type: 'Fire Department', contact: 'Fire Department', number: '101' }
    ];
    
    // Add vendor contacts if available
    if (results.recommended_package?.package) {
      contacts.push(
        { type: 'Venue Coordinator', contact: 'Venue Manager', number: '9841XXXXXX' },
        { type: 'Caterer', contact: 'Catering Manager', number: '9841XXXXXX' }
      );
    }
    
    // Add theme-specific contacts
    if (results.birthday_details?.theme === 'destination') {
      contacts.push(
        { type: 'Travel Coordinator', contact: 'Travel Agency', number: '01-XXXXXXX' }
      );
    }
    
    return contacts;
  }

  generateFinalBirthdayRecommendations(results) {
    const recommendations = [];
    
    // Budget recommendations
    const budgetVariance = results.recommended_package?.budget_match || 0;
    if (Math.abs(budgetVariance) > 20) {
      recommendations.push({
        category: 'budget',
        priority: 'high',
        message: `Package costs ${Math.abs(budgetVariance).toFixed(1)}% ${budgetVariance > 0 ? 'under' : 'over'} budget`,
        action: budgetVariance > 0 ? 'Consider upgrading entertainment' : 'Look for cost-saving alternatives'
      });
    }
    
    // Timeline recommendations
    const overdueTasks = results.timeline_with_deadlines?.filter(t => t.status === 'overdue').length || 0;
    if (overdueTasks > 0) {
      recommendations.push({
        category: 'timeline',
        priority: 'high',
        message: `${overdueTasks} tasks are overdue`,
        action: 'Complete overdue tasks immediately'
      });
    }
    
    // Guest count recommendations
    const guestCount = results.birthday_details?.guest_count || 0;
    if (guestCount > 100) {
      recommendations.push({
        category: 'logistics',
        priority: 'medium',
        message: 'Large guest count requires additional planning',
        action: 'Consider hiring extra help and planning parking logistics'
      });
    }
    
    return recommendations;
  }

  generateSummary(results) {
    return {
      workflow_completed: results.stages_completed.length === this.stages.length,
      total_stages: this.stages.length,
      completed_stages: results.stages_completed.length,
      theme: results.birthday_details?.theme || 'unknown',
      guest_count: results.birthday_details?.guest_count || 0,
      total_budget: results.budget_summary?.total_budget || 0,
      recommended_package: results.recommended_package?.package || 'none',
      entertainment_options: results.entertainment_options?.length || 0,
      checklist_items: results.comprehensive_checklist?.reduce((sum, section) => sum + section.tasks.length, 0) || 0,
      shopping_items: results.shopping_list?.reduce((sum, category) => sum + category.items.length, 0) || 0
    };
  }

  async getWorkflowStatus() {
    return {
      name: this.name,
      description: this.description,
      stages: this.stages,
      required_agents: this.requiredAgents,
      available_themes: this.partyThemes,
      last_execution: this.lastExecution || 'never',
      average_execution_time: this.averageExecutionTime || 0,
      success_rate: this.successRate || 0
    };
  }
}

module.exports = BirthdayWorkflow;