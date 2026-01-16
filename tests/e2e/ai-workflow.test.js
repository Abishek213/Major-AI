/**
 * End-to-end tests for complete AI workflows
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// Import the main app
const app = require("../../index");
const { testConfig, testUtils } = require("../setup");

describe("AI Agents End-to-End Workflows", () => {
  let mongoServer;
  let authToken;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ E2E test database connected");

    // Start the server
    const PORT = process.env.PORT || 3001;
    server = app.listen(PORT, () => {
      console.log(`Test server running on port ${PORT}`);
    });
  });

  beforeEach(async () => {
    // Clear database
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany();
    }

    // Create test user and get auth token
    const userResponse = await request(app).post("/api/auth/register").send({
      email: "e2e_test@example.com",
      password: "TestPass123!",
      name: "E2E Test User",
      role: "user",
    });

    authToken = userResponse.body.token;

    // Create test organizer
    const orgResponse = await request(app).post("/api/auth/register").send({
      email: "e2e_organizer@example.com",
      password: "OrgPass123!",
      name: "E2E Organizer",
      role: "organizer",
    });

    organizerToken = orgResponse.body.token;
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }

    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }

    console.log("✅ E2E tests completed");
  });

  describe("Complete User Journey with AI", () => {
    test("should complete full user journey with AI assistance", async () => {
      // Step 1: User searches for events
      const searchResponse = await request(app)
        .post("/api/ai/recommendations/search")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          query: "tech conference",
          filters: {
            category: "Technology",
            price_range: { min: 0, max: 500 },
            date_range: {
              start: new Date().toISOString(),
              end: new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000
              ).toISOString(),
            },
          },
        });

      expect(searchResponse.status).toBe(200);
      expect(searchResponse.body.success).toBe(true);
      expect(searchResponse.body.recommendations).toBeInstanceOf(Array);

      const eventId = searchResponse.body.recommendations[0]?.id;
      expect(eventId).toBeDefined();

      // Step 2: User views event details
      const eventResponse = await request(app)
        .get(`/api/events/${eventId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(eventResponse.status).toBe(200);
      expect(eventResponse.body.success).toBe(true);

      // Step 3: User books event (triggers fraud detection)
      const bookingResponse = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          event_id: eventId,
          ticket_count: 2,
          payment_method: "credit_card",
          payment_details: {
            card_number: "4111111111111111",
            expiry: "12/25",
            cvv: "123",
          },
        });

      expect(bookingResponse.status).toBe(201);
      expect(bookingResponse.body.success).toBe(true);
      expect(bookingResponse.body.booking).toBeDefined();
      expect(bookingResponse.body.fraud_check).toBeDefined();
      expect(bookingResponse.body.fraud_check.status).toBe("PASSED");

      const bookingId = bookingResponse.body.booking._id;

      // Step 4: User provides feedback (triggers sentiment analysis)
      const feedbackResponse = await request(app)
        .post("/api/reviews")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          event_id: eventId,
          booking_id: bookingId,
          rating: 5,
          comment: "Amazing conference! The AI recommendations were spot on.",
          images: [],
        });

      expect(feedbackResponse.status).toBe(201);
      expect(feedbackResponse.body.success).toBe(true);
      expect(feedbackResponse.body.sentiment_analysis).toBeDefined();
      expect(feedbackResponse.body.sentiment_analysis.sentiment).toBe(
        "POSITIVE"
      );

      // Step 5: Check user's updated recommendations
      const updatedRecsResponse = await request(app)
        .get("/api/ai/recommendations/personalized")
        .set("Authorization", `Bearer ${authToken}`);

      expect(updatedRecsResponse.status).toBe(200);
      expect(updatedRecsResponse.body.success).toBe(true);
      expect(updatedRecsResponse.body.recommendations).toBeInstanceOf(Array);
      expect(updatedRecsResponse.body.based_on_feedback).toBe(true);

      // Verify AI was involved throughout the journey
      const aiInvolvement = {
        search: searchResponse.body.ai_generated,
        fraud_check: bookingResponse.body.fraud_check.ai_processed,
        sentiment: feedbackResponse.body.sentiment_analysis.ai_analyzed,
        updated_recs: updatedRecsResponse.body.ai_enhanced,
      };

      Object.values(aiInvolvement).forEach((involved) => {
        expect(involved).toBe(true);
      });

      console.log("Complete user journey with AI:", aiInvolvement);
    });

    test("should handle multilingual user journey", async () => {
      // User searches in Spanish
      const spanishSearch = await request(app)
        .post("/api/ai/recommendations/search")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          query: "concierto de música",
          language: "es",
          filters: {
            category: "Music",
          },
        });

      expect(spanishSearch.status).toBe(200);
      expect(spanishSearch.body.success).toBe(true);
      expect(spanishSearch.body.language_detected).toBe("es");
      expect(spanishSearch.body.translated_query).toBeDefined();

      // User provides feedback in French
      const frenchFeedback = await request(app)
        .post("/api/reviews")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          event_id: "test_event_id",
          rating: 4,
          comment: "Très bon événement! Je le recommande.",
          language: "fr",
        });

      expect(frenchFeedback.status).toBe(201);
      expect(frenchFeedback.body.success).toBe(true);
      expect(frenchFeedback.body.sentiment_analysis.language_detected).toBe(
        "fr"
      );
      expect(frenchFeedback.body.sentiment_analysis.translated).toBe(true);

      // User gets recommendations in their preferred language
      const multilingualRecs = await request(app)
        .get("/api/ai/recommendations/personalized")
        .set("Authorization", `Bearer ${authToken}`)
        .set("Accept-Language", "es");

      expect(multilingualRecs.status).toBe(200);
      expect(multilingualRecs.body.success).toBe(true);
      expect(multilingualRecs.body.language).toBe("es");

      console.log("Multilingual journey completed successfully");
    });
  });

  describe("Organizer AI Workflow", () => {
    test("should complete organizer event planning workflow", async () => {
      // Step 1: Organizer uses AI to plan event
      const planResponse = await request(app)
        .post("/api/ai/organizer/plan-event")
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({
          event_type: "Conference",
          theme: "Artificial Intelligence",
          attendees: 200,
          budget: 15000,
          date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          location: "San Francisco, CA",
        });

      expect(planResponse.status).toBe(200);
      expect(planResponse.body.success).toBe(true);
      expect(planResponse.body.plan).toBeDefined();
      expect(planResponse.body.plan.budget_breakdown).toBeDefined();
      expect(planResponse.body.plan.venue_suggestions).toBeInstanceOf(Array);
      expect(planResponse.body.plan.timeline).toBeDefined();

      const eventPlan = planResponse.body.plan;

      // Step 2: Organizer creates event using AI suggestions
      const createResponse = await request(app)
        .post("/api/events")
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({
          name: eventPlan.event_name,
          description: eventPlan.description,
          category: "Conference",
          start_date: eventPlan.timeline.event_date,
          end_date: eventPlan.timeline.event_date,
          location: eventPlan.venue_suggestions[0].name,
          capacity: 200,
          price: eventPlan.ticket_price,
          tags: ["AI", "Conference", "Technology"],
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.success).toBe(true);

      const eventId = createResponse.body.event._id;

      // Step 3: Organizer uses AI for pricing optimization
      const pricingResponse = await request(app)
        .post("/api/ai/organizer/optimize-pricing")
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({
          event_id: eventId,
          current_price: eventPlan.ticket_price,
          competitors: [
            { name: "Similar Conference", price: 299 },
            { name: "Another AI Event", price: 349 },
          ],
          demand_forecast: "high",
        });

      expect(pricingResponse.status).toBe(200);
      expect(pricingResponse.body.success).toBe(true);
      expect(pricingResponse.body.optimized_price).toBeDefined();
      expect(pricingResponse.body.recommendations).toBeInstanceOf(Array);

      // Step 4: Organizer uses AI for marketing suggestions
      const marketingResponse = await request(app)
        .post("/api/ai/organizer/marketing-suggestions")
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({
          event_id: eventId,
          target_audience: "Tech professionals",
          budget: 2000,
        });

      expect(marketingResponse.status).toBe(200);
      expect(marketingResponse.body.success).toBe(true);
      expect(marketingResponse.body.suggestions).toBeInstanceOf(Array);
      expect(marketingResponse.body.suggestions.length).toBeGreaterThan(0);

      // Step 5: Organizer checks AI analytics dashboard
      const analyticsResponse = await request(app)
        .get(`/api/ai/organizer/analytics/${eventId}`)
        .set("Authorization", `Bearer ${organizerToken}`);

      expect(analyticsResponse.status).toBe(200);
      expect(analyticsResponse.body.success).toBe(true);
      expect(analyticsResponse.body.analytics).toBeDefined();
      expect(analyticsResponse.body.predictions).toBeDefined();

      // Verify AI assistance throughout
      const aiAssistance = {
        planning: planResponse.body.ai_generated,
        pricing: pricingResponse.body.ai_optimized,
        marketing: marketingResponse.body.ai_suggested,
        analytics: analyticsResponse.body.ai_analyzed,
      };

      Object.values(aiAssistance).forEach((involved) => {
        expect(involved).toBe(true);
      });

      console.log("Organizer AI workflow:", aiAssistance);
    });

    test("should handle event negotiation workflow", async () => {
      // Simulate user requesting price negotiation
      const negotiationRequest = await request(app)
        .post("/api/ai/negotiation/request")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          event_id: "negotiation_event_id",
          current_price: 299,
          requested_price: 199,
          reason: "Group discount for 10 people",
          user_budget: 2000,
        });

      expect(negotiationRequest.status).toBe(200);
      expect(negotiationRequest.body.success).toBe(true);
      expect(negotiationRequest.body.negotiation_id).toBeDefined();

      const negotiationId = negotiationRequest.body.negotiation_id;

      // Organizer receives and reviews negotiation
      const reviewResponse = await request(app)
        .post(`/api/ai/negotiation/${negotiationId}/review`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({
          action: "counter_offer",
          counter_price: 249,
          terms: "Valid for groups of 8 or more",
        });

      expect(reviewResponse.status).toBe(200);
      expect(reviewResponse.body.success).toBe(true);
      expect(reviewResponse.body.counter_offer).toBeDefined();

      // AI suggests negotiation strategy
      const strategyResponse = await request(app)
        .get(`/api/ai/negotiation/${negotiationId}/strategy`)
        .set("Authorization", `Bearer ${organizerToken}`);

      expect(strategyResponse.status).toBe(200);
      expect(strategyResponse.body.success).toBe(true);
      expect(strategyResponse.body.strategy).toBeDefined();
      expect(strategyResponse.body.recommendations).toBeInstanceOf(Array);

      // User accepts counter offer
      const acceptResponse = await request(app)
        .post(`/api/ai/negotiation/${negotiationId}/accept`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          accepted_price: 249,
          group_size: 8,
        });

      expect(acceptResponse.status).toBe(200);
      expect(acceptResponse.body.success).toBe(true);
      expect(acceptResponse.body.agreement).toBeDefined();

      // Verify AI was involved
      expect(negotiationRequest.body.ai_assisted).toBe(true);
      expect(reviewResponse.body.ai_suggested).toBe(true);
      expect(strategyResponse.body.ai_generated).toBe(true);

      console.log("Negotiation workflow completed with AI assistance");
    });
  });

  describe("Admin AI Workflow", () => {
    let adminToken;

    beforeAll(async () => {
      // Create admin user
      const adminResponse = await request(app).post("/api/auth/register").send({
        email: "e2e_admin@example.com",
        password: "AdminPass123!",
        name: "E2E Admin",
        role: "admin",
      });

      adminToken = adminResponse.body.token;
    });

    test("should complete admin fraud monitoring workflow", async () => {
      // Step 1: Admin checks fraud dashboard
      const dashboardResponse = await request(app)
        .get("/api/ai/admin/fraud-dashboard")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(dashboardResponse.status).toBe(200);
      expect(dashboardResponse.body.success).toBe(true);
      expect(dashboardResponse.body.overview).toBeDefined();
      expect(dashboardResponse.body.suspicious_activities).toBeInstanceOf(
        Array
      );

      // Step 2: Admin investigates specific transaction
      const transactionId =
        dashboardResponse.body.suspicious_activities[0]?.transaction_id;
      if (transactionId) {
        const investigationResponse = await request(app)
          .get(`/api/ai/admin/fraud/transaction/${transactionId}`)
          .set("Authorization", `Bearer ${adminToken}`);

        expect(investigationResponse.status).toBe(200);
        expect(investigationResponse.body.success).toBe(true);
        expect(investigationResponse.body.details).toBeDefined();
        expect(investigationResponse.body.ai_analysis).toBeDefined();
        expect(investigationResponse.body.recommended_action).toBeDefined();
      }

      // Step 3: Admin reviews fraud patterns
      const patternsResponse = await request(app)
        .get("/api/ai/admin/fraud/patterns")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({
          timeframe: "7d",
          min_confidence: 0.8,
        });

      expect(patternsResponse.status).toBe(200);
      expect(patternsResponse.body.success).toBe(true);
      expect(patternsResponse.body.patterns).toBeInstanceOf(Array);
      expect(patternsResponse.body.trends).toBeDefined();

      // Step 4: Admin updates fraud model with new data
      const updateResponse = await request(app)
        .post("/api/ai/admin/fraud/model/update")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          training_data: [
            {
              transaction: {
                amount: 1000,
                payment_method: "credit_card",
                device_type: "mobile",
              },
              label: 1, // Fraud
            },
          ],
          retrain: true,
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.model_updated).toBe(true);
      expect(updateResponse.body.new_accuracy).toBeDefined();

      console.log("Admin fraud monitoring workflow completed");
    });

    test("should complete admin sentiment analysis workflow", async () => {
      // Step 1: Admin checks overall sentiment dashboard
      const sentimentDashboard = await request(app)
        .get("/api/ai/admin/sentiment-dashboard")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(sentimentDashboard.status).toBe(200);
      expect(sentimentDashboard.body.success).toBe(true);
      expect(sentimentDashboard.body.overall_sentiment).toBeDefined();
      expect(sentimentDashboard.body.trends).toBeInstanceOf(Array);
      expect(sentimentDashboard.body.negative_feedback).toBeInstanceOf(Array);

      // Step 2: Admin drills down into negative feedback
      const negativeFeedbackId =
        sentimentDashboard.body.negative_feedback[0]?.id;
      if (negativeFeedbackId) {
        const feedbackDetail = await request(app)
          .get(`/api/ai/admin/sentiment/feedback/${negativeFeedbackId}`)
          .set("Authorization", `Bearer ${adminToken}`);

        expect(feedbackDetail.status).toBe(200);
        expect(feedbackDetail.body.success).toBe(true);
        expect(feedbackDetail.body.analysis).toBeDefined();
        expect(feedbackDetail.body.emotion_detection).toBeDefined();
        expect(feedbackDetail.body.recommendations).toBeInstanceOf(Array);
      }

      // Step 3: Admin generates sentiment report
      const reportResponse = await request(app)
        .post("/api/ai/admin/sentiment/report")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          timeframe: "30d",
          include_charts: true,
          format: "pdf",
        });

      expect(reportResponse.status).toBe(200);
      expect(reportResponse.body.success).toBe(true);
      expect(reportResponse.body.report_url).toBeDefined();
      expect(reportResponse.body.generated_at).toBeDefined();

      // Step 4: Admin sets up sentiment alerts
      const alertResponse = await request(app)
        .post("/api/ai/admin/sentiment/alerts")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          threshold: 0.7,
          notification_channels: ["email", "slack"],
          recipients: ["admin@example.com"],
          conditions: [
            {
              field: "sentiment_score",
              operator: "<",
              value: 0.3,
            },
          ],
        });

      expect(alertResponse.status).toBe(200);
      expect(alertResponse.body.success).toBe(true);
      expect(alertResponse.body.alert_configured).toBe(true);

      console.log("Admin sentiment analysis workflow completed");
    });

    test("should complete admin analytics workflow", async () => {
      // Step 1: Admin gets business intelligence dashboard
      const analyticsDashboard = await request(app)
        .get("/api/ai/admin/analytics/dashboard")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(analyticsDashboard.status).toBe(200);
      expect(analyticsDashboard.body.success).toBe(true);
      expect(analyticsDashboard.body.metrics).toBeDefined();
      expect(analyticsDashboard.body.charts).toBeInstanceOf(Array);
      expect(analyticsDashboard.body.insights).toBeInstanceOf(Array);

      // Step 2: Admin runs custom analysis
      const customAnalysis = await request(app)
        .post("/api/ai/admin/analytics/analyze")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          analysis_type: "revenue_forecast",
          parameters: {
            period: "next_quarter",
            confidence_level: 0.95,
          },
        });

      expect(customAnalysis.status).toBe(200);
      expect(customAnalysis.body.success).toBe(true);
      expect(customAnalysis.body.forecast).toBeDefined();
      expect(customAnalysis.body.predictions).toBeInstanceOf(Array);
      expect(customAnalysis.body.recommendations).toBeInstanceOf(Array);

      // Step 3: Admin exports analytics data
      const exportResponse = await request(app)
        .post("/api/ai/admin/analytics/export")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          data_types: ["events", "bookings", "revenue"],
          format: "csv",
          timeframe: "90d",
        });

      expect(exportResponse.status).toBe(200);
      expect(exportResponse.body.success).toBe(true);
      expect(exportResponse.body.download_url).toBeDefined();

      // Step 4: Admin sets up automated reports
      const automationResponse = await request(app)
        .post("/api/ai/admin/analytics/automation")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          report_type: "weekly_summary",
          schedule: "every monday at 09:00",
          recipients: ["management@example.com"],
          include: ["metrics", "insights", "charts"],
        });

      expect(automationResponse.status).toBe(200);
      expect(automationResponse.body.success).toBe(true);
      expect(automationResponse.body.automation_created).toBe(true);

      console.log("Admin analytics workflow completed");
    });
  });

  describe("Cross-Functional AI Integration", () => {
    test("should demonstrate AI agents working together", async () => {
      // Simulate a scenario where multiple AI agents collaborate

      // 1. User searches for event (Recommendation Agent)
      const searchResult = await request(app)
        .post("/api/ai/recommendations/search")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          query: "weekend activities",
          preferences: {
            budget: 100,
            location: "local",
            interests: ["food", "music"],
          },
        });

      const eventId = searchResult.body.recommendations[0]?.id;

      // 2. User books event (triggers multiple agents)
      const bookingData = {
        event_id: eventId,
        ticket_count: 2,
        payment_method: "credit_card",
        payment_details: {
          amount: 150,
        },
      };

      // This should trigger:
      // - Fraud Detection Agent (payment verification)
      // - Booking Support Agent (confirmation, FAQ)
      // - Analytics Agent (track booking metrics)
      const bookingResult = await request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${authToken}`)
        .send(bookingData);

      expect(bookingResult.body.ai_agents_involved).toBeInstanceOf(Array);
      expect(bookingResult.body.ai_agents_involved.length).toBeGreaterThan(1);

      // 3. Organizer manages booking (Organizer Dashboard Agent)
      const organizerView = await request(app)
        .get(`/api/ai/organizer/booking/${bookingResult.body.booking._id}`)
        .set("Authorization", `Bearer ${organizerToken}`);

      expect(organizerView.body.ai_assistance).toBeDefined();

      // 4. User provides feedback (Sentiment Analysis Agent)
      const feedbackResult = await request(app)
        .post("/api/reviews")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          event_id: eventId,
          rating: 4,
          comment: "Good experience overall",
        });

      expect(feedbackResult.body.sentiment_analysis.ai_processed).toBe(true);

      // 5. Admin monitors system (All Admin Agents)
      const adminOverview = await request(app)
        .get("/api/ai/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(adminOverview.body.agents_status).toBeDefined();
      expect(adminOverview.body.system_health).toBeDefined();

      // Verify cross-agent collaboration
      const collaborationEvidence = {
        recommendation_to_booking: searchResult.body.recommendations.length > 0,
        fraud_check_in_booking: bookingResult.body.fraud_check !== undefined,
        organizer_ai_assistance: organizerView.body.ai_assistance !== undefined,
        sentiment_analysis:
          feedbackResult.body.sentiment_analysis !== undefined,
        admin_monitoring: adminOverview.body.agents_status !== undefined,
      };

      Object.values(collaborationEvidence).forEach((evidence) => {
        expect(evidence).toBe(true);
      });

      console.log("Cross-functional AI collaboration:", collaborationEvidence);
    });

    test("should handle complex multi-agent scenarios", async () => {
      // Scenario: High-demand event with potential issues

      // 1. Many users searching simultaneously (load test for Recommendation Agent)
      const concurrentSearches = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post("/api/ai/recommendations/search")
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            query: `event ${i}`,
            filters: { category: "Music" },
          })
      );

      const searchResults = await Promise.all(concurrentSearches);
      searchResults.forEach((result) => {
        expect(result.status).toBe(200);
      });

      // 2. Multiple bookings in short time (stress test for Fraud Detection Agent)
      const eventId = "high_demand_event";
      const concurrentBookings = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post("/api/bookings")
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            event_id: eventId,
            ticket_count: 1,
            payment_method: i % 2 === 0 ? "credit_card" : "khalti",
            payment_details: { amount: 100 + i * 10 },
          })
      );

      const bookingResults = await Promise.all(concurrentBookings);
      bookingResults.forEach((result) => {
        expect(result.status).toBe(201);
        expect(result.body.fraud_check).toBeDefined();
      });

      // 3. Mixed feedback (test Sentiment Analysis Agent with varied input)
      const feedbacks = [
        { rating: 5, comment: "Perfect!" },
        { rating: 1, comment: "Terrible organization" },
        { rating: 3, comment: "It was okay, could be better" },
        { rating: 4, comment: "Good value for money" },
        { rating: 2, comment: "Disappointed with the service" },
      ];

      const feedbackPromises = feedbacks.map((feedback) =>
        request(app)
          .post("/api/reviews")
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            event_id: eventId,
            ...feedback,
          })
      );

      const feedbackResults = await Promise.all(feedbackPromises);
      feedbackResults.forEach((result) => {
        expect(result.status).toBe(201);
        expect(result.body.sentiment_analysis).toBeDefined();
      });

      // 4. Organizer uses AI to handle the situation (Planning + Dashboard Agents)
      const organizerResponse = await request(app)
        .post("/api/ai/organizer/handle-demand")
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({
          event_id: eventId,
          current_bookings: 50,
          capacity: 100,
          issues_reported: feedbackResults.filter(
            (r) => r.body.sentiment_analysis.sentiment === "NEGATIVE"
          ).length,
        });

      expect(organizerResponse.status).toBe(200);
      expect(organizerResponse.body.recommendations).toBeInstanceOf(Array);

      // 5. Admin monitors the situation (Analytics + Alert Agents)
      const adminResponse = await request(app)
        .get(`/api/ai/admin/event-monitoring/${eventId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(adminResponse.status).toBe(200);
      expect(adminResponse.body.alerts).toBeInstanceOf(Array);
      expect(adminResponse.body.analytics).toBeDefined();

      // System should handle all agents working together
      console.log("Complex multi-agent scenario handled successfully");
      console.log(`- ${searchResults.length} concurrent searches`);
      console.log(`- ${bookingResults.length} concurrent bookings`);
      console.log(`- ${feedbackResults.length} varied feedbacks`);
      console.log(
        `- Organizer recommendations: ${organizerResponse.body.recommendations.length}`
      );
      console.log(`- Admin alerts: ${adminResponse.body.alerts.length}`);
    });
  });
});
