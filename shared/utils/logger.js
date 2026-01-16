/**
 * Enhanced logging utility for AI agents
 * Supports multiple log levels, transports, and structured logging
 */

const winston = require("winston");
const { format } = winston;
const DailyRotateFile = require("winston-daily-rotate-file");
const fs = require("fs").promises;
const path = require("path");
const util = require("util");

class EnhancedLogger {
  constructor(config = {}) {
    this.config = {
      // Log levels
      level: config.level || process.env.LOG_LEVEL || "info",
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        verbose: 4,
        debug: 5,
        silly: 6,
        ai: 7, // Custom level for AI agent logs
      },

      // Transports
      transports: config.transports || ["console", "file"],

      // File logging configuration
      file: {
        dirname: config.file?.dirname || "logs",
        filename: config.file?.filename || "ai-agent-%DATE%.log",
        datePattern: config.file?.datePattern || "YYYY-MM-DD",
        maxSize: config.file?.maxSize || "20m",
        maxFiles: config.file?.maxFiles || "14d",
        zippedArchive: config.file?.zippedArchive || true,
        ...config.file,
      },

      // Console formatting
      console: {
        colorize: config.console?.colorize !== false,
        timestamp: config.console?.timestamp !== false,
        level: config.console?.level || true,
        label: config.console?.label || "AI_Agent",
        ...config.console,
      },

      // Structured logging
      structured: config.structured !== false,

      // Performance monitoring
      performance: {
        enabled: config.performance?.enabled || false,
        threshold: config.performance?.threshold || 1000, // ms
        ...config.performance,
      },

      // Agent-specific logging
      agents: config.agents || {},

      ...config,
    };

    // Create logs directory if it doesn't exist
    this.ensureLogDirectory();

    // Initialize Winston logger
    this.logger = this.createLogger();

