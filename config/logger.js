/**
 * ============================================================================
 * LOGGER UTILITY - AI AGENT SERVICE
 * ============================================================================
 *
 * Provides structured logging with:
 * - Color-coded output for different log levels
 * - Timestamp on every log
 * - Agent-specific tagging
 * - Debug mode support
 * - Production file logging (ready for implementation)
 *
 * Usage:
 *   logger.info('Agent initialized');
 *   logger.error('Connection failed', error);
 *   logger.agent('BookingAgent', 'processed query', 'refund question');
 *   logger.debug('Detailed debug info'); // Only shows if DEBUG=true
 *
 * ============================================================================
 */

class Logger {
  constructor() {
    // ANSI color codes for terminal output
    this.colors = {
      info: "\x1b[36m", // Cyan - General information
      success: "\x1b[32m", // Green - Successful operations
      warning: "\x1b[33m", // Yellow - Warnings
      error: "\x1b[31m", // Red - Errors
      agent: "\x1b[35m", // Magenta - Agent-specific logs
      debug: "\x1b[90m", // Gray - Debug information
      reset: "\x1b[0m", // Reset color
    };

    // Check if debug mode is enabled
    this.debugEnabled =
      process.env.DEBUG === "true" || process.env.NODE_ENV === "development";
  }

  /**
   * Core logging method
   *
   * @param {string} level - Log level (info, success, warning, error, agent, debug)
   * @param {string|object} message - Message to log
   * @param {string} agent - Optional agent name
   */
  log(level, message, agent = null) {
    const timestamp = new Date().toISOString();
    const color = this.colors[level] || this.colors.info;
    const agentTag = agent ? `[${agent}] ` : "";

    // Handle object/error logging
    let logMessage = message;
    if (typeof message === "object") {
      if (message instanceof Error) {
        logMessage = `${message.message}\n${message.stack}`;
      } else {
        try {
          logMessage = JSON.stringify(message, null, 2);
        } catch (e) {
          logMessage = String(message);
        }
      }
    }

    // FIXED: Proper console.log syntax (was template literal issue)
    console.log(
      `${color}[${timestamp}] [${level.toUpperCase()}] ${agentTag}${logMessage}${
        this.colors.reset
      }`
    );

    // File logging in production (placeholder for future implementation)
    if (process.env.NODE_ENV === "production") {
      this.logToFile(level, logMessage, agent, timestamp);
    }
  }

  /**
   * Info level - General information
   * Use for: Initialization, configuration, status updates
   */
  info(message, agent = null) {
    this.log("info", message, agent);
  }

  /**
   * Success level - Successful operations
   * Use for: Successful API calls, completed tasks, achievements
   */
  success(message, agent = null) {
    this.log("success", message, agent);
  }

  /**
   * Warning level - Non-critical issues
   * Use for: Degraded functionality, missing optional config, deprecated usage
   */
  warning(message, agent = null) {
    this.log("warning", message, agent);
  }

  /**
   * Alias for warning (common naming convention)
   */
  warn(message, agent = null) {
    this.log("warning", message, agent);
  }

  /**
   * Error level - Critical issues
   * Use for: Exceptions, failed operations, system errors
   */
  error(message, agent = null) {
    this.log("error", message, agent);
  }

  /**
   * Debug level - Detailed diagnostic information
   * Only logs if DEBUG=true or NODE_ENV=development
   * Use for: Variable dumps, detailed flow tracking, troubleshooting
   */
  debug(message, agent = null) {
    if (this.debugEnabled) {
      this.log("debug", message, agent);
    }
  }

  /**
   * Agent-specific logging
   * Specialized method for AI agent actions
   *
   * @param {string} agentName - Name of the agent
   * @param {string} action - Action being performed
   * @param {string} details - Additional details (optional)
   */
  agent(agentName, action, details = "") {
    const message = details ? `${action} - ${details}` : action;
    this.log("agent", message, agentName);
  }

  /**
   * File logging implementation (for production)
   *
   * TODO: Implement with:
   * - winston or pino for structured logging
   * - Log rotation (daily/size-based)
   * - Different files for different levels
   * - Compressed archives for old logs
   *
   * Example structure:
   * /logs
   *   ├── info.log
   *   ├── error.log
   *   ├── agent.log
   *   └── combined.log
   */
  logToFile(level, message, agent, timestamp) {
    // Placeholder for file logging
    // In production, you would:
    // 1. Use fs.appendFile or a logging library
    // 2. Implement log rotation
    // 3. Handle file permissions
    // 4. Consider centralized logging (ELK, Splunk, CloudWatch)
    // Example implementation:
    /*
    const fs = require('fs');
    const path = require('path');
    
    const logDir = path.join(__dirname, '../../../logs');
    const logFile = path.join(logDir, `${level}.log`);
    
    const logEntry = JSON.stringify({
      timestamp,
      level,
      agent,
      message
    }) + '\n';
    
    fs.appendFile(logFile, logEntry, (err) => {
      if (err) console.error('Failed to write log:', err);
    });
    */
  }

  /**
   * Performance logging
   * Logs execution time of operations
   *
   * Usage:
   *   const startTime = Date.now();
   *   // ... do work ...
   *   logger.performance('Operation', startTime);
   */
  performance(operation, startTime, agent = null) {
    const duration = Date.now() - startTime;
    const message = `${operation} completed in ${duration}ms`;

    // Color code based on duration
    if (duration < 100) {
      this.success(message, agent);
    } else if (duration < 1000) {
      this.info(message, agent);
    } else {
      this.warning(message, agent);
    }
  }

  /**
   * Group related logs together (for complex operations)
   *
   * Usage:
   *   logger.group('User Registration');
   *   logger.info('Validating input...');
   *   logger.info('Creating user...');
   *   logger.groupEnd();
   */
  group(label) {
    console.group(`\n${this.colors.info}━━━ ${label} ━━━${this.colors.reset}`);
  }

  groupEnd() {
    console.groupEnd();
    console.log(""); // Empty line for spacing
  }

  /**
   * Log a separator line (useful for visual organization)
   */
  separator() {
    console.log(`${this.colors.info}${"─".repeat(80)}${this.colors.reset}`);
  }

  /**
   * Log with custom color (for special cases)
   */
  custom(message, colorCode, agent = null) {
    const timestamp = new Date().toISOString();
    const agentTag = agent ? `[${agent}] ` : "";
    console.log(
      `${colorCode}[${timestamp}] [CUSTOM] ${agentTag}${message}${this.colors.reset}`
    );
  }

  /**
   * Pretty print JSON objects
   */
  json(obj, label = "JSON Output", agent = null) {
    if (label) {
      this.info(`${label}:`, agent);
    }
    console.log(JSON.stringify(obj, null, 2));
  }

  /**
   * Log table (useful for arrays of objects)
   */
  table(data, label = null) {
    if (label) {
      this.info(label);
    }
    console.table(data);
  }
}

module.exports = new Logger();
