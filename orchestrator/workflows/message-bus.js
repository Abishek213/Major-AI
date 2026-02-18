const EventEmitter = require('events');
const axios = require('axios');

class MessageBus extends EventEmitter {
  constructor() {
    super();
    this.BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';
  }


  async initialize() {
    console.log('✅ MessageBus initialized');
    return true;
  }

  async publish(topic, data, options = {}) {
    try {
      const message = {
        id: `msg_${Date.now()}`,
        topic,
        data,
        timestamp: new Date().toISOString(),
        sender: options.sender || 'ai-service'
      };

      // Emit locally for any local subscribers
      this.emit(topic, message);

      // For negotiation topics, call backend API directly
      if (topic.startsWith('negotiation.response')) {
        // Extract eventRequestId from topic
        const eventRequestId = topic.split('.')[2];
        
        // Call backend's negotiation endpoint
        await axios.post(
          `${this.BACKEND_URL}/api/negotiation/ai-response`,
          {
            eventRequestId,
            response: data,
            correlationId: options.correlationId
          },
          { timeout: 5000 }
        );
      }

      return { success: true, messageId: message.id };
    } catch (error) {
      console.error('MessageBus publish error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async subscribe(topic, subscriberId, handler) {
    this.on(topic, handler);
    return { success: true };
  }
}

module.exports = MessageBus;