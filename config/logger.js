class Logger {
  constructor() {
    this.colors = {
      info: '\x1b[36m', // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
      agent: '\x1b[35m', // Magenta
      reset: '\x1b[0m'
    };
  }

  log(level, message, agent = null) {
    const timestamp = new Date().toISOString();
    const color = this.colors[level] || this.colors.info;
    const agentTag = agent ? `[${agent}] ` : '';
    
    console.log(`${color}[${timestamp}] [${level.toUpperCase()}] ${agentTag}${message}${this.colors.reset}`);
    
    // Also log to file in production
    if (process.env.NODE_ENV === 'production') {
      // Add file logging here
    }
  }

  info(message, agent = null) {
    this.log('info', message, agent);
  }

  success(message, agent = null) {
    this.log('success', message, agent);
  }

  warning(message, agent = null) {
    this.log('warning', message, agent);
  }

  error(message, agent = null) {
    this.log('error', message, agent);
  }

  agent(agentName, action, details = '') {
    this.log('agent', `${action} ${details}`, agentName);
  }
}

module.exports = new Logger();