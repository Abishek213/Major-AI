const { processNaturalLanguage } = require('./ner');
const { matchOrganizers } = require('./matcher');
const { logger } = require('../../../shared/utils/logger');

class EventRequestAIAgent {
    constructor() {
        this.name = "Event Request Assistant Agent";
        this.capabilities = [
            'natural_language_processing',
            'entity_extraction',
            'organizer_matching',
            'budget_analysis'
        ];
        this.status = 'active';
    }

    /**
     * Process natural language event request
     */
    async processRequest(userRequest, userId) {
        try {

            console.log('DEBUG: Starting processRequest');
            console.log('DEBUG: userRequest:', userRequest);
            console.log('DEBUG: userId:', userId);

            // Validate input
            if (!userRequest || typeof userRequest !== 'string') {
                throw new Error('Invalid user request text');
            }


            // Step 1: Extract entities from natural language
            console.log('DEBUG: Calling processNaturalLanguage...');
            const extractedEntities = await processNaturalLanguage(userRequest);
            console.log('DEBUG: extractedEntities:', extractedEntities);

            if (!extractedEntities) {
                console.error('DEBUG: extractedEntities is undefined or null');
                throw new Error('Failed to extract entities from request');
            }


            // Step 2: Match with potential organizers
            console.log('DEBUG: Calling matchOrganizers...');
            const matchedOrganizers = await matchOrganizers(extractedEntities);
            console.log('DEBUG: Matched organizers count:', matchedOrganizers?.length || 0);


            // Step 3: Analyze budget feasibility
            const budgetAnalysis = this.analyzeBudget(
                extractedEntities.budget,
                extractedEntities.eventType
            );
            console.log('DEBUG: Process completed successfully');


            return {
                success: true,
                data: {
                    extractedEntities,
                    matchedOrganizers: matchedOrganizers.slice(0, 5), // Top 5 matches
                    budgetAnalysis,
                    aiSuggestions: {
                        recommendedBudget: budgetAnalysis.recommendedBudget,
                        locationSuggestions: extractedEntities.locations || [],
                        timingSuggestions: this.suggestOptimalTiming(extractedEntities.date)
                    }
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('DEBUG: Event request processing failed:', error.message);
            console.error('DEBUG: Error stack:', error.stack); 
            return {
                success: false,
                error: error.message,
                data: null
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

    analyzeBudget(userBudget, eventType) {
  const eventTypeCosts = {
    'wedding': { 
      min: 300000,    // Lower minimum for Nepal
      avg: 800000,    // Realistic average for Nepal
      max: 3000000 
    },
    'birthday': { min: 10000, avg: 30000, max: 150000 },
    'corporate': { min: 50000, avg: 200000, max: 1000000 },
    'conference': { min: 15000, avg: 50000, max: 200000 },
    'party': { min: 15000, avg: 40000, max: 200000 }
  };

  const costs = eventTypeCosts[eventType?.toLowerCase()] || { 
    min: 50000, avg: 200000, max: 1000000 
  };

  let feasibility = 'high';
  let recommendedBudget = userBudget || costs.avg;
  
  // More realistic feasibility calculation
  if (userBudget) {
    const percentageOfAvg = (userBudget / costs.avg) * 100;
    
    if (percentageOfAvg < 50) {
      feasibility = 'low';
      recommendedBudget = costs.avg;
    } else if (percentageOfAvg < 80) {
      feasibility = 'medium';
      recommendedBudget = Math.round(costs.avg * 0.9); // Suggest 90% of average
    } else if (percentageOfAvg < 120) {
      feasibility = 'high';
      recommendedBudget = userBudget; // Keep user's budget
    } else {
      feasibility = 'excellent';
      recommendedBudget = userBudget;
    }
  }

  return {
    userBudget: userBudget || 0,
    industryAverage: costs.avg,
    feasibility,
    recommendedBudget,
    budgetRange: {
      min: costs.min,
      max: costs.max
    },
    note: userBudget ? 
      `Your budget is ${((userBudget/costs.avg)*100).toFixed(0)}% of average` :
      'No budget specified'
  };
}

    suggestOptimalTiming(requestedDate) {
        if (!requestedDate) return [];

        const date = new Date(requestedDate);
        const suggestions = [];

        if (date.getDay() !== 0 && date.getDay() !== 6) {
            const saturday = new Date(date);
            saturday.setDate(date.getDate() + (6 - date.getDay()));
            suggestions.push(saturday.toISOString().split('T')[0]);
        }

        return suggestions;
    }
}

module.exports = EventRequestAIAgent;