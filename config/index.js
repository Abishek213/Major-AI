const mongoose = require('mongoose');
require('dotenv').config();

// Configuration exports
const config = {
  port: process.env.AI_AGENT_PORT || 3001,
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/eventa_ai',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  langchain: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo',
    temperature: 0.7
  },
  agents: {
    user: ['event-recommendation', 'booking-support-agent', 'event-request-assistant'],
    organizer: ['dashboard-assistant', 'negotiation-agent', 'planning-agent'],
    admin: ['analytics-agent', 'feedback-sentiment', 'fraud-detection']
  }
};

// Initialize MongoDB connection
mongoose.connect(config.mongodb.uri, config.mongodb.options)
  .then(() => console.log('✅ AI Agent MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

module.exports = config;