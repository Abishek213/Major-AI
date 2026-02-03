/**
 * Unit tests for Fraud Detection Agent
 */

const {
  FraudDetectionAgent,
} = require("../../agents/admin-agents/fraud-detection");
const { getLogger } = require("../../config/logger");

// Mock dependencies
jest.mock("../../../shared/utils/logger");
jest.mock("../../../agents/admin-agents/fraud-detection/ml-client");

describe("Fraud Detection Agent", () => {
  let agent;
  let mockLogger;
  let mockMLClient;

  const testTransactions = [
    {
      id: "txn_1",
      user_id: "user_123",
      amount: 100.5,
      payment_method: "credit_card",
      timestamp: Date.now() - 3600000,
      device_info: {
        type: "desktop",
        browser: "chrome",
        os: "windows",
      },
      ip_address: "192.168.1.100",
      session_duration: 300,
    },
    {
      id: "txn_2",
      user_id: "user_456",
      amount: 999.99,
      payment_method: "khalti",
      timestamp: Date.now() - 1800000,
      device_info: {
        type: "mobile",
        browser: "safari",
        os: "ios",
      },
      ip_address: "10.0.0.1",
      session_duration: 60,
    },
    {
      id: "txn_3",
      user_id: "user_789",
      amount: 10.0,
      payment_method: "esewa",
      timestamp: Date.now() - 900000,
      device_info: {
        type: "mobile",
        browser: "chrome",
        os: "android",
      },
      ip_address: "192.168.1.100", // Same IP as txn_1 (suspicious)
      session_duration: 30,
    },
  ];

  const testUserHistory = {
    user_123: [
      {
        id: "past_txn_1",
        amount: 50.0,
        payment_method: "credit_card",
        timestamp: Date.now() - 86400000,
        status: "completed",
      },
    ],
    user_456: [
      {
        id: "past_txn_2",
        amount: 100.0,
        payment_method: "khalti",
        timestamp: Date.now() - 172800000,
        status: "failed",
      },
      {
        id: "past_txn_3",
        amount: 200.0,
        payment_method: "khalti",
        timestamp: Date.now() - 86400000,
        status: "completed",
      },
    ],
  };

  beforeEach(() => {
    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      ai: jest.fn(),
    };
    getLogger.mockReturnValue(mockLogger);

    // Setup mock ML client
    mockMLClient = {
      predict: jest.fn(),
      predictBatch: jest.fn(),
      getModelInfo: jest.fn(),
    };

    // Mock the ml-client module
    jest.doMock(
      "../../../agents/admin-agents/fraud-detection/ml-client",
      () => ({
        MLClient: jest.fn(() => mockMLClient),
      })
    );

    // Re-import to get mocked version
    jest.resetModules();
    const {
      FraudDetectionAgent: FraudDetectionAgentMocked,
    } = require("../../agents/admin-agents/fraud-detection");

    // Create agent instance
    agent = new FraudDetectionAgentMocked({
      threshold: 0.8,
      mlServiceUrl: "http://localhost:5001",
      features: {
        amount: true,
        velocity: true,
        device: true,
        location: true,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    test("should initialize with configuration", () => {
      expect(agent.config.threshold).toBe(0.8);
      expect(agent.config.mlServiceUrl).toBe("http://localhost:5001");
      expect(agent.initialized).toBe(true);
    });

    test("should log initialization", () => {
      expect(mockLogger.ai).toHaveBeenCalledWith(
        "fraud-detection",
        "initialize",
        expect.any(String)
      );
    });
  });

  describe("analyzeTransaction", () => {
    test("should analyze single transaction", async () => {
      // Mock ML prediction
      mockMLClient.predict.mockResolvedValue({
        is_fraud: false,
        probability: 0.15,
        risk_score: 25,
        features: {
          amount_deviation: 1.2,
          velocity: 0.5,
          device_risk: 0.1,
        },
      });

      const analysis = await agent.analyzeTransaction(
        testTransactions[0],
        testUserHistory["user_123"]
      );

      expect(analysis).toBeDefined();
      expect(analysis.transaction_id).toBe("txn_1");
      expect(analysis.is_fraud).toBe(false);
      expect(analysis.risk_score).toBe(25);
      expect(analysis.recommendation).toBe("ALLOW");

      // Verify ML client was called
      expect(mockMLClient.predict).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction_amount: 100.5,
        })
      );

      // Verify logging
      expect(mockLogger.ai).toHaveBeenCalledWith(
        "fraud-detection",
        "analyzeTransaction",
        expect.stringContaining("Analyzed transaction")
      );
    });

    test("should flag high-risk transaction", async () => {
      // Mock ML prediction for fraud
      mockMLClient.predict.mockResolvedValue({
        is_fraud: true,
        probability: 0.92,
        risk_score: 85,
        features: {
          amount_deviation: 10.5,
          velocity: 8.2,
          device_risk: 0.9,
        },
      });

      const analysis = await agent.analyzeTransaction(
        testTransactions[1],
        testUserHistory["user_456"]
      );

      expect(analysis.is_fraud).toBe(true);
      expect(analysis.risk_score).toBe(85);
      expect(analysis.recommendation).toBe("BLOCK");
      expect(analysis.alert_level).toBe("HIGH");

      // Should log warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("High-risk transaction detected"),
        expect.any(Object)
      );
    });

    test("should handle missing user history", async () => {
      const analysis = await agent.analyzeTransaction(
        testTransactions[0],
        [] // Empty history
      );

      expect(analysis).toBeDefined();
      expect(analysis.user_history_available).toBe(false);
      expect(analysis.risk_factors).toContain("NEW_USER");
    });

    test("should detect velocity attacks", async () => {
      const rapidTransactions = [
        { ...testTransactions[0], timestamp: Date.now() - 60000 },
        { ...testTransactions[0], timestamp: Date.now() - 30000 },
        { ...testTransactions[0], timestamp: Date.now() - 10000 },
      ];

      const history = [...testUserHistory["user_123"], ...rapidTransactions];

      mockMLClient.predict.mockResolvedValue({
        is_fraud: true,
        probability: 0.88,
        risk_score: 78,
        features: {
          velocity: 15.6, // High velocity
          amount_deviation: 1.1,
        },
      });

      const analysis = await agent.analyzeTransaction(
        { ...testTransactions[0], timestamp: Date.now() },
        history
      );

      expect(analysis.risk_factors).toContain("HIGH_VELOCITY");
      expect(analysis.velocity).toBeGreaterThan(10);
    });
  });

  describe("analyzeBatch", () => {
    test("should analyze multiple transactions", async () => {
      // Mock batch prediction
      mockMLClient.predictBatch.mockResolvedValue([
        {
          transaction_id: "txn_1",
          is_fraud: false,
          probability: 0.2,
          risk_score: 30,
        },
        {
          transaction_id: "txn_2",
          is_fraud: true,
          probability: 0.85,
          risk_score: 80,
        },
        {
          transaction_id: "txn_3",
          is_fraud: false,
          probability: 0.1,
          risk_score: 15,
        },
      ]);

      const batchAnalysis = await agent.analyzeBatch(
        testTransactions,
        testUserHistory
      );

      expect(batchAnalysis).toBeDefined();
      expect(batchAnalysis.results).toBeInstanceOf(Array);
      expect(batchAnalysis.results.length).toBe(3);
      expect(batchAnalysis.summary.total).toBe(3);
      expect(batchAnalysis.summary.fraudulent).toBe(1);
      expect(batchAnalysis.summary.suspicious).toBeGreaterThanOrEqual(0);

      // Verify batch processing
      expect(mockMLClient.predictBatch).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object)
      );

      // Verify logging includes batch summary
      expect(mockLogger.ai).toHaveBeenCalledWith(
        "fraud-detection",
        "analyzeBatch",
        expect.stringContaining("Batch analysis completed")
      );
    });

    test("should handle empty batch", async () => {
      const batchAnalysis = await agent.analyzeBatch([], {});

      expect(batchAnalysis).toBeDefined();
      expect(batchAnalysis.results).toHaveLength(0);
      expect(batchAnalysis.summary.total).toBe(0);
    });

    test("should include aggregated statistics", async () => {
      mockMLClient.predictBatch.mockResolvedValue(
        testTransactions.map((t) => ({
          transaction_id: t.id,
          is_fraud: Math.random() > 0.7,
          probability: Math.random(),
          risk_score: Math.floor(Math.random() * 100),
        }))
      );

      const batchAnalysis = await agent.analyzeBatch(
        testTransactions,
        testUserHistory
      );

      expect(batchAnalysis.statistics).toBeDefined();
      expect(batchAnalysis.statistics.average_risk_score).toBeDefined();
      expect(batchAnalysis.statistics.risk_distribution).toBeDefined();
      expect(batchAnalysis.statistics.top_risk_factors).toBeInstanceOf(Array);
    });
  });

  describe("extractFeatures", () => {
    test("should extract transaction features", () => {
      const features = agent.extractFeatures(
        testTransactions[0],
        testUserHistory["user_123"]
      );

      expect(features).toBeDefined();
      expect(features.transaction_amount).toBe(100.5);
      expect(features.payment_method_credit_card).toBe(1);
      expect(features.hour_of_day).toBeDefined();
      expect(features.is_weekend).toBeDefined();
      expect(features.session_duration).toBe(300);
    });

    test("should calculate velocity features", () => {
      const recentTransactions = [
        { ...testTransactions[0], timestamp: Date.now() - 300000 },
        { ...testTransactions[0], timestamp: Date.now() - 180000 },
        { ...testTransactions[0], timestamp: Date.now() - 60000 },
      ];

      const features = agent.extractFeatures(
        { ...testTransactions[0], timestamp: Date.now() },
        recentTransactions
      );

      expect(features.transactions_last_hour).toBe(3);
      expect(features.hourly_velocity).toBeGreaterThan(0);
      expect(features.velocity_risk).toBeDefined();
    });

    test("should extract device fingerprint", () => {
      const features = agent.extractFeatures(testTransactions[1], []);

      expect(features.device_type_mobile).toBe(1);
      expect(features.browser_safari).toBe(1);
      expect(features.os_ios).toBe(1);
      expect(features.device_fingerprint).toBeDefined();
    });

    test("should calculate amount deviation", () => {
      const userHistory = [
        { amount: 50, timestamp: Date.now() - 86400000 },
        { amount: 75, timestamp: Date.now() - 172800000 },
        { amount: 60, timestamp: Date.now() - 259200000 },
      ];

      const features = agent.extractFeatures(
        { ...testTransactions[0], amount: 500 },
        userHistory
      );

      expect(features.amount_deviation_ratio).toBeGreaterThan(1);
      expect(features.high_amount_deviation).toBe(1);
    });
  });

  describe("riskAssessment", () => {
    test("should calculate comprehensive risk score", () => {
      const transaction = testTransactions[0];
      const history = testUserHistory["user_123"];
      const mlPrediction = {
        probability: 0.75,
        features: {
          amount_deviation: 2.5,
          velocity: 3.2,
        },
      };

      const riskAssessment = agent.riskAssessment(
        transaction,
        history,
        mlPrediction
      );

      expect(riskAssessment).toBeDefined();
      expect(riskAssessment.overall_risk_score).toBeDefined();
      expect(riskAssessment.overall_risk_score).toBeGreaterThanOrEqual(0);
      expect(riskAssessment.overall_risk_score).toBeLessThanOrEqual(100);

      expect(riskAssessment.risk_factors).toBeInstanceOf(Array);
      expect(riskAssessment.risk_level).toMatch(/^(LOW|MEDIUM|HIGH|CRITICAL)$/);

      expect(riskAssessment.contributing_factors).toBeInstanceOf(Array);
      expect(riskAssessment.contributing_factors.length).toBeGreaterThan(0);
    });

    test("should identify specific risk factors", () => {
      // Test new user with high amount
      const newUserTransaction = {
        ...testTransactions[0],
        user_id: "new_user",
        amount: 1000,
      };

      const riskAssessment = agent.riskAssessment(
        newUserTransaction,
        [], // No history
        { probability: 0.6, features: {} }
      );

      expect(riskAssessment.risk_factors).toContain("NEW_USER");
      expect(riskAssessment.risk_factors).toContain("HIGH_AMOUNT");
      expect(riskAssessment.risk_level).toBe("HIGH");
    });

    test("should detect location anomalies", () => {
      const transaction = {
        ...testTransactions[0],
        ip_address: "203.0.113.1", // Different country
      };

      const userHistory = [
        {
          ...testTransactions[0],
          ip_address: "192.168.1.100",
          timestamp: Date.now() - 3600000,
        },
      ];

      const riskAssessment = agent.riskAssessment(transaction, userHistory, {
        probability: 0.5,
        features: {},
      });

      expect(riskAssessment.risk_factors).toContain("LOCATION_CHANGE");
    });
  });

  describe("generateAlert", () => {
    test("should generate alert for high-risk transaction", () => {
      const analysis = {
        transaction_id: "txn_1",
        is_fraud: true,
        risk_score: 85,
        risk_factors: ["HIGH_VELOCITY", "NEW_DEVICE"],
        amount: 999.99,
        user_id: "user_123",
      };

      const alert = agent.generateAlert(analysis);

      expect(alert).toBeDefined();
      expect(alert.alert_id).toBeDefined();
      expect(alert.severity).toBe("HIGH");
      expect(alert.title).toContain("Fraud Alert");
      expect(alert.description).toContain("high-risk");
      expect(alert.recommended_actions).toBeInstanceOf(Array);
      expect(alert.recommended_actions.length).toBeGreaterThan(0);
      expect(alert.timestamp).toBeDefined();

      // Should include all necessary information
      expect(alert.metadata.transaction_id).toBe("txn_1");
      expect(alert.metadata.risk_score).toBe(85);
    });

    test("should include escalation path for critical alerts", () => {
      const analysis = {
        transaction_id: "txn_critical",
        is_fraud: true,
        risk_score: 95,
        risk_factors: ["MULTIPLE_FAILED_ATTEMPTS", "HIGH_VELOCITY"],
        amount: 5000,
      };

      const alert = agent.generateAlert(analysis);

      expect(alert.severity).toBe("CRITICAL");
      expect(alert.escalation_required).toBe(true);
      expect(alert.escalation_path).toBeDefined();
      expect(alert.notification_channels).toContain("SMS");
      expect(alert.notification_channels).toContain("EMAIL");
    });
  });

  describe("updateModel", () => {
    test("should update model with new data", async () => {
      const trainingData = [
        {
          transaction: testTransactions[0],
          label: 0, // Not fraud
          features: agent.extractFeatures(testTransactions[0], []),
        },
        {
          transaction: testTransactions[1],
          label: 1, // Fraud
          features: agent.extractFeatures(testTransactions[1], []),
        },
      ];

      mockMLClient.updateModel = jest.fn().mockResolvedValue({
        success: true,
        new_accuracy: 0.92,
        samples_added: 2,
      });

      const updateResult = await agent.updateModel(trainingData);

      expect(updateResult).toBeDefined();
      expect(updateResult.success).toBe(true);
      expect(updateResult.samples_added).toBe(2);
      expect(updateResult.model_version).toBeDefined();

      // Verify ML client was called
      expect(mockMLClient.updateModel).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object)
      );

      // Verify logging
      expect(mockLogger.ai).toHaveBeenCalledWith(
        "fraud-detection",
        "updateModel",
        expect.stringContaining("Model updated")
      );
    });

    test("should handle model update failures", async () => {
      mockMLClient.updateModel = jest
        .fn()
        .mockRejectedValue(new Error("Model update failed"));

      const updateResult = await agent.updateModel([]);

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBeDefined();

      // Should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Model update failed"),
        expect.any(Object)
      );
    });
  });

  describe("Performance", () => {
    test("should handle high volume of transactions", async () => {
      const largeBatch = Array.from({ length: 1000 }, (_, i) => ({
        id: `batch_txn_${i}`,
        user_id: `user_${i % 100}`,
        amount: Math.random() * 1000,
        payment_method: ["credit_card", "khalti", "esewa"][i % 3],
        timestamp: Date.now() - i * 60000,
        device_info: {
          type: i % 2 === 0 ? "desktop" : "mobile",
          browser: "chrome",
          os: i % 2 === 0 ? "windows" : "android",
        },
        ip_address: `192.168.1.${(i % 255) + 1}`,
        session_duration: Math.floor(Math.random() * 1800),
      }));

      // Mock batch prediction
      mockMLClient.predictBatch.mockResolvedValue(
        largeBatch.map((t) => ({
          transaction_id: t.id,
          is_fraud: Math.random() > 0.9,
          probability: Math.random(),
          risk_score: Math.floor(Math.random() * 100),
        }))
      );

      const startTime = Date.now();
      const analysis = await agent.analyzeBatch(largeBatch, {});
      const duration = Date.now() - startTime;

      expect(analysis).toBeDefined();
      expect(analysis.results.length).toBe(1000);

      // Should complete within reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds max

      console.log(`Processed 1000 transactions in ${duration}ms`);
    });

    test("should optimize feature extraction", () => {
      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        agent.extractFeatures(testTransactions[i % 3], []);
      }

      const duration = Date.now() - startTime;
      const averageTime = duration / iterations;

      expect(averageTime).toBeLessThan(10); // Less than 10ms per transaction

      console.log(
        `Average feature extraction time: ${averageTime.toFixed(2)}ms`
      );
    });
  });

  describe("Error Handling", () => {
    test("should handle invalid transaction data", async () => {
      const invalidTransaction = {
        id: "invalid_txn",
        // Missing required fields
      };

      await expect(
        agent.analyzeTransaction(invalidTransaction, [])
      ).rejects.toThrow("Invalid transaction data");
    });

    test("should handle ML service downtime", async () => {
      mockMLClient.predict.mockRejectedValue(
        new Error("ML service unavailable")
      );

      const analysis = await agent.analyzeTransaction(testTransactions[0], []);

      expect(analysis).toBeDefined();
      expect(analysis.ml_service_available).toBe(false);
      expect(analysis.using_fallback).toBe(true);
      expect(analysis.recommendation).toBeDefined();
    });

    test("should validate feature extraction", () => {
      expect(() => {
        agent.extractFeatures(null, []);
      }).toThrow("Transaction cannot be null");

      expect(() => {
        agent.extractFeatures({}, null);
      }).toThrow("History cannot be null");
    });
  });
});
