const { logger } = require('../../../shared/utils/logger');

class OrganizerMatcher {
    constructor() {
        this.organizerCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Match organizers based on event requirements
     */
    async matchOrganizers(entities) {
        try {
            // Get organizers from database (this would be replaced with actual DB call)
            const organizers = await this.fetchOrganizers();
            
            if (!organizers || organizers.length === 0) {
                return [];
            }

            // Calculate match scores
            const matches = organizers.map(organizer => {
                const score = this.calculateMatchScore(organizer, entities);
                return {
                    ...organizer,
                    matchScore: score,
                    matchPercentage: Math.min(Math.round(score * 100), 100)
                };
            });

            // Sort by match score
            return matches
                .sort((a, b) => b.matchScore - a.matchScore)
                .map(org => ({
                    id: org.id,
                    name: org.name,
                    email: org.email,
                    matchPercentage: org.matchPercentage,
                    expertise: org.expertise || [],
                    location: org.location,
                    rating: org.rating || 0,
                    priceRange: org.priceRange || [0, 10000],
                    pastEvents: org.pastEvents || 0,
                    responseTime: org.responseTime || '24h'
                }));

        } catch (error) {
            logger.error(`Organizer matching failed: ${error.message}`);
            return [];
        }
    }

    calculateMatchScore(organizer, entities) {
        let score = 0;
        let totalWeights = 0;

        // 1. Event Type Match (30% weight)
        if (organizer.expertise && entities.eventType) {
            const expertiseMatch = organizer.expertise.some(exp => 
                exp.toLowerCase().includes(entities.eventType.toLowerCase()) ||
                entities.eventType.toLowerCase().includes(exp.toLowerCase())
            );
            score += expertiseMatch ? 30 : 0;
            totalWeights += 30;
        }

        // 2. Location Match (25% weight)
        if (organizer.location && entities.locations && entities.locations.length > 0) {
            const locationMatch = entities.locations.some(loc => 
                loc.toLowerCase().includes(organizer.location.toLowerCase()) ||
                organizer.location.toLowerCase().includes(loc.toLowerCase())
            );
            score += locationMatch ? 25 : 5; // Small score for different locations
            totalWeights += 25;
        }

        // 3. Budget Match (20% weight)
        if (organizer.priceRange && entities.budget) {
            const [min, max] = organizer.priceRange;
            if (entities.budget >= min && entities.budget <= max) {
                score += 20;
            } else if (entities.budget < min) {
                // Partial score if close to range
                const proximity = 1 - (min - entities.budget) / min;
                score += Math.max(0, 20 * proximity);
            } else {
                const proximity = 1 - (entities.budget - max) / max;
                score += Math.max(0, 20 * proximity);
            }
            totalWeights += 20;
        }

        // 4. Rating Factor (15% weight)
        if (organizer.rating) {
            score += (organizer.rating / 5) * 15;
            totalWeights += 15;
        }

        // 5. Response Time Factor (10% weight)
        if (organizer.responseTime) {
            const responseScore = this.calculateResponseScore(organizer.responseTime);
            score += responseScore * 10;
            totalWeights += 10;
        }

        // Normalize score if some weights weren't applicable
        if (totalWeights === 0) return 0;
        return score / totalWeights;
    }

    calculateResponseScore(responseTime) {
        if (!responseTime) return 0.5;
        
        const timeMap = {
            '1h': 1.0,
            '2h': 0.9,
            '4h': 0.8,
            '8h': 0.7,
            '12h': 0.6,
            '24h': 0.5,
            '48h': 0.3,
            '72h': 0.1
        };
        
        return timeMap[responseTime] || 0.5;
    }

    async fetchOrganizers() {
        // Check cache first
        const cacheKey = 'all_organizers';
        const cached = this.organizerCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            // This would be replaced with actual database query
            // For now, return mock data
            const mockOrganizers = [
                {
                    id: 'org1',
                    name: 'Elite Events',
                    email: 'elite@events.com',
                    expertise: ['wedding', 'corporate', 'birthday'],
                    location: 'New York',
                    rating: 4.8,
                    priceRange: [5000, 50000],
                    pastEvents: 120,
                    responseTime: '4h'
                },
                {
                    id: 'org2',
                    name: 'Budget Parties',
                    email: 'info@budgetparties.com',
                    expertise: ['birthday', 'party'],
                    location: 'Chicago',
                    rating: 4.2,
                    priceRange: [200, 2000],
                    pastEvents: 85,
                    responseTime: '8h'
                },
                {
                    id: 'org3',
                    name: 'Corporate Solutions',
                    email: 'solutions@corporate.com',
                    expertise: ['corporate', 'conference'],
                    location: 'San Francisco',
                    rating: 4.6,
                    priceRange: [3000, 20000],
                    pastEvents: 200,
                    responseTime: '2h'
                },
                {
                    id: 'org4',
                    name: 'Dream Weddings',
                    email: 'dream@weddings.com',
                    expertise: ['wedding'],
                    location: 'Los Angeles',
                    rating: 4.9,
                    priceRange: [10000, 100000],
                    pastEvents: 150,
                    responseTime: '12h'
                },
                {
                    id: 'org5',
                    name: 'Local Events',
                    email: 'local@events.com',
                    expertise: ['general', 'party', 'birthday'],
                    location: 'Boston',
                    rating: 4.0,
                    priceRange: [500, 5000],
                    pastEvents: 50,
                    responseTime: '24h'
                }
            ];

            // Cache the results
            this.organizerCache.set(cacheKey, {
                data: mockOrganizers,
                timestamp: Date.now()
            });

            return mockOrganizers;

        } catch (error) {
            logger.error(`Failed to fetch organizers: ${error.message}`);
            return [];
        }
    }

    /**
     * Get detailed match analysis for specific organizer
     */
    getMatchAnalysis(organizer, entities) {
        const analysis = {
            eventTypeMatch: false,
            locationMatch: false,
            budgetMatch: false,
            strengths: [],
            considerations: []
        };

        // Event Type Analysis
        if (organizer.expertise && entities.eventType) {
            analysis.eventTypeMatch = organizer.expertise.some(exp => 
                exp.toLowerCase().includes(entities.eventType.toLowerCase())
            );
            if (analysis.eventTypeMatch) {
                analysis.strengths.push('Expertise in this event type');
            } else {
                analysis.considerations.push('Limited experience with this event type');
            }
        }

        // Location Analysis
        if (organizer.location && entities.locations) {
            analysis.locationMatch = entities.locations.some(loc => 
                loc.toLowerCase().includes(organizer.location.toLowerCase())
            );
            if (analysis.locationMatch) {
                analysis.strengths.push('Local to requested area');
            } else {
                analysis.considerations.push('May require travel arrangements');
            }
        }

        // Budget Analysis
        if (organizer.priceRange && entities.budget) {
            const [min, max] = organizer.priceRange;
            if (entities.budget >= min && entities.budget <= max) {
                analysis.budgetMatch = true;
                analysis.strengths.push('Budget fits organizer\'s range');
            } else if (entities.budget < min) {
                analysis.considerations.push(`Budget is below organizer's minimum ($${min})`);
            } else {
                analysis.considerations.push(`Budget exceeds organizer's typical range`);
            }
        }

        return analysis;
    }
}

// Create singleton instance
const matcher = new OrganizerMatcher();

module.exports = {
    matchOrganizers: (entities) => matcher.matchOrganizers(entities),
    getMatchAnalysis: (organizer, entities) => matcher.getMatchAnalysis(organizer, entities),
    OrganizerMatcher
};