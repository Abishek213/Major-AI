// Event-driven message bus for AI Agent communication
const EventEmitter = require("events");
const logger = require("../config/logger");

class MessageBus extends EventEmitter {
  constructor() {
    super();
    this.name = "message-bus";
    this.channels = new Map(); // channelName -> Set of subscribers
    this.queues = new Map(); // queueName -> Array of messages
    this.subscribers = new Map(); // subscriberId -> {channels, handler}
    this.messageLog = []; // For debugging and monitoring
    this.maxLogSize = 1000;
    this.status = "idle";
    this.messageCount = 0;
    this.agentConnections = new Map(); // agentName -> connection info
    this.workflowSubscriptions = new Map(); // workflowName -> Set of channels
  }

  async initialize() {
    logger.agent(this.name, "Initializing message bus");
    this.status = "initializing";

    try {
      // Initialize core channels
      await this.initializeCoreChannels();

      // Setup event listeners
      this.setupEventListeners();

      // Start monitoring
      this.startMonitoring();

      this.status = "ready";
      logger.success("Message bus initialized successfully");

      return {
        success: true,
        status: this.status,
        channels: Array.from(this.channels.keys()),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.status = "error";
      logger.error(`Failed to initialize message bus: ${error.message}`);
      throw error;
    }
  }

  async initializeCoreChannels() {
    // Core system channels
    const coreChannels = [
      "system.health",
      "agent.status",
      "workflow.progress",
      "agent.communication",
      "event.completed",
      "error.log",
      "debug.messages",
    ];

    coreChannels.forEach((channel) => {
      this.channels.set(channel, new Set());
    });

    logger.agent(this.name, `Initialized ${coreChannels.length} core channels`);
  }

  setupEventListeners() {
    // System event listeners
    this.on("agent.registered", this.handleAgentRegistered.bind(this));
    this.on("agent.unregistered", this.handleAgentUnregistered.bind(this));
    this.on("workflow.started", this.handleWorkflowStarted.bind(this));
    this.on("workflow.completed", this.handleWorkflowCompleted.bind(this));
    this.on("agent.message", this.handleAgentMessage.bind(this));

    // Error handling
    this.on("error", this.handleSystemError.bind(this));
  }

  startMonitoring() {
    // Periodic health check
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Every 30 seconds

    // Log cleanup
    this.logCleanupInterval = setInterval(() => {
      this.cleanupMessageLog();
    }, 60000); // Every minute

    logger.agent(this.name, "Started monitoring services");
  }

  async publish(channel, message, options = {}) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
      logger.agent(this.name, `Created new channel: ${channel}`);
    }

    const messageId = this.generateMessageId();
    const timestamp = new Date().toISOString();

    const fullMessage = {
      id: messageId,
      channel,
      data: message,
      timestamp,
      sender: options.sender || "system",
      correlationId: options.correlationId,
      messageType: options.messageType || "event",
      priority: options.priority || "normal",
      ttl: options.ttl || 3600, // Default 1 hour TTL
      ...options.metadata,
    };

