/**
 * Data synchronization script
 * Syncs data between MongoDB and ML service for training
 */

const mongoose = require("mongoose");
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const { Event } = require("../model/event.schema");
const { Booking } = require("../model/booking.schema");
const { Review } = require("../model/review.schema");

class DataSync {
  constructor(config = {}) {
    this.config = {
      mongoUri: config.mongoUri || "mongodb://localhost:27017/eventa",
      mlServiceUrl: config.mlServiceUrl || "http://localhost:5001",
      syncIntervals: {
        fraud: 3600000, // 1 hour
        sentiment: 1800000, // 30 minutes
        analytics: 86400000, // 24 hours
      },
      batchSize: 1000,
      ...config,
    };

    this.isSyncing = false;
    this.lastSync = {
      fraud: null,
      sentiment: null,
      analytics: null,
    };
  }

  async connectToMongo() {
    try {
      await mongoose.connect(this.config.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
      });
      console.log("Connected to MongoDB");
      return true;
    } catch (error) {
      console.error("MongoDB connection error:", error);
      return false;
    }
  }

  async disconnectFromMongo() {
    try {
      await mongoose.disconnect();
      console.log("Disconnected from MongoDB");
    } catch (error) {
      console.error("MongoDB disconnection error:", error);
    }
  }

  async fetchFraudTrainingData() {
    console.log("Fetching fraud training data...");

    try {
      // Fetch recent bookings with payment information
      const bookings = await Booking.find({
        payment_status: { $in: ["failed", "success", "pending"] },
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      })
        .limit(this.config.batchSize)
        .populate("user_id", "email createdAt")
        .populate("event_id", "name price")
        .lean();

      // Transform data for ML service
      const trainingData = bookings.map((booking) => ({
        id: booking._id.toString(),
        user_id: booking.user_id?._id?.toString(),
        amount: booking.total_amount || 0,
        payment_method: booking.payment_method || "unknown",
        timestamp: booking.createdAt.getTime(),
        payment_status: booking.payment_status,
        is_fraud:
          booking.payment_status === "failed" && booking.failed_attempts > 2
            ? 1
            : 0,
        device_info: booking.device_info || {},
        ip_address: booking.ip_address || "unknown",
        session_duration: booking.session_duration || 0,
        metadata: {
          user_age: this.calculateUserAge(booking.user_id?.createdAt),
          event_type: booking.event_id?.category,
          time_of_day: this.getTimeOfDay(booking.createdAt),
          day_of_week: booking.createdAt.getDay(),
        },
      }));

      console.log(`Fetched ${trainingData.length} fraud training samples`);
      return trainingData;
    } catch (error) {
      console.error("Error fetching fraud data:", error);
      return [];
    }
  }

  async fetchSentimentTrainingData() {
    console.log("Fetching sentiment training data...");

    try {
      // Fetch reviews with ratings
      const reviews = await Review.find({
        rating: { $exists: true },
        comment: { $ne: "", $exists: true },
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      })
        .limit(this.config.batchSize)
        .populate("user_id", "name")
        .populate("event_id", "name")
        .lean();

      // Transform data for ML service
      const trainingData = reviews.map((review) => ({
        id: review._id.toString(),
        user_id: review.user_id?._id?.toString(),
        event_id: review.event_id?._id?.toString(),
        text: review.comment,
        rating: review.rating,
        sentiment_label: this.mapRatingToSentiment(review.rating),
        metadata: {
          user_name: review.user_id?.name,
          event_name: review.event_id?.name,
          date: review.createdAt.toISOString(),
          has_media: !!(review.images || review.videos),
        },
      }));

      console.log(`Fetched ${trainingData.length} sentiment training samples`);
      return trainingData;
    } catch (error) {
      console.error("Error fetching sentiment data:", error);
      return [];
    }
  }

  async fetchAnalyticsTrainingData() {
    console.log("Fetching analytics training data...");

    try {
      // Fetch event performance data
      const events = await Event.find({
        end_date: { $lt: new Date() }, // Completed events only
      })
        .limit(this.config.batchSize)
        .populate("organizer_id", "name")
        .populate("category_id", "name")
        .lean();

      // Fetch booking statistics for each event
      const analyticsData = [];

      for (const event of events) {
        const bookings = await Booking.find({
          event_id: event._id,
          status: "confirmed",
        }).countDocuments();

        const revenue = await Booking.aggregate([
          { $match: { event_id: event._id, status: "confirmed" } },
          { $group: { _id: null, total: { $sum: "$total_amount" } } },
        ]);

        analyticsData.push({
          event_id: event._id.toString(),
          event_name: event.name,
          organizer_id: event.organizer_id?._id?.toString(),
          category: event.category_id?.name,
          start_date: event.start_date.toISOString(),
          end_date: event.end_date?.toISOString(),
          capacity: event.capacity,
          attendees: bookings,
          revenue: revenue[0]?.total || 0,
          cost: event.estimated_cost || 0,
          rating: event.average_rating || 0,
          metadata: {
            location: event.location,
            is_online: event.is_online,
            tags: event.tags,
            promotion_budget: event.promotion_budget || 0,
          },
        });
      }

      console.log(`Fetched ${analyticsData.length} analytics training samples`);
      return analyticsData;
    } catch (error) {
      console.error("Error fetching analytics data:", error);
      return [];
    }
  }

  async syncWithMlService(dataType, data) {
    if (data.length === 0) {
      console.log(`No ${dataType} data to sync`);
      return false;
    }

    console.log(
      `Syncing ${data.length} ${dataType} samples with ML service...`
    );

    try {
      let endpoint;
      let payload;

      switch (dataType) {
        case "fraud":
          endpoint = "/api/models/train";
          payload = {
            model_type: "fraud",
            training_data: data,
            labels: data.map((d) => d.is_fraud),
          };
          break;

        case "sentiment":
          endpoint = "/api/sentiment/batch-analyze";
          payload = {
            feedback: data.map((d) => ({
              id: d.id,
              text: d.text,
              user_id: d.user_id,
              event_id: d.event_id,
              rating: d.rating,
            })),
          };
          break;

        case "analytics":
          endpoint = "/api/analytics/generate-report";
          payload = {
            event_data: data,
            user_data: [], // Could add user data here
          };
          break;

        default:
          throw new Error(`Unknown data type: ${dataType}`);
      }

      const response = await axios.post(
        `${this.config.mlServiceUrl}${endpoint}`,
        payload,
        {
          timeout: 300000, // 5 minutes timeout
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.success) {
        console.log(`✅ ${dataType} data synced successfully`);

        // Update last sync time
        this.lastSync[dataType] = new Date();

        // Save sync result to log
        await this.logSyncResult(dataType, {
          timestamp: new Date().toISOString(),
          samples: data.length,
          success: true,
          response: response.data,
        });

        return true;
      } else {
        console.error(`❌ ${dataType} sync failed:`, response.data.error);

        await this.logSyncResult(dataType, {
          timestamp: new Date().toISOString(),
          samples: data.length,
          success: false,
          error: response.data.error,
        });

        return false;
      }
    } catch (error) {
      console.error(`❌ ${dataType} sync error:`, error.message);

      await this.logSyncResult(dataType, {
        timestamp: new Date().toISOString(),
        samples: data.length,
        success: false,
        error: error.message,
      });

      return false;
    }
  }

  async logSyncResult(dataType, result) {
    const logDir = path.join(__dirname, "../logs/sync");

    try {
      await fs.mkdir(logDir, { recursive: true });

      const logFile = path.join(logDir, `${dataType}_sync.log`);
      const logEntry = JSON.stringify(result) + "\n";

      await fs.appendFile(logFile, logEntry);
    } catch (error) {
      console.error("Failed to write sync log:", error);
    }
  }

  calculateUserAge(createdAt) {
    if (!createdAt) return 0;
    const ageInDays =
      (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return Math.floor(ageInDays);
  }

  getTimeOfDay(date) {
    const hour = date.getHours();
    if (hour < 6) return "night";
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
  }

  mapRatingToSentiment(rating) {
    if (rating >= 4) return "positive";
    if (rating >= 3) return "neutral";
    return "negative";
  }

  shouldSync(dataType) {
    const lastSyncTime = this.lastSync[dataType];
    const interval = this.config.syncIntervals[dataType];

    if (!lastSyncTime) return true;

    const timeSinceLastSync = Date.now() - lastSyncTime.getTime();
    return timeSinceLastSync >= interval;
  }

  async runSync(dataType) {
    if (this.isSyncing) {
      console.log("Sync already in progress, skipping...");
      return false;
    }

    if (!this.shouldSync(dataType)) {
      console.log(`${dataType} sync not due yet, skipping...`);
      return false;
    }

    this.isSyncing = true;

    try {
      console.log(`\n🔄 Starting ${dataType} data sync...`);

      // Connect to MongoDB
      const connected = await this.connectToMongo();
      if (!connected) {
        throw new Error("Failed to connect to MongoDB");
      }

      // Fetch data based on type
      let data;
      switch (dataType) {
        case "fraud":
          data = await this.fetchFraudTrainingData();
          break;
        case "sentiment":
          data = await this.fetchSentimentTrainingData();
          break;
        case "analytics":
          data = await this.fetchAnalyticsTrainingData();
          break;
        default:
          throw new Error(`Unknown data type: ${dataType}`);
      }

      // Sync with ML service
      const success = await this.syncWithMlService(dataType, data);

      // Disconnect from MongoDB
      await this.disconnectFromMongo();

      this.isSyncing = false;
      return success;
    } catch (error) {
      console.error(`Sync failed:`, error);
      this.isSyncing = false;

      // Try to disconnect anyway
      try {
        await this.disconnectFromMongo();
      } catch (e) {
        // Ignore disconnection errors
      }

      return false;
    }
  }

  async runAllSyncs() {
    console.log("🚀 Starting all data syncs...\n");

    const results = {};
    const dataTypes = ["fraud", "sentiment", "analytics"];

    for (const dataType of dataTypes) {
      results[dataType] = await this.runSync(dataType);

      // Add delay between syncs to avoid overwhelming the system
      if (dataType !== dataTypes[dataTypes.length - 1]) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    console.log("\n📊 Sync Results:");
    console.log("================");

    for (const [dataType, success] of Object.entries(results)) {
      console.log(
        `${success ? "✅" : "❌"} ${dataType}: ${
          success ? "Success" : "Failed"
        }`
      );
    }

    const allSuccessful = Object.values(results).every((r) => r);
    return {
      success: allSuccessful,
      results,
    };
  }

  startAutoSync() {
    console.log("🔄 Starting automatic data sync...");

    // Run all syncs immediately
    this.runAllSyncs();

    // Set up interval for fraud data
    setInterval(() => {
      this.runSync("fraud");
    }, this.config.syncIntervals.fraud);

    // Set up interval for sentiment data
    setInterval(() => {
      this.runSync("sentiment");
    }, this.config.syncIntervals.sentiment);

    // Set up interval for analytics data
    setInterval(() => {
      this.runSync("analytics");
    }, this.config.syncIntervals.analytics);

    console.log("Automatic sync scheduled");
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "all";
  const dataType = args[1];

  const sync = new DataSync();

  switch (command) {
    case "all":
      console.log("Running all data syncs...");
      const result = await sync.runAllSyncs();

      if (result.success) {
        console.log("✅ All syncs completed successfully");
        process.exit(0);
      } else {
        console.log("❌ Some syncs failed");
        process.exit(1);
      }
      break;

    case "sync":
      if (!dataType) {
        console.error(
          "Please specify data type: fraud, sentiment, or analytics"
        );
        process.exit(1);
      }

      console.log(`Running ${dataType} sync...`);
      const success = await sync.runSync(dataType);

      if (success) {
        console.log(`✅ ${dataType} sync completed successfully`);
        process.exit(0);
      } else {
        console.log(`❌ ${dataType} sync failed`);
        process.exit(1);
      }
      break;

    case "auto":
      console.log("Starting auto-sync mode...");
      sync.startAutoSync();

      // Keep the process running
      process.on("SIGINT", () => {
        console.log("\nStopping auto-sync...");
        process.exit(0);
      });
      break;

    default:
      console.log(`
Data Synchronization Script
Usage: node data-sync.js [command] [data-type]

Commands:
  all                    Run all data syncs
  sync <data-type>       Sync specific data type
  auto                   Start automatic sync mode

Data Types:
  fraud                  Fraud detection training data
  sentiment              Sentiment analysis data
  analytics              Analytics data

Examples:
  node data-sync.js all
  node data-sync.js sync fraud
  node data-sync.js auto
            `);
      process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = DataSync;
