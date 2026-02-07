const { logger } = require('../../../shared/utils/logger');

class EventRequestAssistant {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Load necessary configurations
            logger.info('Initializing Event Request Assistant...');
            this.initialized = true;
        } catch (error) {
            logger.error(`Failed to initialize Event Request Assistant: ${error.message}`);
            throw error;
        }
    }

    /**
     * Main entry point for AI-enhanced event request processing
     */
    async handleEventRequest(userId, naturalLanguageRequest, existingFormData = null) {
        try {
            await this.initialize();
            
            const { processNaturalLanguage } = require('./ner');
            const { matchOrganizers } = require('./matcher');
            
            logger.info(`Handling event request for user ${userId}`);
            
            // Process natural language
            const extractedEntities = await processNaturalLanguage(naturalLanguageRequest);
            
            // Merge with existing form data if provided
            const finalEntities = this.mergeEntities(extractedEntities, existingFormData);
            
            // Find matching organizers
            const matchedOrganizers = await matchOrganizers(finalEntities);
            
            // Generate AI suggestions
            const suggestions = this.generateSuggestions(finalEntities, matchedOrganizers);
            
            // Prepare response structure
            return {
                success: true,
                userId,
                requestId: this.generateRequestId(),
                extractedData: finalEntities,
                matchedOrganizers: matchedOrganizers.slice(0, 10), // Limit to top 10
                aiSuggestions: suggestions,
                processingTime: new Date().toISOString(),
                nextSteps: [
                    'Review AI-extracted details',
                    'Check matched organizers',
                    'Consider budget recommendations',
                    'Submit final request to selected organizers'
                ]
            };
            
        } catch (error) {
            logger.error(`Event request handling failed: ${error.message}`);
            return {
                success: false,
                error: error.message,
                suggestion: 'Please fill out the manual form instead'
            };
        }
    }

    mergeEntities(aiEntities, formData) {
        if (!formData) return aiEntities;
        
        return {
            eventType: formData.eventType || aiEntities.eventType,
            locations: formData.locations || aiEntities.locations,
            date: formData.date || aiEntities.date,
            budget: formData.budget || aiEntities.budget,
            guests: formData.guests || aiEntities.guests,
            theme: formData.theme || aiEntities.theme,
            requirements: formData.requirements || aiEntities.requirements,
            description: formData.description || aiEntities.description
        };
    }

    generateSuggestions(entities, organizers) {
        const suggestions = {
            budget: {},
            timing: {},
            location: {},
            organizerSelection: {}
        };

        // Budget suggestions
        if (entities.budget) {
            suggestions.budget = {
                current: entities.budget,
                industryAverage: this.getIndustryAverage(entities.eventType),
                recommendation: this.recommendBudget(entities.budget, entities.eventType),
                costSavingTips: this.getCostSavingTips(entities.eventType)
            };
        }

        // Timing suggestions
        if (entities.date) {
            suggestions.timing = {
                requestedDate: entities.date,
                optimalDates: this.getOptimalDates(entities.date),
                seasonConsiderations: this.getSeasonalConsiderations(entities.date)
            };
        }

        // Location suggestions
        if (entities.locations && entities.locations.length > 0) {
            suggestions.location = {
                requestedLocations: entities.locations,
                alternativeLocations: this.getAlternativeLocations(entities.locations[0]),
                venueRecommendations: this.getVenueRecommendations(entities.eventType, entities.locations[0])
            };
        }

        // Organizer selection tips
        if (organizers && organizers.length > 0) {
            const topOrganizer = organizers[0];
            suggestions.organizerSelection = {
                topMatch: {
                    name: topOrganizer.name,
                    matchPercentage: topOrganizer.matchPercentage,
                    strengths: this.identifyOrganizerStrengths(topOrganizer, entities)
                },
                selectionCriteria: [
                    'Match percentage above 80%',
                    'Experience with event type',
                    'Positive reviews',
                    'Good response time'
                ]
            };
        }

        return suggestions;
    }

    getIndustryAverage(eventType) {
        const averages = {
            'wedding': 15000,
            'birthday': 500,
            'corporate': 3000,
            'conference': 8000,
            'party': 800,
            'general': 2000
        };
        return averages[eventType?.toLowerCase()] || 2000;
    }

    recommendBudget(userBudget, eventType) {
        const average = this.getIndustryAverage(eventType);
        
        if (userBudget < average * 0.5) {
            return `Consider increasing budget to $${average} for better quality`;
        } else if (userBudget > average * 1.5) {
            return `Budget is generous. You could save by reducing to $${average}`;
        } else {
            return 'Budget is reasonable for this event type';
        }
    }

    getCostSavingTips(eventType) {
        const tips = {
            wedding: [
                'Consider off-season dates',
                'Opt for buffet instead of plated dinner',
                'Use local flowers instead of imported'
            ],
            corporate: [
                'Weekday rates are often lower',
                'Package deals with venues',
                'Early booking discounts'
            ],
            birthday: [
                'Home venues save rental costs',
                'DIY decorations',
                'Potluck-style catering'
            ]
        };
        return tips[eventType?.toLowerCase()] || [
            'Book 3-6 months in advance',
            'Compare multiple organizer quotes',
            'Consider package deals'
        ];
    }

    getOptimalDates(requestedDate) {
        const date = new Date(requestedDate);
        const suggestions = [];
        
        // Weekend options
        for (let i = -7; i <= 7; i += 7) {
            const altDate = new Date(date);
            altDate.setDate(date.getDate() + i);
            if (altDate.getDay() === 6 || altDate.getDay() === 0) { // Saturday or Sunday
                suggestions.push(altDate.toISOString().split('T')[0]);
            }
        }
        
        return suggestions.slice(0, 3);
    }

    getSeasonalConsiderations(date) {
        const month = new Date(date).getMonth();
        const seasons = {
            0: 'Winter: Indoor venues recommended',
            1: 'Winter: Indoor venues recommended',
            2: 'Spring: Great for outdoor events',
            3: 'Spring: Great for outdoor events',
            4: 'Spring: Great for outdoor events',
            5: 'Summer: Book AC venues',
            6: 'Summer: Book AC venues',
            7: 'Summer: Book AC venues',
            8: 'Fall: Pleasant weather',
            9: 'Fall: Pleasant weather',
            10: 'Fall: Pleasant weather',
            11: 'Winter: Indoor venues recommended'
        };
        return seasons[month] || 'Consider weather conditions for your event';
    }

    getAlternativeLocations(primaryLocation) {
        // Mock alternative locations - would be based on actual data
        const alternatives = {
            'New York': ['New Jersey', 'Connecticut', 'Long Island'],
            'Los Angeles': ['Orange County', 'San Diego', 'Santa Barbara'],
            'Chicago': ['Milwaukee', 'Indianapolis', 'St. Louis'],
            'San Francisco': ['San Jose', 'Oakland', 'Sacramento'],
            'Miami': ['Fort Lauderdale', 'West Palm Beach', 'Orlando']
        };
        return alternatives[primaryLocation] || ['Nearby cities', 'Suburban areas'];
    }

    getVenueRecommendations(eventType, location) {
        const venues = {
            wedding: [
                'Hotel ballrooms',
                'Garden venues',
                'Banquet halls'
            ],
            corporate: [
                'Conference centers',
                'Business hotels',
                'Co-working spaces'
            ],
            birthday: [
                'Restaurants',
                'Community halls',
                'Backyard venues'
            ]
        };
        return venues[eventType?.toLowerCase()] || ['Event halls', 'Hotels', 'Unique venues'];
    }

    identifyOrganizerStrengths(organizer, entities) {
        const strengths = [];
        
        if (organizer.matchPercentage >= 90) strengths.push('Excellent overall match');
        if (organizer.rating >= 4.5) strengths.push('Highly rated by past clients');
        if (organizer.responseTime === '1h' || organizer.responseTime === '2h') strengths.push('Quick responder');
        if (organizer.pastEvents > 100) strengths.push('Extensive experience');
        
        if (organizer.expertise && entities.eventType) {
            if (organizer.expertise.includes(entities.eventType)) {
                strengths.push(`Specialized in ${entities.eventType} events`);
            }
        }
        
        return strengths.length > 0 ? strengths : ['Reliable service', 'Good value'];
    }

    generateRequestId() {
        return `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = EventRequestAssistant;