    try {
      // Log the message
      this.logMessage(fullMessage);

      // Get subscribers for this channel
      const subscribers = this.channels.get(channel);

      if (subscribers && subscribers.size > 0) {
        // Deliver to all subscribers
        subscribers.forEach((subscriberId) => {
          const subscriber = this.subscribers.get(subscriberId);
          if (subscriber && subscriber.handler) {
            try {
              subscriber.handler(fullMessage);

              // Log successful delivery
              logger.agent(
                this.name,
                `Delivered message ${messageId} to ${subscriberId} on channel ${channel}`
              );
            } catch (error) {
              logger.error(
                `Failed to deliver message to ${subscriberId}: ${error.message}`
              );
            }
          }
        });

        this.messageCount++;
        return {
          success: true,
          messageId,
          channel,
          deliveredTo: subscribers.size,
          timestamp,
        };
      } else {
        // No subscribers, queue the message if persistent
        if (options.persistent) {
          this.queueMessage(channel, fullMessage);
        }

        return {
          success: true,
          messageId,
          channel,
          deliveredTo: 0,
          queued: options.persistent,
          timestamp,
        };
      }
    } catch (error) {
      logger.error(
        `Failed to publish message on channel ${channel}: ${error.message}`
      );
      return {
        success: false,
        error: error.message,
        messageId,
        channel,
      };
    }
  }

  async subscribe(channel, subscriberId, handler) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }

    const subscribers = this.channels.get(channel);

    if (subscribers.has(subscriberId)) {
      logger.warning(
        `Subscriber ${subscriberId} already subscribed to channel ${channel}`
      );
      return {
        success: false,
        error: "Already subscribed",
      };
    }

    subscribers.add(subscriberId);

    // Store subscriber info
    this.subscribers.set(subscriberId, {
      channels: new Set([channel]),
      handler,
      subscribedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    });

    logger.agent(
      this.name,
      `Subscriber ${subscriberId} subscribed to channel ${channel}`
    );

    // Deliver any queued messages
    await this.deliverQueuedMessages(channel, subscriberId);

    return {
      success: true,
      channel,
      subscriberId,
      subscribedAt: new Date().toISOString(),
    };
  }

  async subscribeToMultiple(channels, subscriberId, handler) {
    const results = [];

    for (const channel of channels) {
      const result = await this.subscribe(channel, subscriberId, handler);
      results.push(result);

      if (result.success) {
        // Update subscriber's channel list
        const subscriber = this.subscribers.get(subscriberId);
        if (subscriber) {
          subscriber.channels.add(channel);
        }
      }
    }

    return results;
  }

  async unsubscribe(channel, subscriberId) {
    if (!this.channels.has(channel)) {
      return {
        success: false,
        error: `Channel ${channel} does not exist`,
      };
    }

    const subscribers = this.channels.get(channel);
    const removed = subscribers.delete(subscriberId);

    if (removed) {
      // Update subscriber info
      const subscriber = this.subscribers.get(subscriberId);
      if (subscriber) {
        subscriber.channels.delete(channel);

        // Remove subscriber if no channels left
        if (subscriber.channels.size === 0) {
          this.subscribers.delete(subscriberId);
        }
      }

      logger.agent(
        this.name,
        `Subscriber ${subscriberId} unsubscribed from channel ${channel}`
      );

      return {
        success: true,
        channel,
        subscriberId,
        unsubscribedAt: new Date().toISOString(),
      };
    } else {
      return {
        success: false,
        error: `Subscriber ${subscriberId} not found on channel ${channel}`,
      };
    }
  }

  async unsubscribeFromAll(subscriberId) {
    const subscriber = this.subscribers.get(subscriberId);
    if (!subscriber) {
      return {
        success: false,
        error: `Subscriber ${subscriberId} not found`,
      };
    }

    const results = [];

    for (const channel of subscriber.channels) {
      const result = await this.unsubscribe(channel, subscriberId);
      results.push(result);
    }

    // Remove subscriber completely
    this.subscribers.delete(subscriberId);

    return {
      success: true,
      subscriberId,
      results,
      unsubscribedAt: new Date().toISOString(),
    };
  }

  async requestReply(channel, request, options = {}) {
    const requestId = this.generateMessageId();
    const replyChannel = `reply.${requestId}`;

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 30000; // Default 30 second timeout
      let timeoutId;

      // Subscribe to reply channel
      const subscriberId = `requester.${requestId}`;

      this.subscribe(replyChannel, subscriberId, (message) => {
        // Cleanup
        clearTimeout(timeoutId);
        this.unsubscribe(replyChannel, subscriberId);

        resolve(message.data);
      }).catch(reject);

      // Send the request
      this.publish(channel, request, {
        ...options,
        replyTo: replyChannel,
        correlationId: requestId,
        sender: options.sender || "requester",
      }).catch(reject);

      // Set timeout
      timeoutId = setTimeout(() => {
        this.unsubscribe(replyChannel, subscriberId).catch(() => {});
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  async broadcastToAgents(agentType, message, options = {}) {
    const channel = `agent.${agentType}.broadcast`;

    logger.agent(this.name, `Broadcasting to ${agentType} agents`);

    return this.publish(channel, message, {
      ...options,
      sender: "orchestrator",
      messageType: "broadcast",
    });
  }

  async sendToAgent(agentName, message, options = {}) {
    const channel = `agent.${agentName}.inbox`;

    return this.publish(channel, message, {
      ...options,
      sender: options.sender || "orchestrator",
      messageType: "direct",
      recipient: agentName,
    });
  }

  async sendToWorkflow(workflowName, message, options = {}) {
    const channel = `workflow.${workflowName}.commands`;

    return this.publish(channel, message, {
      ...options,
      sender: options.sender || "orchestrator",
      messageType: "workflow_command",
    });
  }

  async registerAgent(agentName, agentType) {
    const connectionInfo = {
      agentName,
      agentType,
      connectedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      channels: new Set([
        `agent.${agentName}.inbox`,
        `agent.${agentType}.broadcast`,
      ]),
      status: "connected",
    };

    this.agentConnections.set(agentName, connectionInfo);

    // Subscribe agent to its channels
    for (const channel of connectionInfo.channels) {
      if (!this.channels.has(channel)) {
        this.channels.set(channel, new Set());
      }
    }

    // Emit agent registered event
    this.emit("agent.registered", {
      agentName,
      agentType,
      timestamp: new Date().toISOString(),
    });

    logger.agent(this.name, `Agent registered: ${agentName} (${agentType})`);

    return {
      success: true,
      agentName,
      channels: Array.from(connectionInfo.channels),
      timestamp: connectionInfo.connectedAt,
    };
  }

  async unregisterAgent(agentName) {
    const connectionInfo = this.agentConnections.get(agentName);
    if (!connectionInfo) {
      return {
        success: false,
        error: `Agent ${agentName} not found`,
      };
    }

    // Unsubscribe from all channels
    for (const channel of connectionInfo.channels) {
      const subscribers = this.channels.get(channel);
      if (subscribers) {
        subscribers.delete(agentName);
      }
    }

    // Remove agent connection
    this.agentConnections.delete(agentName);

    // Emit agent unregistered event
    this.emit("agent.unregistered", {
      agentName,
      timestamp: new Date().toISOString(),
    });

    logger.agent(this.name, `Agent unregistered: ${agentName}`);

    return {
      success: true,
      agentName,
      unregisteredAt: new Date().toISOString(),
    };
  }

  async registerWorkflow(workflowName) {
    const workflowChannels = [
      `workflow.${workflowName}.commands`,
      `workflow.${workflowName}.events`,
      `workflow.${workflowName}.progress`,
    ];

    this.workflowSubscriptions.set(workflowName, new Set(workflowChannels));

    // Create channels if they don't exist
    workflowChannels.forEach((channel) => {
      if (!this.channels.has(channel)) {
        this.channels.set(channel, new Set());
      }
    });

    logger.agent(this.name, `Workflow registered: ${workflowName}`);

    return {
      success: true,
      workflowName,
      channels: workflowChannels,
      timestamp: new Date().toISOString(),
    };
  }

  async agentHeartbeat(agentName) {
    const connectionInfo = this.agentConnections.get(agentName);
    if (connectionInfo) {
      connectionInfo.lastHeartbeat = new Date().toISOString();
      connectionInfo.status = "healthy";

      return {
        success: true,
        agentName,
        lastHeartbeat: connectionInfo.lastHeartbeat,
      };
    } else {
      return {
        success: false,
        error: `Agent ${agentName} not found`,
      };
    }
  }

  async getAgentStatus(agentName = null) {
    if (agentName) {
      const connectionInfo = this.agentConnections.get(agentName);
      if (!connectionInfo) {
        return {
          success: false,
          error: `Agent ${agentName} not found`,
        };
      }

      return {
        success: true,
        agentName,
        ...connectionInfo,
        heartbeatAge: this.getHeartbeatAge(connectionInfo.lastHeartbeat),
      };
    } else {
      // Return all agents status
      const agents = Array.from(this.agentConnections.entries()).map(
        ([name, info]) => ({
          agentName: name,
          agentType: info.agentType,
          status: info.status,
          connectedAt: info.connectedAt,
          lastHeartbeat: info.lastHeartbeat,
          heartbeatAge: this.getHeartbeatAge(info.lastHeartbeat),
          channels: Array.from(info.channels),
        })
      );

      return {
        success: true,
        totalAgents: agents.length,
        agentsByType: this.countAgentsByType(),
        agents,
      };
    }
  }

  countAgentsByType() {
    const counts = { user: 0, organizer: 0, admin: 0, general: 0 };

    for (const info of this.agentConnections.values()) {
      counts[info.agentType] = (counts[info.agentType] || 0) + 1;
    }

    return counts;
  }

  getHeartbeatAge(lastHeartbeat) {
    const now = new Date();
    const heartbeatTime = new Date(lastHeartbeat);
    return Math.floor((now - heartbeatTime) / 1000); // Age in seconds
  }

  async getStatus() {
    return {
      status: this.status,
      connected: this.status === "ready",
      messageCount: this.messageCount,
      channelCount: this.channels.size,
      subscriberCount: this.subscribers.size,
      agentCount: this.agentConnections.size,
      workflowCount: this.workflowSubscriptions.size,
      queuedMessages: this.getQueuedMessageCount(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  async getChannelInfo(channel = null) {
    if (channel) {
      const subscribers = this.channels.get(channel);
      if (!subscribers) {
        return {
          success: false,
          error: `Channel ${channel} not found`,
        };
      }

      const subscriberList = Array.from(subscribers).map((subId) => {
        const sub = this.subscribers.get(subId);
        return {
          subscriberId: subId,
          subscribedAt: sub?.subscribedAt,
          lastActive: sub?.lastActive,
        };
      });

      return {
        success: true,
        channel,
        subscriberCount: subscribers.size,
        subscribers: subscriberList,
        messageHistory: this.getMessageHistoryForChannel(channel),
      };
    } else {
      // Return all channels
      const channelInfo = Array.from(this.channels.entries()).map(
        ([name, subscribers]) => ({
          name,
          subscriberCount: subscribers.size,
          hasQueue: this.queues.has(name),
        })
      );

      return {
        success: true,
        totalChannels: channelInfo.length,
        channels: channelInfo.sort(
          (a, b) => b.subscriberCount - a.subscriberCount
        ),
      };
    }
  }

  async getMessageHistory(limit = 50) {
    return {
      success: true,
      totalMessages: this.messageLog.length,
      messages: this.messageLog.slice(-limit).reverse(),
      timestamp: new Date().toISOString(),
    };
  }

  async performHealthCheck() {
    const healthCheck = {
      timestamp: new Date().toISOString(),
      status: this.status,
      channels: this.channels.size,
      subscribers: this.subscribers.size,
      agents: this.agentConnections.size,
      workflows: this.workflowSubscriptions.size,
      issues: [],
    };

    // Check for stale agents (no heartbeat in last 2 minutes)
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    for (const [agentName, info] of this.agentConnections.entries()) {
      const lastHeartbeat = new Date(info.lastHeartbeat);
      if (lastHeartbeat < twoMinutesAgo) {
        info.status = "stale";
        healthCheck.issues.push(
          `Agent ${agentName} is stale (last heartbeat: ${info.lastHeartbeat})`
        );
      }
    }

    // Check for channels with no subscribers
    for (const [channel, subscribers] of this.channels.entries()) {
      if (subscribers.size === 0 && !channel.startsWith("reply.")) {
        healthCheck.issues.push(`Channel ${channel} has no subscribers`);
      }
    }

    // Publish health check results
    if (healthCheck.issues.length > 0) {
      this.publish("system.health", healthCheck, {
        sender: "message-bus",
        messageType: "health_check",
      });
    }

    return healthCheck;
  }

  async shutdown() {
    logger.agent(this.name, "Shutting down message bus");
    this.status = "shutting_down";

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.logCleanupInterval) {
      clearInterval(this.logCleanupInterval);
    }

    // Clear all subscriptions
    this.channels.clear();
    this.subscribers.clear();
    this.queues.clear();
    this.agentConnections.clear();
    this.workflowSubscriptions.clear();

    // Clear event listeners
    this.removeAllListeners();

    this.status = "shutdown";
    logger.success("Message bus shutdown complete");

    return {
      success: true,
      message: "Message bus shutdown successfully",
      timestamp: new Date().toISOString(),
    };
  }

  // Internal helper methods
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  logMessage(message) {
    this.messageLog.push(message);

    // Trim log if too large
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog = this.messageLog.slice(-this.maxLogSize);
    }
  }

  cleanupMessageLog() {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    this.messageLog = this.messageLog.filter((msg) => {
      const msgTime = new Date(msg.timestamp);
      return msgTime > cutoffTime;
    });

    logger.agent(
      this.name,
      `Cleaned up message log: ${this.messageLog.length} messages remaining`
    );
  }

  queueMessage(channel, message) {
    if (!this.queues.has(channel)) {
      this.queues.set(channel, []);
    }

    const queue = this.queues.get(channel);
    queue.push(message);

    // Limit queue size
    if (queue.length > 1000) {
      queue.shift(); // Remove oldest message
    }
  }

  async deliverQueuedMessages(channel, subscriberId) {
    if (!this.queues.has(channel)) {
      return;
    }

    const queue = this.queues.get(channel);
    const subscriber = this.subscribers.get(subscriberId);

    if (!subscriber || !subscriber.handler) {
      return;
    }

    // Deliver queued messages
    while (queue.length > 0) {
      const message = queue.shift();
      try {
        subscriber.handler(message);
        logger.agent(
          this.name,
          `Delivered queued message ${message.id} to ${subscriberId}`
        );
      } catch (error) {
        logger.error(
          `Failed to deliver queued message to ${subscriberId}: ${error.message}`
        );
        // Put message back in queue
        queue.unshift(message);
        break;
      }
    }

    // Clean up empty queue
    if (queue.length === 0) {
      this.queues.delete(channel);
    }
  }

  getQueuedMessageCount() {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  getMessageHistoryForChannel(channel, limit = 20) {
    return this.messageLog
      .filter((msg) => msg.channel === channel)
      .slice(-limit)
      .reverse();
  }

  // Event handlers
  handleAgentRegistered(data) {
    logger.agent(this.name, `Agent registered: ${data.agentName}`);

    // Notify system about new agent
    this.publish(
      "agent.status",
      {
        event: "registered",
        ...data,
      },
      {
        sender: "message-bus",
        messageType: "system_event",
      }
    );
  }

  handleAgentUnregistered(data) {
    logger.agent(this.name, `Agent unregistered: ${data.agentName}`);

    this.publish(
      "agent.status",
      {
        event: "unregistered",
        ...data,
      },
      {
        sender: "message-bus",
        messageType: "system_event",
      }
    );
  }

  handleWorkflowStarted(data) {
    logger.agent(this.name, `Workflow started: ${data.workflowName}`);

    this.publish(
      "workflow.progress",
      {
        event: "started",
        ...data,
      },
      {
        sender: "message-bus",
        messageType: "workflow_event",
      }
    );
  }

  handleWorkflowCompleted(data) {
    logger.agent(this.name, `Workflow completed: ${data.workflowName}`);

    this.publish(
      "workflow.progress",
      {
        event: "completed",
        ...data,
      },
      {
        sender: "message-bus",
        messageType: "workflow_event",
      }
    );
  }

  handleAgentMessage(data) {
    // Log agent communication
    logger.agent(
      data.sender,
      `Message to ${data.recipient}: ${JSON.stringify(data.data).substring(
        0,
        100
      )}...`
    );
  }

  handleSystemError(error) {
    logger.error(`Message bus error: ${error.message}`);

    // Publish error to error log
    this.publish(
      "error.log",
      {
        source: "message-bus",
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
      {
        sender: "message-bus",
        messageType: "error",
      }
    );
  }
}

module.exports = MessageBus;
