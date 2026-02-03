class EventRanker {
  // ─────────────────────────────────────────────────────────
  // Extracts the user's actual taste signals from their history.
  // Called once per rankEvents() call — not per event.
  //
  // userContext shape (from Backend's _buildUserContext):
  //   {
  //     wishlistEvents[],   — full event docs
  //     bookedEvents[],     — full event docs (populated from Booking)
  //     reviewedEvents[],   — { event: <event doc>, rating: <number> }
  //   }
  //
  // Returns a flat profile the scoring functions can read quickly:
  //   { categories Set, tags Set, locations Set, prices[], hasPastEvents bool }
  // ─────────────────────────────────────────────────────────
  _buildUserProfile(userContext) {
    const categories = new Set();
    const tags = new Set();
    const locations = new Set();
    const prices = [];

    // Helper: extracts signals from a single event doc and adds them to the sets
    const extract = (event) => {
      if (!event) return;

      // category is populated → { _id, category_Name }
      if (event.category?.category_Name) {
        categories.add(event.category.category_Name.toLowerCase());
      }

      // tags is an array of strings
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

    // Wishlist events — strong signal (user explicitly saved these)
    (userContext.wishlistEvents || []).forEach(extract);

    // Booked events — strongest signal (user actually paid)
    (userContext.bookedEvents || []).forEach(extract);

    // Reviewed events — confirms engagement
    (userContext.reviewedEvents || []).forEach((r) => extract(r.event));

    // Derive price range from actual history
    // If no history at all (cold start), use a wide default so nothing is penalized
    let priceRange;
    if (prices.length > 0) {
      const sorted = [...prices].sort((a, b) => a - b);
      priceRange = {
        min: sorted[0],
        max: sorted[sorted.length - 1],
      };
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

  // ─────────────────────────────────────────────────────────
  // Scores and sorts all candidate events against the user profile.
  //
  // Weight distribution (totals 100%):
  //   Tags match      — 30%  (strongest: proves direct interest overlap)
  //   Category match  — 20%  (event type alignment)
  //   Price fit       — 20%  (did the user spend in this range before?)
  //   Location match  — 15%  (familiarity/proximity)
  //   Popularity      —  10% (demand signal: how full is the event)
  //   Recency         —  5%  (minor boost for sooner upcoming events)
  // ─────────────────────────────────────────────────────────
  rankEvents(events, userContext) {
    const profile = this._buildUserProfile(userContext);

    return events
      .map((event) => {
        // Track which signals fired — used to build the reason string
        const matchedSignals = [];
        let score = 0;

        // ── 1. TAG MATCH (30%) ────────────────────────────────
        // Strongest signal. Score is proportional to how many of the
        // event's tags overlap with tags from the user's history.
        const eventTags = (event.tags || []).map((t) => t.toLowerCase().trim());
        if (eventTags.length > 0 && profile.tags.size > 0) {
          const matchedTags = eventTags.filter((t) => profile.tags.has(t));
          if (matchedTags.length > 0) {
            // Partial credit: even one matching tag gives a boost,
            // full overlap gives the full 0.3
            const tagScore =
              Math.min(matchedTags.length / eventTags.length, 1) * 0.3;
            score += tagScore;
            matchedSignals.push(`interests in ${matchedTags.join(", ")}`);
          }
        }

        // ── 2. CATEGORY MATCH (20%) ───────────────────────────
        // event.category is populated → { _id, category_Name }
        const eventCategory = event.category?.category_Name?.toLowerCase();
        if (eventCategory && profile.categories.has(eventCategory)) {
          score += 0.2;
          matchedSignals.push(`category ${event.category.category_Name}`);
        }

        // ── 3. PRICE FIT (20%) ────────────────────────────────
        // Full marks if within the user's historical price range.
        // Partial credit (0.1) if outside but still reasonable.
        // No penalty if the user has no history (cold start).
        if (profile.hasPastEvents) {
          if (
            event.price >= profile.priceRange.min &&
            event.price <= profile.priceRange.max
          ) {
            score += 0.2;
            matchedSignals.push(`fits your typical budget`);
          } else {
            // Outside range but not zero — still give partial credit
            score += 0.1;
          }
        } else {
          // Cold start: no history to compare against, give neutral score
          score += 0.1;
        }

        // ── 4. LOCATION MATCH (15%) ───────────────────────────
        // Check if event location matches any location from user history
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

        // ── 5. POPULARITY (10%) ───────────────────────────────
        // How in-demand is this event? Higher fill ratio = more popular.
        // Uses attendees.length and totalSlots — the real schema fields.
        const attendeeCount = Array.isArray(event.attendees)
          ? event.attendees.length
          : 0;
        const totalSlots = event.totalSlots || 1; // avoid division by zero
        const fillRatio = attendeeCount / totalSlots;
        score += fillRatio * 0.1;
        if (fillRatio > 0.7) {
          matchedSignals.push(`popular event`);
        }

        // ── 6. RECENCY (5%) ───────────────────────────────────
        // Small boost for events happening sooner (more actionable).
        // event_date is the real field name on Event schema.
        if (event.event_date && new Date(event.event_date) > new Date()) {
          score += 0.05;
        }

        // ── BUILD RECOMMENDATION REASON ───────────────────────
        // Constructed from whichever signals actually fired for this event.
        // If nothing matched (e.g. cold start), use a generic fallback.
        let recommendation_reason;
        if (matchedSignals.length > 0) {
          recommendation_reason = `Recommended based on your ${matchedSignals.join(
            ", "
          )}`;
        } else {
          recommendation_reason = "Suggested event based on platform activity";
        }

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
