class EventRanker {
  _buildUserProfile(userContext) {
    const categories = new Set();
    const tags = new Set();
    const locations = new Set();
    const prices = [];

    const extract = (event) => {
      if (!event) return;
      if (event.category?.category_Name) {
        categories.add(event.category.category_Name.toLowerCase());
      }
      if (Array.isArray(event.tags)) {
        event.tags.forEach((tag) => tags.add(tag.toLowerCase().trim()));
      }
      if (event.location) {
        locations.add(event.location.toLowerCase().trim());
      }
      if (typeof event.price === "number") {
        prices.push(event.price);
      }
    };

    (userContext.wishlistEvents || []).forEach(extract);
    (userContext.bookedEvents || []).forEach(extract);
    (userContext.reviewedEvents || []).forEach((r) => extract(r.event));

    let priceRange;
    if (prices.length > 0) {
      const sorted = [...prices].sort((a, b) => a - b);
      priceRange = { min: sorted[0], max: sorted[sorted.length - 1] };
    } else {
      priceRange = { min: 0, max: Infinity };
    }

    return {
      categories,
      tags,
      locations,
      priceRange,
      hasPastEvents: prices.length > 0,
    };
  }

  // FIX: Made async to properly match `await ranker.rankEvents()` in index.js.
  // Previously synchronous — JS silently resolves `await` on a non-Promise
  // to the raw value so it "worked", but violated the async contract and would
  // break immediately the moment any async operation was added inside this method.
  async rankEvents(events, userContext) {
    const profile = this._buildUserProfile(userContext);

    return events
      .map((event) => {
        const matchedSignals = [];
        let score = 0;

        // 1. TAG MATCH (30%)
        const eventTags = (event.tags || []).map((t) => t.toLowerCase().trim());
        if (eventTags.length > 0 && profile.tags.size > 0) {
          const matchedTags = eventTags.filter((t) => profile.tags.has(t));
          if (matchedTags.length > 0) {
            score += Math.min(matchedTags.length / eventTags.length, 1) * 0.3;
            matchedSignals.push(`interests in ${matchedTags.join(", ")}`);
          }
        }

        // 2. CATEGORY MATCH (20%)
        const eventCategory = event.category?.category_Name?.toLowerCase();
        if (eventCategory && profile.categories.has(eventCategory)) {
          score += 0.2;
          matchedSignals.push(`category ${event.category.category_Name}`);
        }

        // 3. PRICE FIT (20%)
        if (profile.hasPastEvents) {
          if (
            event.price >= profile.priceRange.min &&
            event.price <= profile.priceRange.max
          ) {
            score += 0.2;
            matchedSignals.push(`fits your typical budget`);
          } else {
            score += 0.1;
          }
        } else {
          score += 0.1; // cold start neutral
        }

        // 4. LOCATION MATCH (15%)
        const eventLocation = (event.location || "").toLowerCase();
        if (eventLocation && profile.locations.size > 0) {
          const locationMatch = [...profile.locations].some((loc) =>
            eventLocation.includes(loc)
          );
          if (locationMatch) {
            score += 0.15;
            matchedSignals.push(`in a location you enjoy`);
          }
        }

        // 5. POPULARITY (10%)
        const attendeeCount = Array.isArray(event.attendees)
          ? event.attendees.length
          : 0;
        // Guard: totalSlots > 0 to avoid NaN/Infinity
        const totalSlots = event.totalSlots > 0 ? event.totalSlots : 1;
        const fillRatio = attendeeCount / totalSlots;
        score += fillRatio * 0.1;
        if (fillRatio > 0.7) matchedSignals.push(`popular event`);

        // 6. RECENCY (5%)
        if (event.event_date && new Date(event.event_date) > new Date()) {
          score += 0.05;
        }

        const recommendation_reason =
          matchedSignals.length > 0
            ? `Recommended based on your ${matchedSignals.join(", ")}`
            : "Suggested event based on platform activity";

        return {
          ...event,
          final_score: parseFloat(Math.min(score, 1).toFixed(3)),
          recommendation_reason,
        };
      })
      .sort((a, b) => b.final_score - a.final_score);
  }
}

module.exports = new EventRanker();
