const { processNaturalLanguage } = require("./ner");
const { matchOrganizers } = require("./matcher");
const { logger } = require("../../../config/logger");

class EventRequestAIAgent {
  constructor() {
    this.name = "Event Request Assistant Agent";
    this.capabilities = [
      "natural_language_processing",
      "entity_extraction",
      "organizer_matching",
      "budget_analysis",
    ];
    this.status = "active";
  }

  /**
   * Process natural language event request
   */
  async processRequest(userRequest, userId) {
    try {
      console.log("DEBUG: Starting processRequest");
      console.log("DEBUG: userRequest:", userRequest);
      console.log("DEBUG: userId:", userId);

      // Validate input
      if (!userRequest || typeof userRequest !== "string") {
        throw new Error("Invalid user request text");
      }

      // Step 1: Extract entities from natural language
      console.log("DEBUG: Calling processNaturalLanguage...");
      const extractedEntities = await processNaturalLanguage(userRequest);
      console.log("DEBUG: extractedEntities:", extractedEntities);

      if (!extractedEntities) {
        console.error("DEBUG: extractedEntities is undefined or null");
        throw new Error("Failed to extract entities from request");
      }

      // Step 2: Match with potential organizers
      console.log("DEBUG: Calling matchOrganizers...");
      const matchedOrganizers = await matchOrganizers(extractedEntities);
      console.log(
        "DEBUG: Matched organizers count:",
        matchedOrganizers?.length || 0
      );

      // Step 3: Analyze budget feasibility
      const budgetAnalysis = this.analyzeBudget(
        extractedEntities.budget,
        extractedEntities.eventType
      );
      console.log("DEBUG: Process completed successfully");

      return {
        success: true,
        data: {
          extractedEntities,
          matchedOrganizers: matchedOrganizers.slice(0, 5), // Top 5 matches
          budgetAnalysis,
          aiSuggestions: {
            recommendedBudget: budgetAnalysis.recommendedBudget,
            locationSuggestions: extractedEntities.locations || [],
            timingSuggestions: this.suggestOptimalTiming(
              extractedEntities.date
            ),
          },
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("DEBUG: Event request processing failed:", error.message);
      console.error("DEBUG: Error stack:", error.stack);
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  /**
   * Find best organizers (for direct API calls)
   */
  async findBestOrganizers(entities, organizerList = []) {
    try {
      const matchedOrganizers = await matchOrganizers(entities);
      return matchedOrganizers;
    } catch (error) {
      logger.error(`Error finding best organizers: ${error.message}`);
      return [];
    }
  }

  // In index.js, update analyzeBudget method:
  // In ai-service/agents/user-agents/event-request-assistant/index.js

  // Replace the analyzeBudget method with this:

  analyzeBudget(userBudget, eventType, location = null, guests = null) {
  // Nepal location multipliers (based on real venue costs)
  const locationMultiplier = {
    'kathmandu': 1.3,      // Premium venues, high demand
    'lalitpur': 1.2,       // Close to Kathmandu
    'bhaktapur': 1.15,     // Traditional venues available
    'pokhara': 1.2,        // Tourist city, good venues
    'chitwan': 1.0,        // Standard pricing
    'butwal': 0.9,         // More affordable
    'biratnagar': 0.95,    // Industrial city
    'nepalgunj': 0.85,     // Lower cost
    'dharan': 0.9,         // Affordable
    'default': 1.0
  };

  // ============================================
  // EVENT-SPECIFIC COST MODELS (REALISTIC NPR)
  // ============================================

  const costModels = {
    // ===== CORPORATE EVENTS =====
    // Business meetings, seminars, product launches, networking
    'corporate': {
      description: "Business events focused on meetings, networking, and presentations",
      fixedCosts: {
        venue: 25000,        // Conference hall/meeting room rental
        avEquipment: 15000,  // Projector, microphone, speakers
        cateringSetup: 5000, // Tea/coffee setup, serving equipment
        registration: 3000,  // Check-in desk, badges, materials
        staff: 8000         // Event coordinators, technical support
      },
      variableCosts: {
        catering: 800,      // Per person - lunch/snacks (not full meal)
        beverages: 300,     // Per person - tea, coffee, water
        materials: 200,     // Per person - notebooks, pens, folders
        nameBadges: 100     // Per person
      },
      notIncluded: [
        "Wedding-style decoration",
        "Entertainment/performers",
        "Photography/videography",
        "Party favors"
      ],
      typicalGuestRange: "20-100 attendees"
    },

    // ===== WORKSHOPS =====
    // Training, skill development, hands-on sessions
    'workshop': {
      description: "Training sessions with hands-on learning",
      fixedCosts: {
        venue: 15000,        // Training hall/classroom
        trainerFee: 25000,   // Professional trainer (half-day)
        projector: 5000,     // AV equipment
        materials: 8000      // Training materials, handouts
      },
      variableCosts: {
        refreshments: 400,   // Per person - tea/snacks
        lunch: 600,         // Per person - if full-day
        kit: 500,           // Per person - training kit, notebook, pen
        certificate: 100    // Per person - printed certificates
      },
      notIncluded: [
        "Entertainment",
        "Heavy decoration",
        "Multiple speakers",
        "Live performances"
      ],
      typicalGuestRange: "15-40 participants"
    },

    // ===== CONFERENCES =====
    // Multi-speaker events, multiple sessions
    'conference': {
      description: "Large-scale events with multiple speakers and sessions",
      fixedCosts: {
        venue: 80000,        // Large hall/convention center
        avEquipment: 40000,  // Sound system, multiple screens
        speakers: 100000,    // Honorarium for multiple speakers
        marketing: 30000,    // Promotions, social media
        staff: 40000,        // Multiple coordinators, volunteers
        registration: 15000  // Check-in system, badges
      },
      variableCosts: {
        catering: 1200,      // Per person - lunch + 2 tea breaks
        materials: 800,      // Per person - conference kit, schedule
        bag: 500,           // Per person - conference bag
        badge: 150          // Per person - printed badge
      },
      notIncluded: [
        "Wedding decoration",
        "Birthday entertainment",
        "Personal photography"
      ],
      typicalGuestRange: "100-500 attendees"
    },

    // ===== WEDDINGS =====
    'wedding': {
      description: "Traditional Nepali wedding with ceremony and reception",
      fixedCosts: {
        venue: 100000,       // Wedding hall/banquet
        decoration: 60000,   // Mandap, flower decoration
        photography: 40000,  // Professional photographer/videographer
        music: 25000,       // DJ or live band
        coordination: 30000, // Wedding coordinator
        makeup: 15000,      // Bride's makeup/hair
        transportation: 20000 // Wedding car/transport
      },
      variableCosts: {
        catering: 2500,      // Per person - full wedding feast
        drinks: 500,        // Per person - soft drinks, sometimes alcohol
        favors: 300,        // Per person - wedding favors
        seating: 200,       // Per person - chair covers, additional seating
        staff: 200          // Per person - serving staff
      },
      notIncluded: [
        "AV equipment for presentations",
        "Marketing materials",
        "Trainer fees"
      ],
      typicalGuestRange: "100-300 guests"
    },

    // ===== BIRTHDAY PARTIES =====
    'birthday': {
      description: "Birthday celebration with friends and family",
      fixedCosts: {
        venue: 20000,        // Party hall/restaurant
        decoration: 15000,   // Balloons, banners, theme setup
        cake: 5000,         // Custom birthday cake
        photography: 8000,   // Basic photography
        entertainment: 10000 // Games, host, or DJ
      },
      variableCosts: {
        catering: 1200,      // Per person - party food
        drinks: 300,        // Per person - soft drinks/juice
        favors: 200,        // Per person - return gifts
        snacks: 400         // Per person - additional snacks
      },
      notIncluded: [
        "Professional AV equipment",
        "Multiple speakers",
        "Training materials"
      ],
      typicalGuestRange: "30-100 guests"
    },

    // ===== CONCERTS =====
    'concert': {
      description: "Live music performance",
      fixedCosts: {
        venue: 150000,       // Open ground/hall rental
        artists: 300000,     // Performer/band fees
        sound: 100000,       // Professional sound system
        lighting: 80000,     // Stage lighting
        security: 60000,     // Security personnel
        permits: 50000,      // Municipal/event permits
        marketing: 100000,   // Promotions, posters, social media
        stage: 120000       // Stage construction/setup
      },
      variableCosts: {
        staff: 2000,         // Per 50 attendees - security/staff
        cleaning: 1000,      // Per 100 attendees
        wristbands: 50       // Per attendee - entry wristbands
      },
      notIncluded: [
        "Per-plate catering",
        "Decoration (except stage)",
        "Training materials"
      ],
      typicalGuestRange: "500-3000 attendees"
    },

    // ===== PARTIES (General celebration) =====
    'party': {
      description: "General celebration, get-together",
      fixedCosts: {
        venue: 25000,        // Club/restaurant/party space
        decoration: 12000,   // Basic decoration
        music: 15000,        // DJ or sound system
        photography: 8000,   // Event photos
        drinksSetup: 5000    // Bar/counter setup
      },
      variableCosts: {
        food: 1000,          // Per person - finger food/snacks
        drinks: 600,         // Per person - beverages (may include alcohol)
        glasses: 100,        // Per person - disposable/rental
        staff: 200           // Per person - serving staff
      },
      notIncluded: [
        "Formal presentations",
        "Training materials",
        "Wedding-style catering"
      ],
      typicalGuestRange: "50-150 guests"
    },

    // ===== ANNIVERSARY =====
    'anniversary': {
      description: "Wedding/business anniversary celebration",
      fixedCosts: {
        venue: 35000,        // Celebration venue
        decoration: 20000,   // Special occasion decoration
        cake: 8000,         // Celebration cake
        photography: 15000,  // Family/event photos
        entertainment: 15000 // Music/entertainment
      },
      variableCosts: {
        catering: 1500,      // Per person - celebration meal
        drinks: 400,        // Per person - beverages
        favors: 250,        // Per person - anniversary favors
        seating: 150        // Per person - additional arrangements
      },
      notIncluded: [
        "Business equipment",
        "Training materials",
        "Conference speakers"
      ],
      typicalGuestRange: "50-150 guests"
    },

    // ===== FESTIVAL =====
    'festival': {
      description: "Cultural/community festival celebration",
      fixedCosts: {
        venue: 100000,       // Open ground/community space
        stage: 80000,        // Main stage setup
        sound: 50000,        // Sound system
        lighting: 40000,     // Event lighting
        permits: 40000,      // Government/city permits
        security: 50000,     // Security personnel
        marketing: 60000,    // Promotions
        cultural: 80000      // Cultural program arrangements
      },
      variableCosts: {
        foodStalls: 20000,   // Per food vendor setup
        staff: 1500,         // Per 50 attendees
        cleaning: 1000,      // Per 100 attendees
        wasteManagement: 5000 // Fixed per event
      },
      notIncluded: [
        "Individual catering",
        "Personal photography",
        "Training sessions"
      ],
      typicalGuestRange: "1000-5000 attendees"
    },

    // ===== DEFAULT (Fallback) =====
    'default': {
      description: "General event planning",
      fixedCosts: {
        venue: 30000,
        basicSetup: 15000,
        coordination: 20000
      },
      variableCosts: {
        perPerson: 1200
      },
      typicalGuestRange: "Varies by event type"
    }
  };

  // Get the appropriate cost model
  const model = costModels[eventType?.toLowerCase()] || costModels.default;
  const multiplier = locationMultiplier[location?.toLowerCase()] || locationMultiplier.default;

  // Determine realistic guest counts per event type
  const defaultGuests = {
    'corporate': 50,
    'workshop': 25,
    'conference': 200,
    'wedding': 200,
    'birthday': 50,
    'concert': 1000,
    'party': 80,
    'anniversary': 70,
    'festival': 2000,
    'default': 100
  };

  const guestCount = (guests !== null && guests !== undefined && guests > 0) 
    ? guests 
    : defaultGuests[eventType?.toLowerCase()] || 100;

  // Calculate fixed costs
  let totalFixed = 0;
  const fixedBreakdown = {};
  for (const [item, cost] of Object.entries(model.fixedCosts)) {
    const adjustedCost = Math.round(cost * multiplier);
    fixedBreakdown[item] = adjustedCost;
    totalFixed += adjustedCost;
  }

  // Calculate variable costs based on event type
  let totalVariable = 0;
  const variableBreakdown = {};
  
  for (const [item, perUnitCost] of Object.entries(model.variableCosts)) {
    let cost = 0;
    
    // Special handling for different variable cost types
    if (item === 'staff' && eventType?.toLowerCase() === 'concert') {
      // Staff needed per 50-100 attendees
      const staffCount = Math.ceil(guestCount / 50);
      cost = staffCount * perUnitCost;
    } else if (item === 'foodStalls') {
      // For festivals - one stall per 200-300 attendees
      const stallCount = Math.max(1, Math.ceil(guestCount / 250));
      cost = stallCount * perUnitCost;
    } else if (item === 'wasteManagement') {
      // Fixed cost regardless of attendance
      cost = perUnitCost;
    } else {
      // Standard per-person variable cost
      cost = perUnitCost * guestCount;
    }
    
    variableBreakdown[item] = Math.round(cost);
    totalVariable += cost;
  }

  // Calculate total estimate
  const estimatedTotal = Math.round((totalFixed + totalVariable) * multiplier);
  
  // Realistic range (±15% for most events, wider for concerts/festivals)
  const rangeFactor = ['concert', 'festival'].includes(eventType?.toLowerCase()) ? 0.25 : 0.15;
  const lowEstimate = Math.round(estimatedTotal * (1 - rangeFactor));
  const highEstimate = Math.round(estimatedTotal * (1 + rangeFactor));

  // Combine breakdowns (only show relevant categories)
  const breakdown = { ...fixedBreakdown, ...variableBreakdown };

  // Calculate per-person metrics (where relevant)
  const hasVariableCosts = Object.keys(model.variableCosts).length > 0;
  const perPersonAvg = hasVariableCosts 
    ? Math.round(totalVariable / guestCount) 
    : Math.round(estimatedTotal / guestCount);

  // Feasibility analysis with realistic messaging
  let feasibility = 'unknown';
  let recommendedBudget = estimatedTotal;
  let note = '';
  let budgetTips = [];

  if (userBudget) {
    const budgetRatio = userBudget / estimatedTotal;
    
    if (eventType?.toLowerCase() === 'concert') {
      // Concerts have different economics
      if (budgetRatio >= 0.8 && budgetRatio <= 1.2) {
        feasibility = 'achievable';
        recommendedBudget = userBudget;
        note = 'Budget is realistic for a concert of this size';
        budgetTips = [
          'Major costs: Artist fees (30-40%), Sound/Lighting (20-25%)',
          'Ticket sales can offset 60-80% of costs',
          'Consider sponsorships for additional funding'
        ];
      } else if (budgetRatio < 0.8) {
        feasibility = 'challenging';
        recommendedBudget = Math.round(estimatedTotal * 0.9);
        note = `Concerts require significant upfront investment. Consider smaller artist or venue.`;
        budgetTips = [
          'Local emerging artists cost 30-50% less',
          'Smaller venue reduces rental and staffing costs',
          'Limit marketing to social media only'
        ];
      } else {
        feasibility = 'comfortable';
        recommendedBudget = userBudget;
        note = 'Budget allows for quality production and marketing';
        budgetTips = [
          'Can book established artists',
          'Invest in professional sound/lighting',
          'Comprehensive marketing campaign possible'
        ];
      }
    } 
    else if (eventType?.toLowerCase() === 'corporate') {
      if (budgetRatio >= 0.9 && budgetRatio <= 1.1) {
        feasibility = 'on target';
        recommendedBudget = userBudget;
        note = 'Budget aligns with standard corporate event costs';
        budgetTips = [
          'Focus on professional AV and comfortable venue',
          'Quality catering reflects well on company',
          'Consider branded materials for attendees'
        ];
      } else if (budgetRatio < 0.9) {
        feasibility = 'tight';
        recommendedBudget = Math.round(estimatedTotal * 0.95);
        note = `Budget is lean. Consider half-day instead of full-day.`;
        budgetTips = [
          'Choose in-house venue instead of external',
          'Limit catering to tea/coffee and light snacks',
          'Use digital materials instead of printed'
        ];
      } else {
        feasibility = 'premium';
        recommendedBudget = userBudget;
        note = 'Budget allows for premium corporate experience';
        budgetTips = [
          'Can include guest speakers',
          'Professional photography/video for company records',
          'Higher-end venue and catering'
        ];
      }
    }
    else {
      // Generic feasibility for other events
      if (budgetRatio >= 0.9 && budgetRatio <= 1.1) {
        feasibility = 'good';
        recommendedBudget = userBudget;
        note = 'Your budget is realistic for this event';
      } else if (budgetRatio >= 0.7 && budgetRatio < 0.9) {
        feasibility = 'tight';
        recommendedBudget = Math.round(estimatedTotal * 0.95);
        note = `Budget is tight. Consider reducing guest count or simplifying.`;
      } else if (budgetRatio > 1.1 && budgetRatio <= 1.5) {
        feasibility = 'comfortable';
        recommendedBudget = userBudget;
        note = 'Comfortable budget - can include some premium options';
      } else if (budgetRatio < 0.7) {
        feasibility = 'very tight';
        recommendedBudget = Math.round(estimatedTotal * 0.9);
        note = `Budget may be insufficient. Consider scaling down.`;
      } else if (budgetRatio > 1.5) {
        feasibility = 'luxury';
        recommendedBudget = userBudget;
        note = 'Luxury budget - can include high-end options';
      }
    }
  } else {
    note = `Estimated cost for ${eventType || 'event'} in ${location || 'Nepal'} with ${guestCount} ${this.getGuestUnit(eventType)}`;
  }

  // Generate relevant cost insights
  const insights = this.generateEventInsights(eventType, guestCount, model, multiplier, location);

  return {
    success: true,
    eventType: eventType || 'general',
    location: location || 'Nepal',
    guestCount,
    userBudget: userBudget || 0,
    estimatedCost: {
      low: lowEstimate,
      medium: estimatedTotal,
      high: highEstimate
    },
    costBreakdown: {
      fixed: Math.round(totalFixed * multiplier),
      variable: Math.round(totalVariable * multiplier),
      perPerson: perPersonAvg,
      fixedPercentage: Math.round((totalFixed / (totalFixed + totalVariable)) * 100),
      variablePercentage: Math.round((totalVariable / (totalFixed + totalVariable)) * 100)
    },
    detailedBreakdown: breakdown,
    feasibility,
    recommendedBudget: Math.round(recommendedBudget),
    budgetRange: {
      min: lowEstimate,
      max: highEstimate
    },
    currency: 'NPR',
    note,
    tips: budgetTips.length ? budgetTips : this.getDefaultTips(eventType),
    insights,
    modelDescription: model.description,
    typicalScale: model.typicalGuestRange,
    notIncluded: model.notIncluded || []
  };
}

/**
 * Get appropriate unit for guests
 */
getGuestUnit(eventType) {
  const units = {
    'concert': 'attendees',
    'festival': 'visitors',
    'corporate': 'participants',
    'workshop': 'participants',
    'conference': 'attendees',
    'default': 'guests'
  };
  return units[eventType?.toLowerCase()] || units.default;
}

/**
 * Generate event-specific insights
 */
generateEventInsights(eventType, guestCount, model, multiplier, location) {
  const type = eventType?.toLowerCase() || 'default';
  
  const insights = {
    'corporate': [
      `👔 Corporate events focus on professional presentation, not decoration`,
      `🎤 AV quality is more important than catering for business events`,
      `📊 Budget breakdown: Venue 35%, AV 20%, Catering 25%, Other 20%`,
      `💡 ROI is measured in business outcomes, not guest satisfaction`
    ],
    
    'workshop': [
      `📚 Trainer quality matters more than venue luxury`,
      `✏️ Allocate 25-30% for quality training materials`,
      `☕ Frequent breaks with tea/coffee keep participants engaged`,
      `🎯 Small groups (15-25) are most effective for workshops`
    ],
    
    'conference': [
      `🎯 Speaker honorariums are 30-40% of budget for quality conferences`,
      `🖥️ Professional AV is essential - don't compromise here`,
      `📦 Conference kits should be useful, not fancy`,
      `🤝 Networking opportunities are the real value`
    ],
    
    'wedding': [
      `💒 Venue and decoration set the tone - 40-50% of budget`,
      `🍽️ Catering is the biggest variable cost at रू${Math.round(model.variableCosts.catering * multiplier)}/person`,
      `📸 Photography is your lasting memory - invest wisely`,
      `💐 Seasonal flowers can save 30% on decoration`
    ],
    
    'birthday': [
      `🎂 The cake is the centerpiece - budget रू5000-8000`,
      `🎈 Simple balloon decoration costs रू8000-15000`,
      `🍕 Consider buffet-style catering to control costs`,
      `📱 Digital invites save money and are eco-friendly`
    ],
    
    'concert': [
      `🎵 Artist fees: 40-50% of total budget`,
      `🔊 Professional sound: Non-negotiable for quality`,
      `🎫 Ticket pricing: Usually 2-3x per-person cost to profit`,
      `🛡️ Security is legally required for events >500 people`
    ],
    
    'party': [
      `🍸 Drinks often cost more than food for parties`,
      `🎵 Good music matters more than fancy decoration`,
      `📸 Photo booth/area creates memories for guests`,
      `⏰ Evening parties have higher venue costs`
    ],
    
    'festival': [
      `🎪 Multiple stages/areas increase costs exponentially`,
      `👥 Volunteers can reduce staffing costs by 40%`,
      `🏛️ Government permits: रू30000-50000 minimum`,
      `♻️ Waste management is a significant cost for large events`
    ]
  };

  return insights[type] || [
    `📊 Estimated costs based on ${guestCount} ${this.getGuestUnit(type)}`,
    `📍 Location factor: ${multiplier}x for ${location || 'standard area'}`,
    `💡 Book early for better venue rates`
  ];
}

/**
 * Get default tips based on event type
 */
getDefaultTips(eventType) {
  const tips = {
    'corporate': [
      'Book venues with in-house AV to save costs',
      'Digital materials reduce printing expenses',
      'Choose dates mid-week for better venue rates'
    ],
    'workshop': [
      'Limit group size to 25 for effective learning',
      'Provide digital handouts instead of printed',
      'Choose venues with natural light'
    ],
    'concert': [
      'Local emerging artists cost 50-70% less',
      'Partner with brands for sponsorships',
      'Early bird tickets help gauge attendance'
    ],
    'wedding': [
      'Weekday weddings cost 30-50% less',
      'Seasonal flowers reduce decoration costs',
      'Buffer 10-15% extra meals for unexpected guests'
    ],
    'default': [
      'Always get 3 quotes from vendors',
      'Read contracts carefully before signing',
      'Keep 10% buffer for unexpected costs'
    ]
  };
  
  return tips[eventType?.toLowerCase()] || tips.default;
}

  suggestOptimalTiming(requestedDate) {
    if (!requestedDate) return [];

    const date = new Date(requestedDate);
    const suggestions = [];

    if (date.getDay() !== 0 && date.getDay() !== 6) {
      const saturday = new Date(date);
      saturday.setDate(date.getDate() + (6 - date.getDay()));
      suggestions.push(saturday.toISOString().split("T")[0]);
    }

    return suggestions;
  }
}

module.exports = EventRequestAIAgent;
