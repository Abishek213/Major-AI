const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Initialize configurations
require('./config/index');

const app = express();
const PORT = process.env.AI_AGENT_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const agentRoutes = require('./api/index');

// Routes
app.use('/api/ai', agentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'AI Agent System Running', 
    timestamp: new Date().toISOString(),
    agents_available: {
      user: ['event-recommendation', 'booking-support-agent', 'event-request-assistant'],
      organizer: ['dashboard-assistant', 'negotiation-agent', 'planning-agent'],
      admin: ['analytics-agent', 'feedback-sentiment', 'fraud-detection']
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('AI Agent Error:', err);
  res.status(500).json({ error: 'Internal AI Agent Server Error' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🤖 e-VENTA AI Agent System running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 API Endpoint: http://localhost:${PORT}/api/ai`);
  });
}

module.exports = app;