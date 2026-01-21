// config/index.js - UPDATED VERSION
const mongoose = require('mongoose');
require('dotenv').config();

// Configuration exports
const config = {
  port: process.env.AI_AGENT_PORT || 3001,
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/eventa_ai',
    options: {} // REMOVE deprecated options
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

// Initialize MongoDB connection (WITHOUT deprecated options)
mongoose.connect(config.mongodb.uri)
  .then(() => console.log('✅ AI Agent MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('⚠️ Continuing without database connection...');
  });

module.exports = config;