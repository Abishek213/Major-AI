const ranker = require("./ranker");

// NOTE: preference-extractor.js and embedding-generator.js exist in this directory
// but are currently empty placeholder files for future phases.
// The current implementation is fully self-contained: the ranker derives all
// preference signals directly from the userContext passed by the Backend, and
// scoring is done without a separate embedding model.
//
// When those files are implemented, wire them in here:
//   const preferenceExtractor = require("./preference-extractor");
//   const embeddingGenerator  = require("./embedding-generator");

class EventRecommendationAgent {
  // ─────────────────────────────────────────────────────────
  // Main entry point. Called by agent.controller.js → postRecommendations()
  // with the full payload that the Backend assembled before the HTTP call.
  //
  // userId          — the user we're generating recommendations for
  // limit           — max number of results to return
  // userContext     — { wishlistEvents, bookedEvents, reviewedEvents }
  //                   assembled by Backend's _buildUserContext() from its DB
  // candidateEvents — events that passed the Backend's eligibility filter
  //                   (status, deadline, capacity, isPublic)
  //
  // Output contract (per item) — matches storeRecommendations() in ai_service.js:
  //   { event_id, confidence_score, recommendation_reason }
  // ─────────────────────────────────────────────────────────
  async getRecommendations(userId, limit = 10, userContext, candidateEvents) {
    try {
      console.log(`🤖 Generating recommendations for user: ${userId}`);

      // If Backend sent no candidates, return empty.
      // The Backend will fall through to its own fallback — not our job.
      if (!candidateEvents || !candidateEvents.length) {
        console.log("⚠️  No candidate events received — returning empty.");
        return [];
      }

      // If no user context arrived (e.g. brand new user with zero history),
      // pass an empty structure so the ranker can handle cold-start gracefully
      // without crashing on undefined access.
      const context = userContext || {
        wishlistEvents: [],
        bookedEvents: [],
        reviewedEvents: [],
      };

      console.log(
        `📊 Scoring ${candidateEvents.length} candidates | ` +
          `wishlist: ${context.wishlistEvents.length} | ` +
          `booked: ${context.bookedEvents.length} | ` +
          `reviewed: ${context.reviewedEvents.length}`
      );

      // Hand off to ranker — it scores every candidate against the user context
      // and returns them sorted by final_score descending, each with a
      // recommendation_reason explaining WHY it scored well.
      const rankedEvents = await ranker.rankEvents(candidateEvents, context);

      // Trim to the requested limit, then format to the output contract
      // that storeRecommendations() in ai_service.js expects.
      const formatted = this.formatRecommendations(
        rankedEvents.slice(0, limit),
        userId
      );

      console.log(`✅ Returning ${formatted.length} recommendations`);
      return formatted;
    } catch (error) {
      console.error("❌ Recommendation Error:", error.message);
      // Return empty — Backend has its own fallback path for this case.
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // Maps ranked event objects into the strict shape that
  // ai_service.js → storeRecommendations() expects:
  //   { event_id, confidence_score, recommendation_reason }
  //
  // confidence_score and recommendation_reason come FROM the ranker's
  // output — they are not invented or randomly assigned here.
  //
  // event._id is the MongoDB ObjectId from the candidate event doc that
  // the Backend populated and forwarded. It maps directly to the
  // ai_recommendation.schema event_id field (ref: "Event").
  // ─────────────────────────────────────────────────────────
  formatRecommendations(rankedEvents, userId) {
    return rankedEvents.map((event) => ({
      event_id: event._id,
      confidence_score: event.final_score,
      recommendation_reason: event.recommendation_reason,
    }));
  }
}

module.exports = EventRecommendationAgent;
