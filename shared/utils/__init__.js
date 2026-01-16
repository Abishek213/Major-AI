/**
 * Shared utilities index file
 * Exports all utility modules for easy import
 */

// Re-export all utilities
const languageDetect = require("./language-detect");
const vectorStore = require("./vector-store");
const dataProcessor = require("./data-processor");
const logger = require("./logger");

// Additional utilities
const validation = require("./validation");
const encryption = require("./encryption");
const cache = require("./cache");
const metrics = require("./metrics");

module.exports = {
  // Core utilities
  ...languageDetect,
  ...vectorStore,
  ...dataProcessor,
  ...logger,

  // Additional utilities
  validation,
  encryption,
  cache,
  metrics,

  // Utility functions
  helpers: {
    formatDate: (date) => new Date(date).toISOString().split("T")[0],
    generateId: () =>
      Date.now().toString(36) + Math.random().toString(36).substr(2),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    retry: async (fn, retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error) {
          if (i === retries - 1) throw error;
          await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
        }
      }
    },
  },
};
