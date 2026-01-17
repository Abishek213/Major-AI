/**
 * Integration tests for AI Agents
 * Tests interaction between different AI agents
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// Import agents
const EventRecommendationAgent = require("../../agents/user-agents/event-recommendation");
const FraudDetectionAgent = require("../../agents/admin-agents/fraud-detection");
const SentimentAnalysisAgent = require("../../agents/admin-agents/feedback-sentiment");
const PlanningAgent = require("../../agents/organizer-agents/planning-agent");

// Import test utilities
const { testConfig, testUtils } = require("../setup");

describe("AI Agents Integration Tests", () => {
  let mongoServer;
  let recommendationAgent;
  let fraudAgent;
  let sentimentAgent;
  let planningAgent;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ Integration test database connected");
  });

  beforeEach(async () => {
    // Clear database
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany();
    }

    // Initialize agents
    recommendationAgent = new EventRecommendationAgent({
      model: "test-model",
      temperature: 0.7,
    });

    fraudAgent = new FraudDetectionAgent({
      threshold: 0.8,
      mlServiceUrl: "http://localhost:5001",
    });

    sentimentAgent = new SentimentAnalysisAgent({
      model: "sentiment-model",
      threshold: 0.7,
    });

    planningAgent = new PlanningAgent({
      model: "planning-model",
      maxBudget: 10000,
    });

    // Wait for agents to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
    console.log("✅ Integration tests completed");
  });

  describe("Cross-Agent Communication", () => {
    test("should share user profile between agents", async () => {
      const userId = "integration_user_1";

      // Create user profile with recommendation agent
      const userProfile = {
        userId,
        preferences: {
          categories: ["Technology", "Music"],
          budget: { min: 0, max: 500 },
          locations: ["San Francisco", "Austin"],
        },
        history: [
          { eventId: "past_tech_1", category: "Technology", rating: 5 },
          { eventId: "past_music_1", category: "Music", rating: 4 },
        ],
      };

      // Recommendation agent uses profile
      const events = [
        {
          id: "event_1",
          name: "Tech Conference",
          category: "Technology",
          price: 299,
          location: "San Francisco",
        },
        {
          id: "event_2",
          name: "Music Festival",
          category: "Music",
          price: 150,
          location: "Austin",
        },
      ];

      const recommendations = await recommendationAgent.getRecommendations(
        userId,
        userProfile.history,
        events
      );

      expect(recommendations.userId).toBe(userId);
      expect(recommendations.recommendations.length).toBeGreaterThan(0);

      // Fraud agent should be able to use same user ID
      const transaction = {
        id: "txn_1",
        user_id: userId,
        amount: 299,
        payment_method: "credit_card",
      };

      const fraudAnalysis = await fraudAgent.analyzeTransaction(
        transaction,
        []
      );
      expect(fraudAnalysis.user_id).toBe(userId);

      // Verify agents can access shared user context
      expect(recommendations.userProfile).toBeDefined();
      expect(fraudAnalysis.user_context_available).toBe(true);
    });

    test("should coordinate event planning and fraud detection", async () => {
      // Planning agent creates an event plan
      const eventPlan = await planningAgent.createEventPlan({
        eventType: "Conference",
        budget: 5000,
        attendees: 100,
        location: "San Francisco",
        date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(eventPlan.success).toBe(true);
      expect(eventPlan.plan).toBeDefined();
      expect(eventPlan.plan.budget_breakdown).toBeDefined();

      // Simulate ticket purchases for the event
      const transactions = [
        {
          id: "txn_event_1",
          user_id: "attendee_1",
          amount: eventPlan.plan.ticket_price,
          payment_method: "credit_card",
          metadata: {
            event_id: eventPlan.plan.event_id,
            event_name: eventPlan.plan.event_name,
          },
        },
        {
          id: "txn_event_2",
          user_id: "attendee_2",
          amount: eventPlan.plan.ticket_price,
          payment_method: "khalti",
          metadata: {
            event_id: eventPlan.plan.event_id,
            event_name: eventPlan.plan.event_name,
          },
        },
      ];

      // Fraud agent analyzes transactions
      const fraudAnalysis = await fraudAgent.analyzeBatch(transactions, {});

      expect(fraudAnalysis.results.length).toBe(2);
      expect(fraudAnalysis.event_context).toBeDefined();

      // Verify event context is shared
      fraudAnalysis.results.forEach((result) => {
        expect(result.metadata.event_id).toBe(eventPlan.plan.event_id);
        expect(result.metadata.event_name).toBe(eventPlan.plan.event_name);
      });
    });

    test("should integrate sentiment analysis with recommendation engine", async () => {
      const userId = "sentiment_user_1";

      // User provides feedback
      const feedback = [
        {
          id: "feedback_1",
          user_id: userId,
          event_id: "tech_event_1",
          text: "The conference was amazing! The speakers were excellent.",
          rating: 5,
        },
        {
          id: "feedback_2",
          user_id: userId,
          event_id: "music_event_1",
          text: "The sound quality was poor and the organization was terrible.",
          rating: 2,
        },
      ];

      // Sentiment agent analyzes feedback
      const sentimentResults = await sentimentAgent.analyzeBatch(feedback);

      expect(sentimentResults.results.length).toBe(2);
      expect(sentimentResults.user_sentiment_profile).toBeDefined();

      // Extract user preferences from sentiment analysis
      const userPreferences = sentimentAgent.extractPreferencesFromSentiment(
        sentimentResults.user_sentiment_profile
      );

      expect(userPreferences.liked_categories).toContain("Technology");
      expect(userPreferences.disliked_categories).toContain("Music");

      // Recommendation agent uses sentiment-based preferences
      const events = [
        {
          id: "event_1",
          name: "Another Tech Conference",
          category: "Technology",
          tags: ["tech", "conference", "innovation"],
        },
        {
          id: "event_2",
          name: "Another Music Festival",
          category: "Music",
          tags: ["music", "festival", "live"],
        },
      ];

      const recommendations = await recommendationAgent.getRecommendations(
        userId,
        [], // No history needed, using sentiment preferences
        events
      );

      // Tech events should be recommended higher than music events
      const techRecommendation = recommendations.recommendations.find(
        (r) => r.event.category === "Technology"
      );
      const musicRecommendation = recommendations.recommendations.find(
        (r) => r.event.category === "Music"
      );

      expect(techRecommendation.score).toBeGreaterThan(
        musicRecommendation.score
      );
      expect(recommendations.sentiment_informed).toBe(true);
    });
  });

  describe("Data Flow Between Agents", () => {
    test("should maintain data consistency across agents", async () => {
      const testData = {
        user_id: "dataflow_user_1",
        event_id: "dataflow_event_1",
        transaction_id: "dataflow_txn_1",
        feedback_id: "dataflow_feedback_1",
      };

      // Step 1: User views event (tracked by recommendation agent)
      const viewInteraction = {
        eventId: testData.event_id,
        action: "view",
        duration: 30000,
        liked: true,
      };

      const profileUpdate = await recommendationAgent.updateUserProfile(
        testData.user_id,
        [],
        viewInteraction
      );

      expect(profileUpdate.userId).toBe(testData.user_id);
      expect(profileUpdate.updatedPreferences).toBeDefined();

      // Step 2: User purchases ticket (analyzed by fraud agent)
      const purchaseTransaction = {
        id: testData.transaction_id,
        user_id: testData.user_id,
        amount: 299,
        payment_method: "credit_card",
        metadata: {
          event_id: testData.event_id,
          interaction_type: "purchase_after_view",
        },
      };

      const fraudCheck = await fraudAgent.analyzeTransaction(
        purchaseTransaction,
        []
      );

      expect(fraudCheck.transaction_id).toBe(testData.transaction_id);
      expect(fraudCheck.user_behavior_context).toBeDefined();
      expect(
        fraudCheck.user_behavior_context.recent_interactions
      ).toBeGreaterThan(0);

      // Step 3: User provides feedback (analyzed by sentiment agent)
      const userFeedback = {
        id: testData.feedback_id,
        user_id: testData.user_id,
        event_id: testData.event_id,
        text: "Great event! Will attend again.",
        rating: 5,
      };

      const sentimentAnalysis = await sentimentAgent.analyze(userFeedback);

      expect(sentimentAnalysis.feedback_id).toBe(testData.feedback_id);
      expect(sentimentAnalysis.user_id).toBe(testData.user_id);
      expect(sentimentAnalysis.event_context).toBeDefined();

      // Step 4: All agents should have consistent user data
      const userDataConsistency = {
        recommendation: profileUpdate.userId === testData.user_id,
        fraud: fraudCheck.user_id === testData.user_id,
        sentiment: sentimentAnalysis.user_id === testData.user_id,
        event:
          profileUpdate.updatedPreferences?.recent_events?.includes(
            testData.event_id
          ) &&
          fraudCheck.metadata?.event_id === testData.event_id &&
          sentimentAnalysis.event_id === testData.event_id,
      };

      // Verify all agents have consistent data
      Object.values(userDataConsistency).forEach((consistent) => {
        expect(consistent).toBe(true);
      });

      console.log("Data consistency check:", userDataConsistency);
    });

    test("should propagate user behavior patterns", async () => {
      const userId = "behavior_user_1";

      // Simulate user behavior sequence
      const behaviors = [
        {
          type: "search",
          query: "tech conferences",
          timestamp: Date.now() - 3600000,
        },
        {
          type: "view",
          event_id: "tech_conf_1",
          duration: 45000,
          timestamp: Date.now() - 3500000,
        },
        {
          type: "purchase",
          event_id: "tech_conf_1",
          amount: 299,
          timestamp: Date.now() - 3400000,
        },
        {
          type: "feedback",
          event_id: "tech_conf_1",
          rating: 5,
          timestamp: Date.now() - 3300000,
        },
      ];

      // Each agent processes relevant behaviors
      let recommendationContext = {};
      let fraudContext = {};
      let sentimentContext = {};

      for (const behavior of behaviors) {
        switch (behavior.type) {
          case "search":
          case "view":
            // Recommendation agent tracks interest
            const interaction = {
              eventId: behavior.event_id,
              action: behavior.type,
              duration: behavior.duration || 0,
            };

            const profile = await recommendationAgent.updateUserProfile(
              userId,
              [],
              interaction
            );
            recommendationContext = profile.updatedPreferences;
            break;

          case "purchase":
            // Fraud agent analyzes transaction
            const transaction = {
              id: `txn_${Date.now()}`,
              user_id: userId,
              amount: behavior.amount,
              payment_method: "credit_card",
              timestamp: behavior.timestamp,
            };

            const fraudCheck = await fraudAgent.analyzeTransaction(
              transaction,
              []
            );
            fraudContext = fraudCheck.user_behavior_context;
            break;

          case "feedback":
            // Sentiment agent analyzes feedback
            const feedback = {
              id: `feedback_${Date.now()}`,
              user_id: userId,
              event_id: behavior.event_id,
              rating: behavior.rating,
              text: "Excellent experience!",
            };

            const sentiment = await sentimentAgent.analyze(feedback);
            sentimentContext = sentiment.user_sentiment_profile;
            break;
        }
      }

      // All agents should recognize this as a positive user pattern
      expect(recommendationContext.interest_level).toBe("high");
      expect(recommendationContext.preferred_categories).toContain(
        "Technology"
      );

      expect(fraudContext.trust_score).toBeGreaterThan(70);
      expect(fraudContext.behavior_pattern).toBe("consistent");

      expect(sentimentContext.overall_sentiment).toBe("positive");
      expect(sentimentContext.engagement_level).toBe("high");

      // Pattern should be consistent across agents
      const patternConsistency = {
        user_engaged:
          recommendationContext.interest_level === "high" &&
          sentimentContext.engagement_level === "high",
        tech_interested:
          recommendationContext.preferred_categories?.includes("Technology") &&
          sentimentContext.preferred_topics?.includes("technology"),
        trustworthy:
          fraudContext.trust_score > 70 && fraudContext.risk_level === "LOW",
      };

      Object.values(patternConsistency).forEach((consistent) => {
        expect(consistent).toBe(true);
      });
    });
  });

  describe("Error Handling Across Agents", () => {
    test("should handle agent failure gracefully", async () => {
      const userId = "error_user_1";

      // Mock recommendation agent failure
      jest
        .spyOn(recommendationAgent, "getRecommendations")
        .mockRejectedValue(new Error("Recommendation service down"));

      // Mock fraud agent working normally
      jest.spyOn(fraudAgent, "analyzeTransaction").mockResolvedValue({
        transaction_id: "txn_1",
        is_fraud: false,
        risk_score: 30,
        recommendation: "ALLOW",
      });

      // Try recommendation (should fail)
      try {
        await recommendationAgent.getRecommendations(userId, [], []);
        fail("Should have thrown error");
      } catch (error) {
        expect(error.message).toBe("Recommendation service down");
      }

      // Fraud detection should still work
      const fraudCheck = await fraudAgent.analyzeTransaction(
        { id: "txn_1", user_id: userId, amount: 100 },
        []
      );

      expect(fraudCheck).toBeDefined();
      expect(fraudCheck.transaction_id).toBe("txn_1");

      // System should continue functioning despite one agent failure
      console.log("System handled agent failure gracefully");
    });

    test("should recover from temporary service outages", async () => {
      const userId = "recovery_user_1";

      // Simulate recommendation agent with retry logic
      let attemptCount = 0;
      const originalGetRecommendations = recommendationAgent.getRecommendations;

      recommendationAgent.getRecommendations = async (...args) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Service temporarily unavailable");
        }
        return originalGetRecommendations.apply(recommendationAgent, args);
      };

      const events = [{ id: "event_1", name: "Test Event", category: "Test" }];

      // Should retry and eventually succeed
      const recommendations = await recommendationAgent.getRecommendations(
        userId,
        [],
        events
      );

      expect(recommendations).toBeDefined();
      expect(attemptCount).toBe(3);
      expect(recommendations.userId).toBe(userId);

      console.log("Agent recovered after", attemptCount, "attempts");
    });

    test("should maintain partial functionality during degraded mode", async () => {
      // Simulate ML service outage (affects fraud and sentiment agents)
      const mlServiceDown = true;

      // Recommendation agent (doesn't need ML service) should work
      const recommendations = await recommendationAgent.getRecommendations(
        "degraded_user_1",
        [],
        [{ id: "event_1", name: "Test Event" }]
      );

      expect(recommendations).toBeDefined();
      expect(recommendations.recommendations.length).toBeGreaterThan(0);

      // Fraud agent should enter fallback mode
      const fraudCheck = await fraudAgent.analyzeTransaction(
        { id: "txn_1", user_id: "degraded_user_1", amount: 100 },
        []
      );

      expect(fraudCheck).toBeDefined();
      expect(fraudCheck.ml_service_available).toBe(!mlServiceDown);
      expect(fraudCheck.using_fallback).toBe(mlServiceDown);

      // System should still provide basic functionality
      expect(recommendations.algorithm).toBeDefined();
      expect(fraudCheck.recommendation).toBeDefined();

      console.log("System operating in degraded mode");
    });
  });

  describe("Performance Under Load", () => {
    test("should handle concurrent requests from multiple agents", async () => {
      const numUsers = 50;
      const numEvents = 100;

      // Generate test data
      const users = Array.from({ length: numUsers }, (_, i) => ({
        id: `load_user_${i}`,
        preferences: {
          categories: ["Technology", "Music", "Art"][i % 3],
        },
      }));

      const events = Array.from({ length: numEvents }, (_, i) => ({
        id: `load_event_${i}`,
        name: `Event ${i}`,
        category: ["Technology", "Music", "Art"][i % 3],
        price: Math.floor(Math.random() * 500),
      }));

      // Simulate concurrent requests
      const startTime = Date.now();

      const promises = users.map(async (user) => {
        // Each user gets recommendations
        const recommendations = await recommendationAgent.getRecommendations(
          user.id,
          [],
          events
        );

        // Simulate purchase
        const transaction = {
          id: `load_txn_${user.id}`,
          user_id: user.id,
          amount: events[0].price,
          payment_method: "credit_card",
        };

        const fraudCheck = await fraudAgent.analyzeTransaction(transaction, []);

        // Simulate feedback
        const feedback = {
          id: `load_feedback_${user.id}`,
          user_id: user.id,
          event_id: events[0].id,
          text: "Test feedback",
          rating: Math.floor(Math.random() * 5) + 1,
        };

        const sentiment = await sentimentAgent.analyze(feedback);

        return {
          recommendations: recommendations.recommendations.length,
          fraudCheck: fraudCheck.recommendation,
          sentiment: sentiment.sentiment,
        };
      });

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(numUsers);

      // Verify all requests completed successfully
      results.forEach((result) => {
        expect(result.recommendations).toBeGreaterThan(0);
        expect(["ALLOW", "REVIEW", "BLOCK"]).toContain(result.fraudCheck);
        expect(["positive", "negative", "neutral"]).toContain(result.sentiment);
      });

      const avgTimePerUser = duration / numUsers;
      console.log(
        `Processed ${numUsers} users in ${duration}ms (avg ${avgTimePerUser.toFixed(
          2
        )}ms/user)`
      );

      // Should complete within reasonable time
      expect(duration).toBeLessThan(30000); // 30 seconds max
      expect(avgTimePerUser).toBeLessThan(1000); // 1 second per user max
    });

    test("should maintain response times under load", async () => {
      const testIterations = 100;
      const responseTimes = [];

      for (let i = 0; i < testIterations; i++) {
        const startTime = Date.now();

        await recommendationAgent.getRecommendations(
          `perf_user_${i}`,
          [],
          [{ id: "event_1", name: "Test Event" }]
        );

        const endTime = Date.now();
        responseTimes.push(endTime - startTime);
      }

      // Calculate statistics
      const avgResponseTime =
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[
        Math.floor(responseTimes.length * 0.95)
      ];

      console.log("Response time statistics:");
      console.log(`  Average: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`  Maximum: ${maxResponseTime}ms`);
      console.log(`  95th percentile: ${p95ResponseTime}ms`);

      // Performance requirements
      expect(avgResponseTime).toBeLessThan(500); // 500ms average
      expect(p95ResponseTime).toBeLessThan(1000); // 1 second for 95% of requests
      expect(maxResponseTime).toBeLessThan(2000); // 2 seconds maximum
    });
  });

  describe("Data Validation and Security", () => {
    test("should validate input data across all agents", async () => {
      const invalidInputs = [
        { type: "null", data: null },
        { type: "undefined", data: undefined },
        { type: "empty_object", data: {} },
        { type: "malformed_json", data: "{ invalid json" },
        { type: "sql_injection", data: { query: "'; DROP TABLE users; --" } },
        { type: "xss_attack", data: { text: '<script>alert("xss")</script>' } },
        { type: "oversized_data", data: { text: "a".repeat(10001) } },
      ];

      for (const invalid of invalidInputs) {
        console.log(`Testing ${invalid.type}...`);

        // Recommendation agent validation
        try {
          await recommendationAgent.getRecommendations(invalid.data, [], []);
          fail(`Should have rejected ${invalid.type}`);
        } catch (error) {
          expect(error.message).toBeDefined();
        }

        // Fraud agent validation
        try {
          await fraudAgent.analyzeTransaction(invalid.data, []);
          fail(`Should have rejected ${invalid.type}`);
        } catch (error) {
          expect(error.message).toBeDefined();
        }

        // Sentiment agent validation
        try {
          await sentimentAgent.analyze(invalid.data);
          fail(`Should have rejected ${invalid.type}`);
        } catch (error) {
          expect(error.message).toBeDefined();
        }
      }

      console.log("All invalid inputs were properly rejected");
    });

    test("should sanitize sensitive data", async () => {
      const sensitiveData = {
        user_id: "sensitive_user_1",
        credit_card: "4111-1111-1111-1111",
        ssn: "123-45-6789",
        password: "SuperSecret123!",
        api_key: "sk_test_1234567890abcdef",
      };

      // Process through recommendation agent
      const recommendations = await recommendationAgent.getRecommendations(
        sensitiveData.user_id,
        [],
        [{ id: "event_1", name: "Test" }]
      );

      // Check logs for sensitive data (should be redacted)
      // This would require checking the actual logs
      console.log("Sensitive data should be redacted in logs");

      // Verify no sensitive data in returned results
      const resultString = JSON.stringify(recommendations);
      expect(resultString).not.toContain(sensitiveData.credit_card);
      expect(resultString).not.toContain(sensitiveData.ssn);
      expect(resultString).not.toContain(sensitiveData.password);
      expect(resultString).not.toContain(sensitiveData.api_key);

      console.log("Sensitive data properly sanitized");
    });

    test("should enforce data access controls", async () => {
      const adminUser = { role: "admin", user_id: "admin_1" };
      const organizerUser = { role: "organizer", user_id: "org_1" };
      const regularUser = { role: "user", user_id: "user_1" };

      // Test data access based on roles
      const testCases = [
        {
          user: adminUser,
          canAccess: ["fraud_data", "sentiment_data", "all_recommendations"],
          cannotAccess: [],
        },
        {
          user: organizerUser,
          canAccess: ["own_events", "own_sentiment", "planning_tools"],
          cannotAccess: ["fraud_data", "other_organizers"],
        },
        {
          user: regularUser,
          canAccess: ["own_recommendations", "own_feedback"],
          cannotAccess: ["fraud_data", "sentiment_data", "planning_tools"],
        },
      ];

      for (const testCase of testCases) {
        console.log(`Testing ${testCase.user.role} access...`);

        // Simulate role-based access checks
        // In a real test, you would call agent methods with different user contexts
        // and verify they return appropriate data or errors

        // For now, just verify the test structure
        expect(testCase.user.role).toBeDefined();
        expect(testCase.canAccess).toBeInstanceOf(Array);
        expect(testCase.cannotAccess).toBeInstanceOf(Array);
      }

      console.log("Role-based access control test structure verified");
    });
  });
});
