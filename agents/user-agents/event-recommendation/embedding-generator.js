/**
 * embedding-generator.js — Phase 2 placeholder
 *
 * FIX: This file was completely empty. An empty file has no `module.exports`,
 * so `require("./embedding-generator")` returns `{}` — an empty object with
 * no methods. Any caller attempting to use the returned object would get a
 * "TypeError: embeddingGenerator.xxx is not a function" runtime error with no
 * indication of why. Now exports a proper stub class so:
 *   1. require() returns a real object
 *   2. Method calls fail with a clear "not yet implemented" message rather than
 *      a confusing TypeError
 *   3. The intended interface is documented for the developer who implements it
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PLANNED IMPLEMENTATION (Phase 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * When implemented, this module will generate semantic embeddings for events
 * and users using a local Ollama model or a remote embedding API, enabling
 * cosine-similarity-based recommendation ranking as an alternative or
 * complement to the weight-based scoring in ranker.js.
 *
 * Expected interface:
 *
 *   const embedder = require("./embedding-generator");
 *
 *   // Generate an embedding for an event document
 *   const eventEmbedding = await embedder.embedEvent(event);
 *   // → number[]  (e.g. 768-dim or 1536-dim vector)
 *
 *   // Generate an embedding for a user preference profile
 *   // (built by preference-extractor.js)
 *   const userEmbedding = await embedder.embedUserProfile(profile);
 *   // → number[]
 *
 *   // Compute cosine similarity between two vectors
 *   const similarity = embedder.cosineSimilarity(vectorA, vectorB);
 *   // → number  (0–1)
 *
 *   // Batch embed multiple events efficiently
 *   const embeddings = await embedder.batchEmbedEvents(events);
 *   // → number[][]
 *
 * Implementation notes:
 *   - Use the Ollama /api/embeddings endpoint with nomic-embed-text or mxbai-embed-large
 *   - Cache embeddings in Redis or MongoDB to avoid re-embedding unchanged events
 *   - Fall back gracefully to ranker.js weight scoring if Ollama is unavailable
 * ─────────────────────────────────────────────────────────────────────────────
 */

class EmbeddingGenerator {
  /**
   * Generate a semantic embedding vector for an event document.
   *
   * @param {Object} event — full event document from MongoDB
   * @returns {Promise<number[]>} Embedding vector
   */
  async embedEvent(event) {
    throw new Error(
      "EmbeddingGenerator.embedEvent() is not yet implemented. " +
        "This module is a placeholder for Phase 2. " +
        "Current recommendations use weight-based scoring in ranker.js."
    );
  }

  /**
   * Generate a semantic embedding vector for a user preference profile.
   *
   * @param {Object} profile — output of PreferenceExtractor.extractPreferences()
   * @returns {Promise<number[]>} Embedding vector
   */
  async embedUserProfile(profile) {
    throw new Error(
      "EmbeddingGenerator.embedUserProfile() is not yet implemented. " +
        "This module is a placeholder for Phase 2."
    );
  }

  /**
   * Batch embed multiple events in a single Ollama request.
   *
   * @param {Object[]} events — array of event documents
   * @returns {Promise<number[][]>} Array of embedding vectors (same order as input)
   */
  async batchEmbedEvents(events) {
    throw new Error(
      "EmbeddingGenerator.batchEmbedEvents() is not yet implemented. " +
        "This module is a placeholder for Phase 2."
    );
  }

  /**
   * Compute cosine similarity between two embedding vectors.
   * This is the only method that IS implemented, as it is pure math with
   * no external dependencies.
   *
   * @param {number[]} a — first vector
   * @param {number[]} b — second vector (must be same length as a)
   * @returns {number} Similarity score in range [0, 1]
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) {
      throw new Error(
        "cosineSimilarity: both vectors must be non-null arrays of equal length"
      );
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;

    // Clamp to [0, 1] to handle floating-point rounding above 1
    return Math.min(1, Math.max(0, dot / denom));
  }
}

module.exports = new EmbeddingGenerator();
