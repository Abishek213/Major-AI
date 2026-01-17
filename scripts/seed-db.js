/**
 * Enhanced database seeder with AI agent data
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const faker = require("faker");
const path = require("path");

// Import models
const User = require("../model/user.schema");
const Event = require("../model/event.schema");
const Booking = require("../model/booking.schema");
const Review = require("../model/review.schema");
const AIAgent = require("../model/ai_agent.schema");
const AIActionLog = require("../model/ai_actionLog.schema");
const AIFeedbackSentiment = require("../model/ai_feedbackSentiment.schema");
const AIFraudCheck = require("../model/ai_fraudCheck.schema");
const AINegotiationLog = require("../model/ai_negotiationLog.schema");
const AIRecommendation = require("../model/ai_recommendation.schema");

class EnhancedSeeder {
  constructor(config = {}) {
    this.config = {
      mongoUri: config.mongoUri || "mongodb://localhost:27017/eventa_ai",
      clearDatabase: config.clearDatabase || false,
      seedCounts: {
        users: config.userCount || 50,
        events: config.eventCount || 30,
        bookings: config.bookingCount || 200,
        reviews: config.reviewCount || 150,
        aiAgents: config.aiAgentCount || 10,
        aiLogs: config.aiLogCount || 100,
      },
      ...config,
    };

    this.eventCategories = [
      "Music Concert",
      "Tech Conference",
      "Art Exhibition",
      "Sports Game",
      "Food Festival",
      "Business Workshop",
      "Charity Gala",
      "Wedding",
      "Birthday Party",
      "Networking Mixer",
    ];

    this.agentTypes = [
      "event-recommendation",
      "booking-support",
      "fraud-detection",
      "sentiment-analysis",
      "negotiation",
      "planning",
      "analytics",
      "dashboard-assistant",
    ];
  }

  async connect() {
    try {
      await mongoose.connect(this.config.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log("✅ Connected to MongoDB");
      return true;
    } catch (error) {
      console.error("❌ MongoDB connection error:", error);
      return false;
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      console.log("✅ Disconnected from MongoDB");
    } catch (error) {
      console.error("❌ MongoDB disconnection error:", error);
    }
  }

  async clearDatabase() {
    if (!this.config.clearDatabase) {
      console.log("Skipping database clear...");
      return;
    }

    console.log("🗑️  Clearing database...");

    const models = [
      User,
      Event,
      Booking,
      Review,
      AIAgent,
      AIActionLog,
      AIFeedbackSentiment,
      AIFraudCheck,
      AINegotiationLog,
      AIRecommendation,
    ];

    for (const model of models) {
      try {
        await model.deleteMany({});
        console.log(`  Cleared ${model.modelName}`);
      } catch (error) {
        console.error(`  Error clearing ${model.modelName}:`, error.message);
      }
    }
  }

  async seedUsers() {
    console.log(`👤 Seeding ${this.config.seedCounts.users} users...`);

    const users = [];
    const passwordHash = await bcrypt.hash("password123", 10);

    // Create admin user
    const adminUser = new User({
      email: "admin@eventa.com",
      password: passwordHash,
      name: "Eventa Admin",
      role: "admin",
      phone: faker.phone.phoneNumber(),
      address: faker.address.streetAddress(),
      profile_picture: faker.image.avatar(),
      is_verified: true,
      preferences: {
        event_categories: this.eventCategories.slice(0, 3),
        notification_preferences: {
          email: true,
          push: true,
          sms: false,
        },
      },
      metadata: {
        ai_interaction_count: 0,
        preferred_agent: "booking-support",
        trust_score: 100,
      },
    });
    await adminUser.save();
    users.push(adminUser);

    // Create organizer users
    const organizerCount = Math.floor(this.config.seedCounts.users * 0.3);
    for (let i = 0; i < organizerCount; i++) {
      const user = new User({
        email: `organizer${i + 1}@eventa.com`,
        password: passwordHash,
        name: faker.name.findName(),
        role: "organizer",
        phone: faker.phone.phoneNumber(),
        address: faker.address.streetAddress(),
        profile_picture: faker.image.avatar(),
        is_verified: Math.random() > 0.3,
        organizer_info: {
          company_name: faker.company.companyName(),
          tax_id: `TAX${faker.datatype.number({ min: 10000, max: 99999 })}`,
          bio: faker.lorem.paragraph(),
          website: faker.internet.url(),
          social_links: {
            facebook: faker.internet.url(),
            instagram: faker.internet.url(),
            twitter: faker.internet.url(),
          },
        },
        metadata: {
          ai_interaction_count: faker.datatype.number({ min: 0, max: 50 }),
          preferred_agent: "dashboard-assistant",
          trust_score: faker.datatype.number({ min: 50, max: 100 }),
        },
      });
      await user.save();
      users.push(user);
    }

    // Create regular users
    const regularUserCount = this.config.seedCounts.users - organizerCount - 1;
    for (let i = 0; i < regularUserCount; i++) {
      const user = new User({
        email: faker.internet.email(),
        password: passwordHash,
        name: faker.name.findName(),
        role: "user",
        phone: faker.phone.phoneNumber(),
        address: faker.address.streetAddress(),
        profile_picture: faker.image.avatar(),
        is_verified: Math.random() > 0.5,
        preferences: {
          event_categories: faker.helpers
            .shuffle(this.eventCategories)
            .slice(0, faker.datatype.number({ min: 1, max: 4 })),
          notification_preferences: {
            email: Math.random() > 0.5,
            push: Math.random() > 0.5,
            sms: Math.random() > 0.8,
          },
        },
        metadata: {
          ai_interaction_count: faker.datatype.number({ min: 0, max: 20 }),
          preferred_agent: faker.helpers.randomize([
            "event-recommendation",
            "booking-support",
          ]),
          trust_score: faker.datatype.number({ min: 30, max: 100 }),
        },
      });
      await user.save();
      users.push(user);
    }

    console.log(`✅ Seeded ${users.length} users`);
    return users;
  }

  async seedEvents(organizers) {
    console.log(`🎭 Seeding ${this.config.seedCounts.events} events...`);

    const events = [];
    const organizerUsers = organizers.filter((u) => u.role === "organizer");

    if (organizerUsers.length === 0) {
      console.log("⚠️  No organizers found, skipping event seeding");
      return [];
    }

    for (let i = 0; i < this.config.seedCounts.events; i++) {
      const organizer = faker.helpers.randomize(organizerUsers);
      const startDate = faker.date.future();
      const endDate = new Date(
        startDate.getTime() +
          faker.datatype.number({ min: 2, max: 48 }) * 60 * 60 * 1000
      );

      const event = new Event({
        name:
          faker.commerce.productName() +
          " " +
          faker.helpers.randomize([
            "Concert",
            "Conference",
            "Festival",
            "Exhibition",
            "Party",
          ]),
        description: faker.lorem.paragraphs(3),
        category: faker.helpers.randomize(this.eventCategories),
        start_date: startDate,
        end_date: endDate,
        location: faker.address.streetAddress() + ", " + faker.address.city(),
        is_online: Math.random() > 0.7,
        online_link: Math.random() > 0.7 ? faker.internet.url() : null,
        capacity: faker.datatype.number({ min: 50, max: 5000 }),
        price: faker.datatype.float({ min: 0, max: 500, precision: 0.01 }),
        images: Array.from(
          { length: faker.datatype.number({ min: 1, max: 5 }) },
          () => faker.image.imageUrl()
        ),
        organizer_id: organizer._id,
        status: faker.helpers.randomize([
          "draft",
          "published",
          "cancelled",
          "completed",
        ]),
        tags: faker.helpers
          .shuffle([
            "popular",
            "trending",
            "family-friendly",
            "exclusive",
            "sold-out",
            "discount",
          ])
          .slice(0, 3),
        metadata: {
          ai_generated: Math.random() > 0.8,
          seo_score: faker.datatype.number({ min: 50, max: 100 }),
          popularity_score: faker.datatype.float({
            min: 0,
            max: 1,
            precision: 0.01,
          }),
        },
      });

      await event.save();
      events.push(event);
    }

    console.log(`✅ Seeded ${events.length} events`);
    return events;
  }

  async seedBookings(users, events) {
    console.log(`🎫 Seeding ${this.config.seedCounts.bookings} bookings...`);

    const bookings = [];
    const regularUsers = users.filter((u) => u.role === "user");

    if (regularUsers.length === 0 || events.length === 0) {
      console.log("⚠️  No users or events found, skipping booking seeding");
      return [];
    }

    for (let i = 0; i < this.config.seedCounts.bookings; i++) {
      const user = faker.helpers.randomize(regularUsers);
      const event = faker.helpers.randomize(events);

      // Ensure event is in the past for some bookings
      let bookingDate;
      if (Math.random() > 0.5) {
        // Past booking
        bookingDate = faker.date.past();
      } else {
        // Future booking
        bookingDate = faker.date.recent();
      }

      const ticketCount = faker.datatype.number({ min: 1, max: 10 });
      const totalAmount = event.price * ticketCount;

      const booking = new Booking({
        user_id: user._id,
        event_id: event._id,
        booking_date: bookingDate,
        ticket_count: ticketCount,
        total_amount: totalAmount,
        status: faker.helpers.randomize([
          "pending",
          "confirmed",
          "cancelled",
          "refunded",
        ]),
        payment_method: faker.helpers.randomize([
          "credit_card",
          "khalti",
          "esewa",
          "cash",
        ]),
        payment_status: faker.helpers.randomize([
          "pending",
          "completed",
          "failed",
          "refunded",
        ]),
        special_requests: Math.random() > 0.7 ? faker.lorem.sentence() : null,
        metadata: {
          ai_recommended: Math.random() > 0.7,
          booking_channel: faker.helpers.randomize(["web", "mobile", "agent"]),
          session_duration: faker.datatype.number({ min: 30, max: 1800 }),
          device_info: {
            type: faker.helpers.randomize(["mobile", "desktop", "tablet"]),
            browser: faker.helpers.randomize([
              "chrome",
              "firefox",
              "safari",
              "edge",
            ]),
            os: faker.helpers.randomize(["windows", "macos", "android", "ios"]),
          },
          fraud_score: faker.datatype.float({
            min: 0,
            max: 1,
            precision: 0.01,
          }),
        },
      });

      await booking.save();
      bookings.push(booking);
    }

    console.log(`✅ Seeded ${bookings.length} bookings`);
    return bookings;
  }

  async seedReviews(users, bookings) {
    console.log(`⭐ Seeding ${this.config.seedCounts.reviews} reviews...`);

    const reviews = [];
    const confirmedBookings = bookings.filter((b) => b.status === "confirmed");

    if (confirmedBookings.length === 0) {
      console.log("⚠️  No confirmed bookings found, skipping review seeding");
      return [];
    }

    for (let i = 0; i < this.config.seedCounts.reviews; i++) {
      const booking = faker.helpers.randomize(confirmedBookings);
      const user = users.find((u) => u._id.equals(booking.user_id));

      if (!user) continue;

      const review = new Review({
        user_id: user._id,
        event_id: booking.event_id,
        booking_id: booking._id,
        rating: faker.datatype.number({ min: 1, max: 5 }),
        comment: faker.lorem.paragraph(),
        images:
          Math.random() > 0.8
            ? Array.from(
                { length: faker.datatype.number({ min: 1, max: 3 }) },
                () => faker.image.imageUrl()
              )
            : [],
        is_verified_booking: true,
        helpful_count: faker.datatype.number({ min: 0, max: 50 }),
        metadata: {
          ai_analyzed: Math.random() > 0.5,
          sentiment_score: faker.datatype.float({
            min: -1,
            max: 1,
            precision: 0.01,
          }),
          emotion: faker.helpers.randomize([
            "happy",
            "neutral",
            "disappointed",
            "excited",
            "angry",
          ]),
          response_status: Math.random() > 0.7 ? "responded" : "pending",
        },
      });

      await review.save();
      reviews.push(review);
    }

    console.log(`✅ Seeded ${reviews.length} reviews`);
    return reviews;
  }

  async seedAIAgents() {
    console.log(`🤖 Seeding ${this.config.seedCounts.aiAgents} AI agents...`);

    const agents = [];

    for (let i = 0; i < this.config.seedCounts.aiAgents; i++) {
      const agentType = faker.helpers.randomize(this.agentTypes);
      const isActive = Math.random() > 0.2;

      const agent = new AIAgent({
        name: `${agentType.replace("-", " ").toUpperCase()} Agent`,
        agent_type: agentType,
        status: isActive ? "active" : "inactive",
        version: `1.${faker.datatype.number({
          min: 0,
          max: 5,
        })}.${faker.datatype.number({ min: 0, max: 9 })}`,
        configuration: {
          model: faker.helpers.randomize([
            "gpt-4",
            "gpt-3.5-turbo",
            "claude-2",
            "llama-2",
          ]),
          temperature: faker.datatype.float({
            min: 0.1,
            max: 0.9,
            precision: 0.1,
          }),
          max_tokens: faker.datatype.number({ min: 500, max: 4000 }),
          system_prompt: `You are an AI agent specialized in ${agentType}. ${faker.lorem.sentence()}`,
        },
        performance_metrics: {
          total_requests: faker.datatype.number({ min: 100, max: 10000 }),
          success_rate: faker.datatype.float({
            min: 0.85,
            max: 0.99,
            precision: 0.01,
          }),
          average_response_time: faker.datatype.number({ min: 100, max: 2000 }),
          last_updated: faker.date.recent(),
        },
        capabilities: this.getAgentCapabilities(agentType),
        metadata: {
          created_by: "system",
          last_trained: faker.date.recent(),
          next_scheduled_update: faker.date.future(),
          health_status: isActive ? "healthy" : "maintenance",
        },
      });

      await agent.save();
      agents.push(agent);
    }

    console.log(`✅ Seeded ${agents.length} AI agents`);
    return agents;
  }

  getAgentCapabilities(agentType) {
    const capabilities = {
      "event-recommendation": [
        "user_profile_analysis",
        "event_matching",
        "personalized_suggestions",
        "trend_analysis",
      ],
      "booking-support": [
        "faq_answering",
        "multilingual_support",
        "ticket_assistance",
        "payment_guidance",
      ],
      "fraud-detection": [
        "transaction_analysis",
        "pattern_recognition",
        "risk_scoring",
        "anomaly_detection",
      ],
      "sentiment-analysis": [
        "text_analysis",
        "emotion_detection",
        "aspect_based_analysis",
        "trend_monitoring",
      ],
      negotiation: [
        "offer_analysis",
        "counter_offer_generation",
        "deal_structuring",
        "agreement_drafting",
      ],
      planning: [
        "budget_optimization",
        "venue_suggestions",
        "timeline_planning",
        "vendor_coordination",
      ],
      analytics: [
        "data_visualization",
        "insight_generation",
        "performance_forecasting",
        "report_generation",
      ],
      "dashboard-assistant": [
        "data_querying",
        "natural_language_interface",
        "trend_summarization",
        "alert_generation",
      ],
    };

    return capabilities[agentType] || ["general_assistance"];
  }

  async seedAILogs(agents, users) {
    console.log(
      `📝 Seeding ${this.config.seedCounts.aiLogs} AI action logs...`
    );

    const logs = [];

    for (let i = 0; i < this.config.seedCounts.aiLogs; i++) {
      const agent = faker.helpers.randomize(agents);
      const user = faker.helpers.randomize(users);
      const logType = faker.helpers.randomize([
        "request",
        "response",
        "error",
        "training",
        "update",
      ]);

      const log = new AIActionLog({
        agent_id: agent._id,
        user_id: user._id,
        action_type: logType,
        input_data: {
          query: faker.lorem.sentence(),
          parameters: {
            temperature: agent.configuration.temperature,
            max_tokens: agent.configuration.max_tokens,
          },
          context: {
            user_role: user.role,
            session_id: faker.datatype.uuid(),
            timestamp: faker.date.recent().toISOString(),
          },
        },
        output_data: {
          response: faker.lorem.paragraph(),
          confidence: faker.datatype.float({
            min: 0.5,
            max: 0.99,
            precision: 0.01,
          }),
          processing_time: faker.datatype.number({ min: 100, max: 5000 }),
          tokens_used: faker.datatype.number({ min: 50, max: 2000 }),
        },
        status: faker.helpers.randomize([
          "success",
          "partial_success",
          "failure",
        ]),
        error_details:
          logType === "error"
            ? {
                error_code: faker.helpers.randomize([
                  "TIMEOUT",
                  "RATE_LIMIT",
                  "MODEL_ERROR",
                  "VALIDATION_ERROR",
                ]),
                error_message: faker.lorem.sentence(),
                stack_trace:
                  Math.random() > 0.5 ? faker.lorem.paragraph() : null,
              }
            : null,
        metadata: {
          ip_address: faker.internet.ip(),
          user_agent: faker.internet.userAgent(),
          location: faker.address.city(),
          api_version: "v1.0",
        },
      });

      await log.save();
      logs.push(log);
    }

    console.log(`✅ Seeded ${logs.length} AI action logs`);
    return logs;
  }

  async run() {
    console.log("🚀 Starting enhanced database seeding...");
    console.log("========================================\n");

    const startTime = Date.now();

    try {
      // Connect to database
      const connected = await this.connect();
      if (!connected) {
        throw new Error("Failed to connect to database");
      }

      // Clear database if requested
      await this.clearDatabase();

      // Seed data in order
      const users = await this.seedUsers();
      const events = await this.seedEvents(users);
      const bookings = await this.seedBookings(users, events);
      const reviews = await this.seedReviews(users, bookings);
      const aiAgents = await this.seedAIAgents();
      const aiLogs = await this.seedAILogs(aiAgents, users);

      // Generate summary
      const duration = Date.now() - startTime;

      console.log("\n🎉 Seeding completed successfully!");
      console.log("================================");
      console.log(`Total time: ${duration}ms`);
      console.log(`Users seeded: ${users.length}`);
      console.log(`Events seeded: ${events.length}`);
      console.log(`Bookings seeded: ${bookings.length}`);
      console.log(`Reviews seeded: ${reviews.length}`);
      console.log(`AI Agents seeded: ${aiAgents.length}`);
      console.log(`AI Logs seeded: ${aiLogs.length}`);
      console.log("\n🔑 Admin credentials:");
      console.log("   Email: admin@eventa.com");
      console.log("   Password: password123");

      // Disconnect from database
      await this.disconnect();

      return {
        success: true,
        duration,
        counts: {
          users: users.length,
          events: events.length,
          bookings: bookings.length,
          reviews: reviews.length,
          aiAgents: aiAgents.length,
          aiLogs: aiLogs.length,
        },
      };
    } catch (error) {
      console.error("❌ Seeding failed:", error);

      // Try to disconnect anyway
      try {
        await this.disconnect();
      } catch (e) {
        // Ignore disconnection errors
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--clear":
        options.clearDatabase = true;
        break;
      case "--users":
        options.userCount = parseInt(args[++i]) || 50;
        break;
      case "--events":
        options.eventCount = parseInt(args[++i]) || 30;
        break;
      case "--mongodb":
        options.mongoUri = args[++i];
        break;
      case "--help":
        console.log(`
Enhanced Database Seeder for Eventa AI
Usage: node seed-db.js [options]

Options:
  --clear            Clear database before seeding
  --users <count>    Number of users to seed (default: 50)
  --events <count>   Number of events to seed (default: 30)
  --mongodb <uri>    MongoDB connection URI
  --help             Show this help message

Examples:
  node seed-db.js --clear --users 100 --events 50
  node seed-db.js --mongodb mongodb://localhost:27017/eventa_test
                `);
        return;
    }
  }

  const seeder = new EnhancedSeeder(options);
  const result = await seeder.run();

  if (!result.success) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = EnhancedSeeder;
