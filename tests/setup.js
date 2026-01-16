/**
 * Test setup and configuration
 * Runs before all tests
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const path = require("path");

// Increase timeout for tests
jest.setTimeout(30000);

// Global test configuration
global.testConfig = {
  mongoServer: null,
  mongoUri: null,

  // Test data
  testUsers: [],
  testEvents: [],
  testAgents: [],

  // Mock data
  mockTransactions: [],
  mockFeedback: [],
  mockAnalytics: [],
};

// Setup before all tests
beforeAll(async () => {
  console.log("🚀 Setting up test environment...");

  // Start in-memory MongoDB
  global.testConfig.mongoServer = await MongoMemoryServer.create();
  global.testConfig.mongoUri = global.testConfig.mongoServer.getUri();

  // Connect to test database
  await mongoose.connect(global.testConfig.mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log("✅ Test database connected");

  // Load test data
  await loadTestData();
});

// Cleanup after all tests
afterAll(async () => {
  console.log("🧹 Cleaning up test environment...");

  // Disconnect from database
  await mongoose.disconnect();

  // Stop in-memory MongoDB
  if (global.testConfig.mongoServer) {
    await global.testConfig.mongoServer.stop();
  }

  console.log("✅ Test environment cleaned up");
});

// Setup before each test
beforeEach(async () => {
  // Clear all collections
  const collections = mongoose.connection.collections;

  for (const key in collections) {
    await collections[key].deleteMany();
  }

  // Re-seed test data
  await loadTestData();
});

// Load test data
async function loadTestData() {
  const { faker } = require("@faker-js/faker");

  // Create test users
  global.testConfig.testUsers = Array.from({ length: 10 }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(),
    email: `testuser${i}@example.com`,
    name: faker.name.findName(),
    role: i === 0 ? "admin" : i < 4 ? "organizer" : "user",
    is_verified: true,
    createdAt: new Date(),
  }));

  // Create test events
  global.testConfig.testEvents = Array.from({ length: 5 }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(),
    name: `Test Event ${i + 1}`,
    description: faker.lorem.paragraph(),
    category: ["Music", "Tech", "Art", "Sports", "Food"][i],
    start_date: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
    end_date: new Date(Date.now() + (i + 2) * 24 * 60 * 60 * 1000),
    location: faker.address.streetAddress(),
    capacity: faker.datatype.number({ min: 50, max: 500 }),
    price: faker.datatype.number({ min: 0, max: 100 }),
    organizer_id: global.testConfig.testUsers[1]._id,
    status: "published",
  }));

  // Create test AI agents
  global.testConfig.testAgents = [
    {
      _id: new mongoose.Types.ObjectId(),
      name: "Test Recommendation Agent",
      agent_type: "event-recommendation",
      status: "active",
      configuration: {
        model: "gpt-3.5-turbo",
        temperature: 0.7,
        max_tokens: 1000,
      },
    },
    {
      _id: new mongoose.Types.ObjectId(),
      name: "Test Fraud Detection Agent",
      agent_type: "fraud-detection",
      status: "active",
      configuration: {
        model: "custom-ml-model",
        threshold: 0.8,
      },
    },
  ];

  // Create mock transactions for fraud detection tests
  global.testConfig.mockTransactions = Array.from({ length: 20 }, (_, i) => ({
    id: `txn_${i}`,
    user_id: global.testConfig.testUsers[i % 3]._id.toString(),
    amount: faker.datatype.number({ min: 10, max: 1000 }),
    payment_method: ["credit_card", "khalti", "esewa"][i % 3],
    timestamp: Date.now() - i * 3600000,
    payment_status: i % 5 === 0 ? "failed" : "completed",
    device_info: {
      type: ["mobile", "desktop"][i % 2],
      browser: "chrome",
      os: "windows",
    },
    ip_address: `192.168.1.${i + 1}`,
    session_duration: faker.datatype.number({ min: 30, max: 1800 }),
  }));

  // Create mock feedback for sentiment analysis tests
  global.testConfig.mockFeedback = [
    {
      id: "feedback_1",
      text: "This event was absolutely amazing! I loved every minute of it.",
      rating: 5,
      user_id: global.testConfig.testUsers[0]._id.toString(),
      event_id: global.testConfig.testEvents[0]._id.toString(),
    },
    {
      id: "feedback_2",
      text: "Terrible experience. The organization was poor and the venue was dirty.",
      rating: 1,
      user_id: global.testConfig.testUsers[1]._id.toString(),
      event_id: global.testConfig.testEvents[1]._id.toString(),
    },
    {
      id: "feedback_3",
      text: "It was okay. Could be better with more interactive sessions.",
      rating: 3,
      user_id: global.testConfig.testUsers[2]._id.toString(),
      event_id: global.testConfig.testEvents[2]._id.toString(),
    },
  ];

  // Create mock analytics data
  global.testConfig.mockAnalytics = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    bookings: faker.datatype.number({ min: 10, max: 100 }),
    revenue: faker.datatype.number({ min: 1000, max: 10000 }),
    active_users: faker.datatype.number({ min: 50, max: 500 }),
    event_type: ["Music", "Tech", "Art", "Sports", "Food"][i % 5],
  }));

  console.log("✅ Test data loaded");
}

// Test utilities
global.testUtils = {
  // Wait for a condition
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) return true;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  },

  // Mock HTTP requests
  mockHttp: (status = 200, data = {}) => {
    return {
      status,
      data,
      config: {},
      headers: {},
      statusText: status === 200 ? "OK" : "Error",
    };
  },

  // Generate test ID
  generateTestId: () => {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  // Clean test strings
  cleanString: (str) => {
    return str.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  },
};

// Export test utilities
module.exports = {
  testConfig: global.testConfig,
  testUtils: global.testUtils,
};
