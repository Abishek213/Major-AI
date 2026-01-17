/**
 * Script to train all ML models
 * This script coordinates the training of all machine learning models
 * and updates them in the production environment
 */

const { spawn, exec } = require("child_process");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

class ModelTrainer {
  constructor(config = {}) {
    this.config = {
      pythonPath: config.pythonPath || "python",
      mlServiceUrl: config.mlServiceUrl || "http://localhost:5001",
      dataPaths: {
        fraud: path.join(__dirname, "../data/fraud_training.json"),
        sentiment: path.join(__dirname, "../data/sentiment_training.json"),
        analytics: path.join(__dirname, "../data/analytics_training.json"),
      },
      ...config,
    };

    this.logFile = path.join(__dirname, "../logs/training.log");
  }

  async log(message, level = "INFO") {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;

    console.log(logMessage.trim());

    try {
      await fs.appendFile(this.logFile, logMessage);
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }

  async ensureDirectories() {
    const directories = [
      path.join(__dirname, "../data"),
      path.join(__dirname, "../logs"),
      path.join(__dirname, "../models/backup"),
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
        await this.log(`Created directory: ${dir}`);
      } catch (error) {
        // Directory might already exist
      }
    }
  }

  async checkMlService() {
    try {
      const response = await axios.get(`${this.config.mlServiceUrl}/health`, {
        timeout: 5000,
      });

      if (response.data.status === "healthy") {
        await this.log("ML service is healthy and responding");
        return true;
      } else {
        await this.log("ML service is not healthy", "WARN");
        return false;
      }
    } catch (error) {
      await this.log(`ML service check failed: ${error.message}`, "ERROR");
      return false;
    }
  }

  async backupExistingModels() {
    const modelsDir = path.join(__dirname, "../python-ml/models");
    const backupDir = path.join(__dirname, "../models/backup");

    try {
      const files = await fs.readdir(modelsDir);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      for (const file of files) {
        if (
          file.endsWith(".pkl") ||
          file.endsWith(".h5") ||
          file.endsWith(".pt")
        ) {
          const source = path.join(modelsDir, file);
          const backup = path.join(backupDir, `${timestamp}_${file}`);

          await fs.copyFile(source, backup);
          await this.log(`Backed up model: ${file} -> ${backup}`);
        }
      }

      return true;
    } catch (error) {
      await this.log(`Model backup failed: ${error.message}`, "ERROR");
      return false;
    }
  }

