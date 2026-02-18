// In ai-service/agents/user-agents/matcher.js
const { logger } = require("../../../config/logger");
const axios = require('axios'); // Add this for API calls

class OrganizerMatcher {
  constructor() {
    this.organizerCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    // Backend API URL (your backend service)
    this.BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:4001/api/v1/eventrequest';
  }

  /**
   * Match organizers based on event requirements
   */
  async matchOrganizers(entities) {
    try {
      // Get organizers from BACKEND API (not direct import)
      const organizers = await this.fetchOrganizersFromBackend(entities);

      if (!organizers || organizers.length === 0) {
        return [];
      }

      // Calculate match scores
      const matches = organizers.map((organizer) => {
        const score = this.calculateMatchScore(organizer, entities);
        return {
          id: organizer._id || organizer.id,
          name: organizer.fullname || organizer.businessName || 'Organizer',
          email: organizer.email,
          contact: organizer.contactNo || organizer.contact,
          matchPercentage: Math.min(Math.round(score * 100), 100),
          expertise: organizer.expertise || [entities.eventType || 'general'],
          location: organizer.location || organizer.serviceArea || 'Nepal',
          rating: organizer.rating || 4.0,
          priceRange: organizer.priceRange || [5000, 500000],
          pastEvents: organizer.totalEvents || 0,
          responseTime: organizer.responseTime || '24h',
          isVerified: organizer.isVerified || false,
          profileImage: organizer.profileImage || null
        };
      });

      // Sort by match score
      return matches.sort((a, b) => b.matchPercentage - a.matchPercentage);
    } catch (error) {
      logger.error(`Organizer matching failed: ${error.message}`);
      return []; // Return empty array on error
    }
  }

  /**
   * Fetch organizers from Backend API (NOT direct import)
   */
  async fetchOrganizersFromBackend(entities) {
    // Create cache key
    const cacheKey = `organizers_${entities.eventType}_${entities.locations?.[0]}`;
    const cached = this.organizerCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      console.log('🔍 Fetching organizers from backend API...');
      
      // Build query parameters
      const params = new URLSearchParams();
      if (entities.eventType) params.append('eventType', entities.eventType);
      if (entities.locations?.length) params.append('location', entities.locations[0]);
      if (entities.budget) params.append('budget', entities.budget);
      
      // Call your backend API endpoint
      const response = await axios.get(
        `${this.BACKEND_API_URL}/eventrequest/organizers/search`,
        { 
          params,
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.data || !response.data.success) {
        console.log('⚠️ No organizers data from backend');
        return [];
      }

      const organizers = response.data.data || response.data.organizers || [];
      
      console.log(`✅ Fetched ${organizers.length} organizers from backend`);

      // Cache the results
      this.organizerCache.set(cacheKey, {
        data: organizers,
        timestamp: Date.now()
      });

      return organizers;

    } catch (error) {
      console.error('❌ Failed to fetch organizers from backend:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      return []; // Return empty array on error
    }
  }

  calculateMatchScore(organizer, entities) {
    let score = 0;
    let totalWeights = 0;

    // 1. Event Type Match (30% weight)
    if (organizer.expertise && entities.eventType) {
      const expertiseMatch = organizer.expertise.some(exp => 
        exp?.toLowerCase().includes(entities.eventType.toLowerCase()) ||
        entities.eventType.toLowerCase().includes(exp?.toLowerCase() || '')
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
      score += locationMatch ? 25 : 5;
      totalWeights += 25;
    }

    // 3. Budget Match (20% weight)
    if (organizer.priceRange && entities.budget) {
      const [min, max] = organizer.priceRange;
      if (entities.budget >= min && entities.budget <= max) {
        score += 20;
      } else if (entities.budget < min) {
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

    // Normalize score
    return totalWeights > 0 ? score / totalWeights : 0;
  }

  calculateResponseScore(responseTime) {
    if (!responseTime) return 0.5;
    
    const timeMap = {
      '1h': 1.0, '2h': 0.9, '4h': 0.8, '8h': 0.7,
      '12h': 0.6, '24h': 0.5, '48h': 0.3, '72h': 0.1
    };
    return timeMap[responseTime] || 0.5;
  }
}

// Create singleton instance
const matcher = new OrganizerMatcher();

module.exports = {
  matchOrganizers: (entities) => matcher.matchOrganizers(entities),
  OrganizerMatcher,
};