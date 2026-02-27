/**
 * preference-extractor.js — Phase 2 placeholder
 *
 * FIX: This file was completely empty. An empty file has no `module.exports`,
 * so `require("./preference-extractor")` returns `{}` — an empty object with
 * no methods. Any caller attempting to use the returned object would get a
 * "TypeError: preferenceExtractor.xxx is not a function" runtime error with no
 * indication of why. Now exports a proper stub class so:
 *   1. require() returns a real object
 *   2. Method calls fail with a clear "not yet implemented" message rather than
 *      a confusing TypeError
 *   3. The intended interface is documented for the developer who implements it
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PLANNED IMPLEMENTATION (Phase 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * When implemented, this module will accept the userContext object assembled
 * by ai_service.js → _buildUserContext() and derive a richer preference
 * vector from it — going beyond the simple Set-based signals in ranker.js.
 *
 * Expected interface:
 *
 *   const extractor = require("./preference-extractor");
 *
 *   // Extract a structured preference profile from a user's event history
 *   const profile = await extractor.extractPreferences(userContext);
 *   // → {
 *   //     preferredCategories: [{ name, weight }],
 *   //     preferredTags:       [{ name, weight }],
 *   //     priceRange:          { min, max, preferred },
 *   //     timePreferences:     { weekdays: bool, weekends: bool, evening: bool },
 *   //     locationBias:        [string],
 *   //     engagementScore:     number,   // 0–1, how active the user is
 *   //   }
 *
 *   // Build a preference vector suitable for cosine-similarity scoring
 *   // (used alongside embedding-generator.js when that is implemented)
 *   const vector = await extractor.toVector(profile);
 *   // → Float32Array | number[]
 * ─────────────────────────────────────────────────────────────────────────────
 */

class PreferenceExtractor {
  /**
   * Extract a structured preference profile from the user's event history.
   *
   * @param {Object} userContext — { wishlistEvents[], bookedEvents[], reviewedEvents[] }
   * @returns {Promise<Object>} Structured preference profile
   */
  async extractPreferences(userContext) {
    throw new Error(
      "PreferenceExtractor.extractPreferences() is not yet implemented. " +
        "This module is a placeholder for Phase 2. " +
        "Current recommendation scoring uses ranker.js directly."
    );
  }

  /**
   * Convert a preference profile into a numeric vector for similarity scoring.
   *
   * @param {Object} profile — output of extractPreferences()
   * @returns {Promise<number[]>} Numeric preference vector
   */
  async toVector(profile) {
    throw new Error(
      "PreferenceExtractor.toVector() is not yet implemented. " +
        "This module is a placeholder for Phase 2."
    );
  }
}

module.exports = new PreferenceExtractor();