  async trainFraudModel(trainingData) {
    await this.log("Starting fraud model training...");

    try {
      const response = await axios.post(
        `${this.config.mlServiceUrl}/api/models/train`,
        {
          model_type: "fraud",
          training_data: trainingData.data,
          labels: trainingData.labels,
        },
        {
          timeout: 300000, // 5 minutes timeout for training
        }
      );

      if (response.data.success) {
        await this.log("Fraud model training completed successfully");
        await this.log(
          `Model info: ${JSON.stringify(response.data.model_info)}`
        );
        return {
          success: true,
          ...response.data,
        };
      } else {
        await this.log(
          `Fraud model training failed: ${response.data.error}`,
          "ERROR"
        );
        return {
          success: false,
          error: response.data.error,
        };
      }
    } catch (error) {
      await this.log(`Fraud model training error: ${error.message}`, "ERROR");
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async generateTrainingData() {
    await this.log("Generating training data from database...");

    // This function should connect to your database and generate training data
    // For now, we'll create sample data structure

    const sampleFraudData = {
      data: [],
      labels: [],
    };

    // Generate sample fraud data
    for (let i = 0; i < 1000; i++) {
      const isFraud = Math.random() < 0.1; // 10% fraud rate

      const transaction = {
        id: `txn_${i}`,
        user_id: `user_${Math.floor(Math.random() * 100)}`,
        amount: Math.floor(Math.random() * 1000) + 10,
        payment_method: ["credit_card", "khalti", "esewa"][
          Math.floor(Math.random() * 3)
        ],
        timestamp:
          Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000),
        device_info: {
          type: ["mobile", "desktop", "tablet"][Math.floor(Math.random() * 3)],
          browser: ["chrome", "firefox", "safari"][
            Math.floor(Math.random() * 3)
          ],
          os: ["windows", "macos", "android", "ios"][
            Math.floor(Math.random() * 4)
          ],
        },
        ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(
          Math.random() * 255
        )}`,
        session_duration: Math.floor(Math.random() * 1800), // up to 30 minutes
      };

      sampleFraudData.data.push(transaction);
      sampleFraudData.labels.push(isFraud ? 1 : 0);
    }

    await this.log(`Generated ${sampleFraudData.data.length} training samples`);

    return {
      fraud: sampleFraudData,
      sentiment: { data: [] },
      analytics: { data: [] },
    };
  }

  async runPythonTrainingScript(scriptName, args = []) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, `../python-ml/${scriptName}`);

      const pythonProcess = spawn(this.config.pythonPath, [
        scriptPath,
        ...args,
      ]);

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
        console.log(data.toString().trim());
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error(data.toString().trim());
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Script exited with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on("error", (error) => {
        reject(error);
      });
    });
  }

  async validateModels() {
    await this.log("Validating trained models...");

    const validationTests = [
      {
        name: "Fraud Detection Model",
        endpoint: "/api/fraud/detect",
        testData: {
          transactions: [
            {
              id: "test_1",
              user_id: "test_user",
              amount: 1000,
              payment_method: "credit_card",
              timestamp: Date.now(),
              device_info: {
                type: "desktop",
                browser: "chrome",
                os: "windows",
              },
              ip_address: "192.168.1.1",
              session_duration: 300,
            },
          ],
        },
      },
      {
        name: "Sentiment Analysis",
        endpoint: "/api/sentiment/analyze",
        testData: {
          feedback: [
            {
              id: "test_1",
              text: "This event was amazing! I really enjoyed it.",
              user_id: "user_1",
              event_id: "event_1",
            },
          ],
        },
      },
    ];

    const results = [];

    for (const test of validationTests) {
      try {
        const response = await axios.post(
          `${this.config.mlServiceUrl}${test.endpoint}`,
          test.testData,
          { timeout: 10000 }
        );

        results.push({
          name: test.name,
          success: response.data.success,
          responseTime: response.headers["x-response-time"] || "N/A",
        });

        await this.log(
          `${test.name}: ${response.data.success ? "PASS" : "FAIL"}`
        );
      } catch (error) {
        results.push({
          name: test.name,
          success: false,
          error: error.message,
        });

        await this.log(`${test.name}: FAILED - ${error.message}`, "ERROR");
      }
    }

    return results;
  }

  async sendTrainingReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration: results.duration,
      modelResults: results.modelResults,
      validationResults: results.validationResults,
      success:
        results.modelResults.every((r) => r.success) &&
        results.validationResults.every((r) => r.success),
    };

    // Save report to file
    const reportPath = path.join(
      __dirname,
      `../logs/training_report_${Date.now()}.json`
    );
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    await this.log(`Training report saved to: ${reportPath}`);

    // In production, you might want to:
    // 1. Send to Slack/Teams
    // 2. Store in database
    // 3. Send email notification
    // 4. Update monitoring dashboard

    console.log("\n📊 Training Report Summary:");
    console.log("==========================");
    console.log(`Total Duration: ${report.totalDuration}ms`);
    console.log(`Overall Success: ${report.success ? "✅ Yes" : "❌ No"}`);

    if (report.modelResults) {
      console.log("\nModel Training Results:");
      report.modelResults.forEach((result) => {
        console.log(
          `  ${result.model}: ${result.success ? "✅" : "❌"} ${
            result.duration
          }ms`
        );
      });
    }

    return report;
  }

  async runTrainingPipeline() {
    const startTime = Date.now();

    await this.log("🚀 Starting ML model training pipeline");
    await this.log("======================================");

    try {
      // Step 1: Ensure directories exist
      await this.ensureDirectories();

      // Step 2: Check ML service health
      const serviceHealthy = await this.checkMlService();
      if (!serviceHealthy) {
        throw new Error("ML service is not available");
      }

      // Step 3: Backup existing models
      await this.backupExistingModels();

      // Step 4: Generate training data
      await this.log("Generating training data...");
      const trainingData = await this.generateTrainingData();

      // Step 5: Train models
      const modelResults = [];

      // Train fraud model
      if (trainingData.fraud.data.length > 0) {
        const fraudStart = Date.now();
        const fraudResult = await this.trainFraudModel(trainingData.fraud);
        const fraudDuration = Date.now() - fraudStart;

        modelResults.push({
          model: "fraud_detection",
          success: fraudResult.success,
          duration: fraudDuration,
          details: fraudResult,
        });
      }

      // Step 6: Run Python training scripts
      await this.log("Running additional Python training scripts...");

      try {
        await this.runPythonTrainingScript("fraud/train.py");
        await this.log("Python fraud model training completed");
      } catch (error) {
        await this.log(
          `Python training script failed: ${error.message}`,
          "WARN"
        );
      }

      // Step 7: Validate models
      await this.log("Validating trained models...");
      const validationResults = await this.validateModels();

      // Step 8: Generate report
      const totalDuration = Date.now() - startTime;

      const results = {
        duration: totalDuration,
        modelResults,
        validationResults,
      };

      const report = await this.sendTrainingReport(results);

      await this.log(`Training pipeline completed in ${totalDuration}ms`);
      await this.log(`Overall success: ${report.success ? "YES" : "NO"}`);

      return {
        success: report.success,
        report,
        duration: totalDuration,
      };
    } catch (error) {
      await this.log(`Training pipeline failed: ${error.message}`, "ERROR");

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const trainer = new ModelTrainer();

  switch (command) {
    case "train":
      console.log("Starting model training...");
      const result = await trainer.runTrainingPipeline();

      if (result.success) {
        console.log("✅ Training completed successfully");
        process.exit(0);
      } else {
        console.error("❌ Training failed:", result.error);
        process.exit(1);
      }
      break;

    case "validate":
      console.log("Validating models...");
      const validationResults = await trainer.validateModels();

      console.log("\nValidation Results:");
      validationResults.forEach((result) => {
        console.log(`${result.success ? "✅" : "❌"} ${result.name}`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      });

      process.exit(0);
      break;

    case "backup":
      console.log("Backing up models...");
      await trainer.backupExistingModels();
      console.log("✅ Backup completed");
      process.exit(0);
      break;

    case "health":
      console.log("Checking ML service health...");
      const healthy = await trainer.checkMlService();

      if (healthy) {
        console.log("✅ ML service is healthy");
        process.exit(0);
      } else {
        console.log("❌ ML service is not healthy");
        process.exit(1);
      }
      break;

    default:
      console.log(`
ML Model Training Script
Usage: node train-all-models.js [command]

Commands:
  train      Run full training pipeline
  validate   Validate existing models
  backup     Backup current models
  health     Check ML service health

Examples:
  node train-all-models.js train
  node train-all-models.js validate
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

module.exports = ModelTrainer;
