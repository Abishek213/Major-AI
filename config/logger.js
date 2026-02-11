const fs = require("fs").promises;
const path = require("path");

class Logger {
  constructor() {
    this.colors = {
      info: "\x1b[36m",
      success: "\x1b[32m",
      warning: "\x1b[33m",
      error: "\x1b[31m",
      agent: "\x1b[35m",
      debug: "\x1b[90m",
      reset: "\x1b[0m",
    };

    this.debugEnabled =
      process.env.DEBUG === "true" || process.env.NODE_ENV === "development";

    this.logDir = process.env.LOG_DIR || path.join(__dirname, "../../logs");
    this.maxLogAge = 30;

    if (process.env.NODE_ENV === "production") {
      this.initializeLogDirectory();
    }
  }

  async initializeLogDirectory() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create log directory:", error.message);
    }
  }

  /**
   * Core logging method - handles all log types
   * @param {string} level - Log level (info, success, warning, error, debug, agent)
   * @param {string|object|Error} message - Message to log
   * @param {string|null} agent - Optional agent name
   */
  log(level, message, agent = null) {
    const timestamp = new Date().toISOString();
    const color = this.colors[level] || this.colors.info;
    const agentTag = agent ? `[${agent}] ` : "";

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

    console.log(
      `${color}[${timestamp}] [${level.toUpperCase()}] ${agentTag}${logMessage}${
        this.colors.reset
      }`
    );
    if (process.env.NODE_ENV === "production") {
      this.logToFile(level, logMessage, agent, timestamp).catch((err) => {
        console.error("Log file write failed:", err.message);
      });
    }
  }

  /**
   * Info level logging
   * @param {string|object|Error} message - Message to log
   * @param {string|null} agent - Optional agent name
   */
  info(message, agent = null) {
    this.log("info", message, agent);
  }

  /**
   * Success level logging
   * @param {string|object|Error} message - Message to log
   * @param {string|null} agent - Optional agent name
   */
  success(message, agent = null) {
    this.log("success", message, agent);
  }

  /**
   * Warning level logging
   * @param {string|object|Error} message - Message to log
   * @param {string|null} agent - Optional agent name
   */
  warning(message, agent = null) {
    this.log("warning", message, agent);
  }

  /**
   * Alias for warning (common convention)
   * @param {string|object|Error} message - Message to log
   * @param {string|null} agent - Optional agent name
   */
  warn(message, agent = null) {
    this.log("warning", message, agent);
  }

  /**
   * Error level logging
   * @param {string|object|Error} message - Message to log
   * @param {string|null} agent - Optional agent name
   */
  error(message, agent = null) {
    this.log("error", message, agent);
  }

  /**
   * Debug level logging (only in debug mode)
   * @param {string|object|Error} message - Message to log
   * @param {string|null} agent - Optional agent name
   */
  debug(message, agent = null) {
    if (this.debugEnabled) {
      this.log("debug", message, agent);
    }
  }

  /**
   * Agent-specific logging
   * @param {string} agentName - Name of the agent
   * @param {string} action - Action being performed
   * @param {string} details - Optional details
   */
  agent(agentName, action, details = "") {
    const message = details ? `${action} - ${details}` : action;
    this.log("agent", message, agentName);
  }

  /**
   * Log to file (production only)
   * @param {string} level - Log level
   * @param {string} message - Formatted message
   * @param {string|null} agent - Agent name
   * @param {string} timestamp - ISO timestamp
   */
  async logToFile(level, message, agent, timestamp) {
    try {
      await fs.mkdir(this.logDir, { recursive: true });

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(this.logDir, `app-${date}.log`);
      const errorLogFile = path.join(this.logDir, `error-${date}.log`);

      const agentTag = agent ? `[${agent}] ` : "";
      const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${agentTag}${message}\n`;

      await fs.appendFile(logFile, logEntry, "utf8");

      if (level === "error") {
        await fs.appendFile(errorLogFile, logEntry, "utf8");
      }

      this.cleanupOldLogs().catch(() => {});
    } catch (error) {
      console.error("Failed to write to log file:", error.message);
    }
  }

  async cleanupOldLogs() {
    try {
      const lastCleanupFile = path.join(this.logDir, ".last-cleanup");
      const today = new Date().toISOString().split("T")[0];

      try {
        const lastCleanup = await fs.readFile(lastCleanupFile, "utf8");
        if (lastCleanup.trim() === today) {
          return;
        }
      } catch (err) {}

      const files = await fs.readdir(this.logDir);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.maxLogAge);

      for (const file of files) {
        if (!file.match(/^(app|error)-\d{4}-\d{2}-\d{2}\.log$/)) {
          continue;
        }

        const filePath = path.join(this.logDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          this.debug(`Deleted old log file: ${file}`, "Logger");
        }
      }

      await fs.writeFile(lastCleanupFile, today, "utf8");
    } catch (error) {
      console.error("Log cleanup failed:", error.message);
    }
  }

  /**
   * Performance logging with color-coded duration
   * @param {string} operation - Operation name
   * @param {number} startTime - Start time from Date.now()
   * @param {string|null} agent - Optional agent name
   */
  performance(operation, startTime, agent = null) {
    const duration = Date.now() - startTime;
    const message = `${operation} completed in ${duration}ms`;

    if (duration < 100) {
      this.success(message, agent);
    } else if (duration < 1000) {
      this.info(message, agent);
    } else {
      this.warning(message, agent);
    }
  }

  /**
   * Start a console group (for organizing logs)
   * @param {string} label - Group label
   */
  group(label) {
    console.group(`\n${this.colors.info}━━━ ${label} ━━━${this.colors.reset}`);
  }

  /**
   * End a console group
   */
  groupEnd() {
    console.groupEnd();
    console.log("");
  }

  /**
   * Print a separator line
   */
  separator() {
    console.log(`${this.colors.info}${"─".repeat(80)}${this.colors.reset}`);
  }

  /**
   * Custom logging with custom color
   * @param {string} message - Message to log
   * @param {string} colorCode - ANSI color code
   * @param {string|null} agent - Optional agent name
   */
  custom(message, colorCode, agent = null) {
    const timestamp = new Date().toISOString();
    const agentTag = agent ? `[${agent}] ` : "";
    console.log(
      `${colorCode}[${timestamp}] [CUSTOM] ${agentTag}${message}${this.colors.reset}`
    );
  }

  /**
   * Log an object as formatted JSON
   * @param {object} obj - Object to log
   * @param {string} label - Optional label
   * @param {string|null} agent - Optional agent name
   */
  json(obj, label = "JSON Output", agent = null) {
    if (label) this.info(`${label}:`, agent);
    console.log(JSON.stringify(obj, null, 2));
  }

  /**
   * Log data as a table
   * @param {array|object} data - Data to display in table
   * @param {string|null} label - Optional label
   */
  table(data, label = null) {
    if (label) this.info(label);
    console.table(data);
  }

  /**
   * Get current logger configuration
   * @returns {object} Logger configuration
   */
  getConfig() {
    return {
      debugEnabled: this.debugEnabled,
      logDir: this.logDir,
      maxLogAge: this.maxLogAge,
      nodeEnv: process.env.NODE_ENV || "development",
      fileLoggingEnabled: process.env.NODE_ENV === "production",
    };
  }

  /**
   * Log startup banner with system info
   * @param {string} appName - Application name
   * @param {string} version - Application version
   */
  banner(appName, version) {
    this.separator();
    console.log(`${this.colors.info}
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ${appName.padEnd(61)}    ║
║   Version: ${version.padEnd(53)}    ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
${this.colors.reset}`);
    this.info(`Environment: ${process.env.NODE_ENV || "development"}`);
    this.info(`Node Version: ${process.version}`);
    this.info(`Debug Mode: ${this.debugEnabled ? "ENABLED" : "DISABLED"}`);
    if (process.env.NODE_ENV === "production") {
      this.info(`Log Directory: ${this.logDir}`);
      this.info(`Log Retention: ${this.maxLogAge} days`);
    }
    this.separator();
  }

  /**
   * Create a child logger with a fixed agent name
   * @param {string} agentName - Name of the agent
   * @returns {object} Child logger with agent pre-filled
   */
  child(agentName) {
    return {
      info: (message) => this.info(message, agentName),
      success: (message) => this.success(message, agentName),
      warning: (message) => this.warning(message, agentName),
      warn: (message) => this.warn(message, agentName),
      error: (message) => this.error(message, agentName),
      debug: (message) => this.debug(message, agentName),
      agent: (action, details) => this.agent(agentName, action, details),
      performance: (operation, startTime) =>
        this.performance(operation, startTime, agentName),
      json: (obj, label) => this.json(obj, label, agentName),
    };
  }
}

module.exports = new Logger();