    // Initialize metrics
    this.metrics = {
      totalLogs: 0,
      byLevel: {},
      byAgent: {},
      errors: 0,
      performance: {
        slowOperations: 0,
        totalTime: 0,
      },
    };
  }

  ensureLogDirectory() {
    const logDir = path.resolve(this.config.file.dirname);

    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
        console.log(`Created log directory: ${logDir}`);
      } catch (error) {
        console.error(`Failed to create log directory: ${error.message}`);
      }
    }
  }

  createLogger() {
    const { combine, timestamp, label, printf, colorize, errors } = format;

    // Custom format for structured logging
    const structuredFormat = printf(
      ({ level, message, label, timestamp, ...metadata }) => {
        const logEntry = {
          timestamp,
          level: level.toUpperCase(),
          label,
          message,
          ...metadata,
        };

        // Remove undefined values
        Object.keys(logEntry).forEach(
          (key) => logEntry[key] === undefined && delete logEntry[key]
        );

        return JSON.stringify(logEntry);
      }
    );

    // Custom format for console (human readable)
    const consoleFormat = printf(
      ({ level, message, label, timestamp, agent, ...metadata }) => {
        const timestampStr = timestamp ? `[${timestamp}] ` : "";
        const labelStr = label ? `[${label}] ` : "";
        const agentStr = agent ? `[${agent}] ` : "";
        const levelStr = level.toUpperCase().padEnd(7);

        let logLine = `${timestampStr}${labelStr}${agentStr}${levelStr}: ${message}`;

        // Add metadata if present
        if (Object.keys(metadata).length > 0) {
          // Don't include internal winston metadata
          const filteredMeta = { ...metadata };
          delete filteredMeta.splat;
          delete filteredMeta.stack;

          if (Object.keys(filteredMeta).length > 0) {
            logLine += ` | ${util.inspect(filteredMeta, {
              colors: true,
              depth: 2,
            })}`;
          }
        }

        return logLine;
      }
    );

    // Create transports
    const transports = [];

    // Console transport
    if (this.config.transports.includes("console")) {
      transports.push(
        new winston.transports.Console({
          level: this.config.level,
          format: combine(
            this.config.console.colorize ? colorize() : format.simple(),
            timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
            consoleFormat
          ),
        })
      );
    }

    // File transport with rotation
    if (this.config.transports.includes("file")) {
      transports.push(
        new DailyRotateFile({
          level: this.config.level,
          dirname: this.config.file.dirname,
          filename: this.config.file.filename,
          datePattern: this.config.file.datePattern,
          maxSize: this.config.file.maxSize,
          maxFiles: this.config.file.maxFiles,
          zippedArchive: this.config.file.zippedArchive,
          format: combine(
            timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
            this.config.structured ? structuredFormat : format.json()
          ),
        })
      );
    }

    // Create logger
    return winston.createLogger({
      levels: this.config.levels,
      level: this.config.level,
      transports,
      exceptionHandlers: [
        new DailyRotateFile({
          filename: "exceptions-%DATE%.log",
          dirname: this.config.file.dirname,
          datePattern: "YYYY-MM-DD",
          maxSize: "20m",
          maxFiles: "14d",
          zippedArchive: true,
        }),
      ],
      rejectionHandlers: [
        new DailyRotateFile({
          filename: "rejections-%DATE%.log",
          dirname: this.config.file.dirname,
          datePattern: "YYYY-MM-DD",
          maxSize: "20m",
          maxFiles: "14d",
          zippedArchive: true,
        }),
      ],
      exitOnError: false,
    });
  }

  // Base logging method
  log(level, message, metadata = {}) {
    this.updateMetrics(level, metadata.agent);

    // Add default metadata
    const enhancedMetadata = {
      ...metadata,
      pid: process.pid,
      hostname: require("os").hostname(),
      timestamp: new Date().toISOString(),
    };

    this.logger.log(level, message, enhancedMetadata);

    // Track performance for slow operations
    if (this.config.performance.enabled && metadata.duration) {
      this.trackPerformance(metadata.duration, message, metadata);
    }

    // Increment total logs
    this.metrics.totalLogs++;
  }

  // Convenience methods for each log level
  error(message, metadata = {}) {
    this.log("error", message, metadata);
    this.metrics.errors++;

    // Send error alerts if configured
    if (metadata.critical) {
      this.sendAlert("error", message, metadata);
    }
  }

  warn(message, metadata = {}) {
    this.log("warn", message, metadata);
  }

  info(message, metadata = {}) {
    this.log("info", message, metadata);
  }

  debug(message, metadata = {}) {
    this.log("debug", message, metadata);
  }

  verbose(message, metadata = {}) {
    this.log("verbose", message, metadata);
  }

  http(message, metadata = {}) {
    this.log("http", message, metadata);
  }

  // Custom AI agent logging
  ai(agent, action, message, metadata = {}) {
    const logMessage = `[${agent}] ${action}: ${message}`;
    this.log("ai", logMessage, { agent, action, ...metadata });
  }

  // Agent-specific logging methods
  agent(agentName, level, message, metadata = {}) {
    const agentConfig = this.config.agents[agentName];

    // Check if this agent should log at this level
    if (agentConfig && agentConfig.level) {
      const agentLevel = this.config.levels[agentConfig.level];
      const logLevel = this.config.levels[level];

      if (logLevel <= agentLevel) {
        this.log(level, message, { agent: agentName, ...metadata });
      }
    } else {
      // Use default level
      this.log(level, message, { agent: agentName, ...metadata });
    }
  }

  // Performance tracking
  trackPerformance(duration, operation, metadata = {}) {
    this.metrics.performance.totalTime += duration;

    if (duration > this.config.performance.threshold) {
      this.metrics.performance.slowOperations++;

      this.warn(`Slow operation detected: ${operation}`, {
        ...metadata,
        duration,
        threshold: this.config.performance.threshold,
        severity: "performance",
      });
    }
  }

  // Transaction logging
  startTransaction(name, metadata = {}) {
    const transactionId = `txn_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const startTime = Date.now();

    this.info(`Transaction started: ${name}`, {
      ...metadata,
      transactionId,
      transaction: name,
      action: "start",
      startTime,
    });

    return {
      id: transactionId,
      name,
      startTime,
      end: (resultMetadata = {}) => {
        const duration = Date.now() - startTime;
        this.info(`Transaction completed: ${name}`, {
          ...metadata,
          ...resultMetadata,
          transactionId,
          transaction: name,
          action: "end",
          duration,
          endTime: Date.now(),
        });

        return duration;
      },
      error: (error, errorMetadata = {}) => {
        const duration = Date.now() - startTime;
        this.error(`Transaction failed: ${name}`, {
          ...metadata,
          ...errorMetadata,
          transactionId,
          transaction: name,
          action: "error",
          error: error.message,
          stack: error.stack,
          duration,
          endTime: Date.now(),
        });

        return duration;
      },
    };
  }

  // Agent interaction logging
  logAgentInteraction(agentName, action, input, output, metadata = {}) {
    const interactionId = `int_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    this.ai(agentName, action, "Agent interaction", {
      ...metadata,
      interactionId,
      action,
      input: this.sanitizeInput(input),
      output: this.sanitizeOutput(output),
      timestamp: new Date().toISOString(),
    });

    return interactionId;
  }

  // Sanitize sensitive data in logs
  sanitizeInput(input) {
    if (typeof input === "string") {
      // Remove sensitive patterns
      return input
        .replace(/password=['"][^'"]*['"]/gi, "password='[REDACTED]'")
        .replace(/api_key=['"][^'"]*['"]/gi, "api_key='[REDACTED]'")
        .replace(/token=['"][^'"]*['"]/gi, "token='[REDACTED]'")
        .replace(
          /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
          "[CREDIT_CARD_REDACTED]"
        )
        .replace(/\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[PHONE_REDACTED]");
    }

    if (typeof input === "object" && input !== null) {
      const sanitized = { ...input };

      // Redact sensitive fields
      const sensitiveFields = [
        "password",
        "apiKey",
        "token",
        "secret",
        "creditCard",
        "ssn",
      ];

      for (const field of sensitiveFields) {
        if (sanitized[field]) {
          sanitized[field] = "[REDACTED]";
        }
      }

      return sanitized;
    }

    return input;
  }

  sanitizeOutput(output) {
    // Similar to sanitizeInput but can be customized for output
    if (typeof output === "string" && output.length > 1000) {
      return output.substring(0, 1000) + "... [TRUNCATED]";
    }

    return this.sanitizeInput(output);
  }

  // Metrics and statistics
  updateMetrics(level, agent) {
    // Update level metrics
    if (!this.metrics.byLevel[level]) {
      this.metrics.byLevel[level] = 0;
    }
    this.metrics.byLevel[level]++;

    // Update agent metrics
    if (agent) {
      if (!this.metrics.byAgent[agent]) {
        this.metrics.byAgent[agent] = { total: 0, byLevel: {} };
      }

      this.metrics.byAgent[agent].total++;

      if (!this.metrics.byAgent[agent].byLevel[level]) {
        this.metrics.byAgent[agent].byLevel[level] = 0;
      }
      this.metrics.byAgent[agent].byLevel[level]++;
    }
  }

  getMetrics() {
    const now = Date.now();

    return {
      ...this.metrics,
      uptime: process.uptime(),
      timestamp: now,
      date: new Date(now).toISOString(),
      memory: process.memoryUsage(),
      performance: {
        ...this.metrics.performance,
        averageResponseTime:
          this.metrics.totalLogs > 0
            ? this.metrics.performance.totalTime / this.metrics.totalLogs
            : 0,
      },
    };
  }

  // Alerting
  sendAlert(level, message, metadata = {}) {
    // In production, this would send to:
    // - Slack/Teams
    // - Email
    // - PagerDuty/OpsGenie
    // - etc.

    const alert = {
      level,
      message,
      metadata,
      timestamp: new Date().toISOString(),
      source: "AI_Agent_Logger",
    };

    // Log the alert
    this.error(`ALERT: ${message}`, {
      ...metadata,
      alert: true,
      alertLevel: level,
    });

    // Here you would implement actual alert sending
    // For now, just log it
    console.error("ALERT:", alert);
  }

  // Log file management
  async getLogFiles(days = 7) {
    const logDir = path.resolve(this.config.file.dirname);

    try {
      const files = await fs.readdir(logDir);
      const logFiles = files.filter(
        (file) =>
          file.includes(".log") &&
          !file.includes("exceptions") &&
          !file.includes("rejections")
      );

      const recentLogs = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      for (const file of logFiles) {
        const filePath = path.join(logDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime >= cutoffDate) {
          recentLogs.push({
            name: file,
            path: filePath,
            size: stats.size,
            modified: stats.mtime,
            age: Math.floor(
              (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24)
            ),
          });
        }
      }

      return recentLogs.sort((a, b) => b.modified - a.modified);
    } catch (error) {
      this.error("Failed to get log files", { error: error.message });
      return [];
    }
  }

  async searchLogs(query, options = {}) {
    const { level, agent, startDate, endDate, limit = 100 } = options;

    const logFiles = await this.getLogFiles(30); // Last 30 days

    const results = [];

    for (const logFile of logFiles) {
      if (results.length >= limit) break;

      try {
        const content = await fs.readFile(logFile.path, "utf8");
        const lines = content.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          if (results.length >= limit) break;

          try {
            const logEntry = JSON.parse(line);

            // Apply filters
            if (level && logEntry.level !== level.toUpperCase()) continue;
            if (agent && logEntry.agent !== agent) continue;
            if (startDate && new Date(logEntry.timestamp) < new Date(startDate))
              continue;
            if (endDate && new Date(logEntry.timestamp) > new Date(endDate))
              continue;

            // Search in message and metadata
            const searchableText = JSON.stringify(logEntry).toLowerCase();
            if (query && !searchableText.includes(query.toLowerCase()))
              continue;

            results.push(logEntry);
          } catch (parseError) {
            // Skip lines that aren't valid JSON
            continue;
          }
        }
      } catch (readError) {
        this.error("Failed to read log file", {
          file: logFile.name,
          error: readError.message,
        });
      }
    }

    return results.slice(0, limit);
  }

  // Create child logger for specific context
  createChildLogger(context) {
    return {
      log: (level, message, metadata = {}) => {
        this.log(level, message, { ...context, ...metadata });
      },
      error: (message, metadata = {}) => {
        this.error(message, { ...context, ...metadata });
      },
      warn: (message, metadata = {}) => {
        this.warn(message, { ...context, ...metadata });
      },
      info: (message, metadata = {}) => {
        this.info(message, { ...context, ...metadata });
      },
      debug: (message, metadata = {}) => {
        this.debug(message, { ...context, ...metadata });
      },
      ai: (agent, action, message, metadata = {}) => {
        this.ai(agent, action, message, { ...context, ...metadata });
      },
      startTransaction: (name, metadata = {}) => {
        return this.startTransaction(name, { ...context, ...metadata });
      },
      logAgentInteraction: (
        agentName,
        action,
        input,
        output,
        metadata = {}
      ) => {
        return this.logAgentInteraction(agentName, action, input, output, {
          ...context,
          ...metadata,
        });
      },
    };
  }

  // Cleanup old log files
  async cleanupOldLogs(daysToKeep = 30) {
    const logFiles = await this.getLogFiles(daysToKeep * 2); // Get more files than we need

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    let deletedCount = 0;

    for (const logFile of logFiles) {
      if (logFile.modified < cutoffDate) {
        try {
          await fs.unlink(logFile.path);
          deletedCount++;
          this.info(`Deleted old log file: ${logFile.name}`, {
            action: "log_cleanup",
            file: logFile.name,
            age: logFile.age,
          });
        } catch (error) {
          this.error("Failed to delete log file", {
            action: "log_cleanup",
            file: logFile.name,
            error: error.message,
          });
        }
      }
    }

    return {
      deleted: deletedCount,
      kept: logFiles.length - deletedCount,
      total: logFiles.length,
    };
  }
}

// Singleton instance
let loggerInstance = null;

function getLogger(config = {}) {
  if (!loggerInstance) {
    loggerInstance = new EnhancedLogger(config);
  }

  // Update config if provided
  if (Object.keys(config).length > 0) {
    loggerInstance.config = { ...loggerInstance.config, ...config };
  }

  return loggerInstance;
}

// Convenience function for quick logging
function log(level, message, metadata = {}) {
  const logger = getLogger();
  logger.log(level, message, metadata);
}

// Export convenience methods
module.exports = {
  EnhancedLogger,
  getLogger,
  log,

  // Convenience exports
  error: (message, metadata) => getLogger().error(message, metadata),
  warn: (message, metadata) => getLogger().warn(message, metadata),
  info: (message, metadata) => getLogger().info(message, metadata),
  debug: (message, metadata) => getLogger().debug(message, metadata),
  verbose: (message, metadata) => getLogger().verbose(message, metadata),
  http: (message, metadata) => getLogger().http(message, metadata),
  ai: (agent, action, message, metadata) =>
    getLogger().ai(agent, action, message, metadata),
};
