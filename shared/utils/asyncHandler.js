// utils/asyncHandler.js
const logger = require("../../config/logger");

/**
 * Wraps an async route handler to catch errors and pass them to Express error handler.
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    logger.error(`Async handler error: ${error.message}`, error);
    next(error);
  });
};

module.exports = asyncHandler;
