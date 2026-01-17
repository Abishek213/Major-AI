/**
 * Unit tests for Event Recommendation Agent
 */

const {
  EventRecommendationAgent,
} = require("../../agents/user-agents/event-recommendation");
const { getLogger } = require("../../shared/utils/logger");
const { createVectorStore } = require("../../shared/utils/vector-store");

// Mock dependencies
jest.mock("../../../shared/utils/logger");
jest.mock("../../../shared/utils/vector-store");

describe("Event Recommendation Agent", () => {
  let agent;
  let mockLogger;
  let mockVectorStore;

  const testUserId = "test_user_123";
  const testEvents = [
    {
      id: "event_1",
      name: "Tech Conference 2024",
      description: "Annual technology conference",
      category: "Technology",
      tags: ["tech", "conference", "ai", "development"],
      location: "San Francisco, CA",
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      price: 299,
      capacity: 500,
    },
    {
      id: "event_2",
      name: "Music Festival",
      description: "Summer music festival",
      category: "Music",
      tags: ["music", "festival", "summer", "concert"],
      location: "Austin, TX",
      date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      price: 150,
      capacity: 10000,
    },
    {
      id: "event_3",
      name: "Art Exhibition",
      description: "Modern art exhibition",
      category: "Art",
      tags: ["art", "exhibition", "modern", "gallery"],
      location: "New York, NY",
      date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      price: 50,
      capacity: 200,
    },
  ];

  const testUserHistory = [
    {
      event_id: "past_event_1",
      category: "Technology",
      tags: ["tech", "workshop", "programming"],
      rating: 5,
      attended: true,
    },
    {
      event_id: "past_event_2",
      category: "Music",
      tags: ["music", "concert", "live"],
      rating: 4,
      attended: true,
    },
  ];

  beforeEach(() => {
    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      ai: jest.fn(),
    };
    getLogger.mockReturnValue(mockLogger);

    // Setup mock vector store
    mockVectorStore = {
      similaritySearch: jest.fn(),
      addDocuments: jest.fn(),
      getStats: jest.fn(),
    };
    createVectorStore.mockReturnValue(mockVectorStore);

    // Create agent instance
    agent = new EventRecommendationAgent({
      model: "gpt-3.5-turbo",
      temperature: 0.7,
      vectorStoreConfig: {
        type: "chroma",
        indexName: "events_test",
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    test("should initialize with default configuration", () => {
      expect(agent.config.model).toBe("gpt-3.5-turbo");
      expect(agent.config.temperature).toBe(0.7);
      expect(agent.initialized).toBe(true);
    });

    test("should log initialization", () => {
      expect(mockLogger.ai).toHaveBeenCalledWith(
        "event-recommendation",
        "initialize",
        expect.any(String)
      );
    });
  });

  describe("getRecommendations", () => {
    test("should return recommendations for user", async () => {
      // Mock vector store response
      mockVectorStore.similaritySearch.mockResolvedValue([
        {
          content: "Tech Conference 2024",
          metadata: { id: "event_1", category: "Technology" },
          score: 0.95,
        },
        {
          content: "Music Festival",
          metadata: { id: "event_2", category: "Music" },
          score: 0.85,
        },
      ]);

      const recommendations = await agent.getRecommendations(
        testUserId,
        testUserHistory,
        testEvents
      );

      expect(recommendations).toBeDefined();
      expect(recommendations.userId).toBe(testUserId);
      expect(recommendations.recommendations).toBeInstanceOf(Array);
      expect(recommendations.recommendations.length).toBeGreaterThan(0);
      expect(recommendations.algorithm).toBe("hybrid");

      // Verify logging
      expect(mockLogger.ai).toHaveBeenCalledWith(
        "event-recommendation",
        "getRecommendations",
        expect.stringContaining("Generated recommendations")
      );
    });

    test("should handle empty user history", async () => {
      const recommendations = await agent.getRecommendations(
        testUserId,
        [],
        testEvents
      );

      expect(recommendations).toBeDefined();
      expect(recommendations.recommendations).toBeInstanceOf(Array);
      expect(recommendations.algorithm).toBe("popularity");
    });

    test("should handle empty events list", async () => {
      const recommendations = await agent.getRecommendations(
        testUserId,
        testUserHistory,
        []
      );

      expect(recommendations).toBeDefined();
      expect(recommendations.recommendations).toHaveLength(0);
      expect(recommendations.message).toContain("No events available");
    });

    test("should handle vector store errors gracefully", async () => {
      mockVectorStore.similaritySearch.mockRejectedValue(
        new Error("Vector store unavailable")
      );

      const recommendations = await agent.getRecommendations(
        testUserId,
        testUserHistory,
        testEvents
      );

      expect(recommendations).toBeDefined();
      expect(recommendations.recommendations).toBeInstanceOf(Array);
      expect(recommendations.algorithm).toBe("content-based");

      // Should log the error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Vector store error"),
        expect.any(Object)
      );
    });
  });

  describe("rankEvents", () => {
    test("should rank events based on user preferences", () => {
      const rankedEvents = agent.rankEvents(testUserHistory, testEvents);

      expect(rankedEvents).toBeInstanceOf(Array);
      expect(rankedEvents.length).toBe(testEvents.length);

      // Events should be sorted by score (highest first)
      for (let i = 1; i < rankedEvents.length; i++) {
        expect(rankedEvents[i - 1].score).toBeGreaterThanOrEqual(
          rankedEvents[i].score
        );
      }

      // Tech events should rank higher for this user
      const techEvent = rankedEvents.find(
        (e) => e.event.category === "Technology"
      );
      const musicEvent = rankedEvents.find((e) => e.event.category === "Music");
      const artEvent = rankedEvents.find((e) => e.event.category === "Art");

      expect(techEvent.score).toBeGreaterThan(artEvent.score);
    });

    test("should include explanation for ranking", () => {
      const rankedEvents = agent.rankEvents(testUserHistory, testEvents);

      rankedEvents.forEach((event) => {
        expect(event.explanation).toBeDefined();
        expect(typeof event.explanation).toBe("string");
        expect(event.explanation.length).toBeGreaterThan(0);
      });
    });

    test("should handle events with missing data", () => {
      const incompleteEvents = [
        { id: "event_1", name: "Test Event" },
        { id: "event_2", name: "Another Event", category: "Music" },
      ];

      const rankedEvents = agent.rankEvents(testUserHistory, incompleteEvents);

      expect(rankedEvents).toBeInstanceOf(Array);
      expect(rankedEvents.length).toBe(incompleteEvents.length);
    });
  });

  describe("calculateEventScore", () => {
    test("should calculate score based on category match", () => {
      const event = testEvents[0]; // Tech event
      const score = agent.calculateEventScore(event, testUserHistory);

      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);

      // Tech event should score higher than art event for this user
      const techScore = agent.calculateEventScore(
        testEvents[0],
        testUserHistory
      );
      const artScore = agent.calculateEventScore(
        testEvents[2],
        testUserHistory
      );

      expect(techScore).toBeGreaterThan(artScore);
    });

    test("should include recency bonus for upcoming events", () => {
      const upcomingEvent = {
        ...testEvents[0],
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const distantEvent = {
        ...testEvents[0],
        date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const upcomingScore = agent.calculateEventScore(
        upcomingEvent,
        testUserHistory
      );
      const distantScore = agent.calculateEventScore(
        distantEvent,
        testUserHistory
      );

      expect(upcomingScore).toBeGreaterThan(distantScore);
    });

    test("should include affordability score", () => {
      const expensiveEvent = { ...testEvents[0], price: 1000 };
      const affordableEvent = { ...testEvents[0], price: 50 };

      const expensiveScore = agent.calculateEventScore(
        expensiveEvent,
        testUserHistory
      );
      const affordableScore = agent.calculateEventScore(
        affordableEvent,
        testUserHistory
      );

      expect(affordableScore).toBeGreaterThan(expensiveScore);
    });
  });

  describe("updateUserProfile", () => {
    test("should update user preferences based on interaction", async () => {
      const interaction = {
        eventId: "event_1",
        action: "view",
        duration: 30000, // 30 seconds
        liked: true,
      };

      const updatedProfile = await agent.updateUserProfile(
        testUserId,
        testUserHistory,
        interaction
      );

      expect(updatedProfile).toBeDefined();
      expect(updatedProfile.userId).toBe(testUserId);
      expect(updatedProfile.updatedPreferences).toBeDefined();
      expect(updatedProfile.interactionCount).toBe(testUserHistory.length + 1);

      // Verify logging
      expect(mockLogger.ai).toHaveBeenCalledWith(
        "event-recommendation",
        "updateUserProfile",
        expect.stringContaining("Updated user profile")
      );
    });

    test("should handle negative feedback", async () => {
      const interaction = {
        eventId: "event_1",
        action: "view",
        duration: 5000, // 5 seconds (quick exit)
        liked: false,
      };

      const updatedProfile = await agent.updateUserProfile(
        testUserId,
        testUserHistory,
        interaction
      );

      expect(updatedProfile).toBeDefined();
      expect(updatedProfile.updatedPreferences).toBeDefined();
    });
  });

  describe("generateExplanation", () => {
    test("should generate human-readable explanation", () => {
      const event = testEvents[0];
      const score = 0.85;
      const factors = {
        categoryMatch: 0.9,
        tagOverlap: 0.8,
        recencyBonus: 0.1,
        affordability: 0.7,
      };

      const explanation = agent.generateExplanation(event, score, factors);

      expect(typeof explanation).toBe("string");
      expect(explanation.length).toBeGreaterThan(0);
      expect(explanation).toContain(event.name);
      expect(explanation).toContain("recommend");
    });

    test("should handle different score ranges", () => {
      const highScoreExplanation = agent.generateExplanation(
        testEvents[0],
        0.95,
        { categoryMatch: 0.95 }
      );

      const lowScoreExplanation = agent.generateExplanation(
        testEvents[2],
        0.45,
        { categoryMatch: 0.3 }
      );

      expect(highScoreExplanation).toContain("highly");
      expect(lowScoreExplanation).toContain("might");
    });
  });

  describe("Performance", () => {
    test("should handle large number of events efficiently", async () => {
      const largeEventList = Array.from({ length: 1000 }, (_, i) => ({
        id: `large_event_${i}`,
        name: `Event ${i}`,
        category: ["Tech", "Music", "Art", "Sports"][i % 4],
        tags: [`tag${i}`, `tag${i + 1}`],
        price: i % 100,
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString(),
      }));

      const startTime = Date.now();
      const recommendations = await agent.getRecommendations(
        testUserId,
        testUserHistory,
        largeEventList
      );
      const endTime = Date.now();

      expect(recommendations).toBeDefined();
      expect(recommendations.recommendations.length).toBeLessThanOrEqual(10); // Default limit

      // Should complete within reasonable time
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // 5 seconds max

      console.log(`Processed 1000 events in ${duration}ms`);
    });

    test("should cache recommendations for same user", async () => {
      // First call
      const recommendations1 = await agent.getRecommendations(
        testUserId,
        testUserHistory,
        testEvents
      );

      // Second call should be faster due to caching
      const startTime = Date.now();
      const recommendations2 = await agent.getRecommendations(
        testUserId,
        testUserHistory,
        testEvents
      );
      const duration = Date.now() - startTime;

      expect(recommendations2).toBeDefined();
      expect(duration).toBeLessThan(100); // Should be very fast from cache

      // Results should be the same (or very similar)
      expect(recommendations2.recommendations.length).toBe(
        recommendations1.recommendations.length
      );
    });
  });

  describe("Error Handling", () => {
    test("should handle invalid user ID", async () => {
      await expect(
        agent.getRecommendations(null, testUserHistory, testEvents)
      ).rejects.toThrow("Invalid user ID");

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test("should handle invalid event data", async () => {
      const invalidEvents = [
        { id: "event_1", name: "Test Event" },
        null,
        undefined,
        { id: "event_2" },
      ];

      const recommendations = await agent.getRecommendations(
        testUserId,
        testUserHistory,
        invalidEvents
      );

      expect(recommendations).toBeDefined();
      expect(recommendations.recommendations.length).toBeLessThan(
        invalidEvents.length
      );
    });

    test("should recover from temporary service failures", async () => {
      // Mock consecutive failures then success
      let callCount = 0;
      mockVectorStore.similaritySearch.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          throw new Error("Service temporarily unavailable");
        }
        return Promise.resolve([]);
      });

      const recommendations = await agent.getRecommendations(
        testUserId,
        testUserHistory,
        testEvents
      );

      expect(recommendations).toBeDefined();
      expect(callCount).toBe(3); // Should retry
    });
  });
});
