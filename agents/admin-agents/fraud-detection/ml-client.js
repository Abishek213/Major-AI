const logger = require('../../../config/logger');

class MLClient {
  constructor() {
    this.modelVersion = '1.0.0';
    this.modelLoaded = false;
    this.features = [
      'booking_amount',
      'user_age_days',
      'booking_frequency',
      'payment_failures',
      'location_anomaly',
      'device_fingerprint',
      'time_of_day',
      'day_of_week'
    ];
  }

  async initialize() {
    if (this.modelLoaded) return true;
    
    logger.agent('MLClient', 'Initializing machine learning client');
    
    // In production, this would:
    // 1. Load trained model
    // 2. Connect to ML service
    // 3. Validate model version
    
    // Simulate model loading
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.modelLoaded = true;
    logger.success('ML client initialized');
    return true;
  }

  async analyzeBooking(bookingData, userData, eventData) {
    try {
      if (!this.modelLoaded) {
        await this.initialize();
      }
      
      logger.agent('MLClient', `Analyzing booking with ML model`);
      
      // Extract features
      const features = this.extractFeatures(bookingData, userData, eventData);
      
      // Make prediction (simulated)
      const prediction = await this.makePrediction(features);
      
      // Calculate risk score
      const riskScore = this.calculateRiskScore(prediction, features);
      
      // Generate explanation
      const explanation = this.generateExplanation(features, riskScore);
      
      return {
        risk_score: riskScore,
        confidence: prediction.confidence,
        prediction: prediction.label,
        features_used: features,
        details: explanation,
        model_version: this.modelVersion
      };
    } catch (error) {
      logger.error(`ML analysis failed: ${error.message}`);
      return {
        risk_score: 0,
        confidence: 0,
        prediction: 'safe',
        error: 'ML analysis unavailable'
      };
    }
  }

  extractFeatures(bookingData, userData, eventData) {
    const features = {};
    
    // Booking amount feature
    features.booking_amount = this.normalizeAmount(bookingData.amount || 0);
    
    // User age feature
    features.user_age_days = this.normalizeUserAge(userData.accountAgeDays || 0);
    
    // Booking frequency (simulated)
    features.booking_frequency = this.normalizeFrequency(userData.bookingCount || 1);
    
    // Payment failures (simulated)
    features.payment_failures = this.normalizeFailures(bookingData.failedAttempts || 0);
    
    // Location anomaly (simulated)
    features.location_anomaly = this.calculateLocationAnomaly(
      userData.location,
      bookingData.location
    );
    
    // Device fingerprint (simulated)
    features.device_fingerprint = this.checkDeviceAnomaly(bookingData.deviceId);
    
    // Time features
    const now = new Date();
    features.time_of_day = this.normalizeTimeOfDay(now.getHours());
    features.day_of_week = this.normalizeDayOfWeek(now.getDay());
    
    // Additional contextual features
    features.event_popularity = eventData.popularity || 0.5;
    features.user_verification_level = userData.verificationLevel || 0;
    
    return features;
  }

  normalizeAmount(amount) {
    // Normalize to 0-1 range, assuming max booking amount is 50,000
    return Math.min(amount / 50000, 1);
  }

  normalizeUserAge(ageDays) {
    // Normalize user account age
    if (ageDays >= 365) return 1.0; // 1+ years
    if (ageDays >= 180) return 0.8; // 6+ months
    if (ageDays >= 90) return 0.6;  // 3+ months
    if (ageDays >= 30) return 0.4;  // 1+ month
    if (ageDays >= 7) return 0.2;   // 1+ week
    return 0.1; // New account
  }

  normalizeFrequency(count) {
    // Normalize booking frequency
    if (count >= 10) return 1.0;
    if (count >= 5) return 0.7;
    if (count >= 2) return 0.4;
    return 0.1;
  }

  normalizeFailures(failureCount) {
    // Normalize payment failures
    return Math.min(failureCount / 5, 1);
  }

  calculateLocationAnomaly(userLocation, bookingLocation) {
    // Simple location anomaly detection
    if (!userLocation || !bookingLocation) return 0.5;
    
    const userCountry = userLocation.split(',')[0];
    const bookingCountry = bookingLocation.split(',')[0];
    
    return userCountry === bookingCountry ? 0.2 : 0.8;
  }

  checkDeviceAnomaly(deviceId) {
    // Simple device check (simulated)
    if (!deviceId) return 0.5;
    
    // Check if device is known (simulated)
    const knownDevices = ['device_123', 'device_456'];
    return knownDevices.includes(deviceId) ? 0.2 : 0.6;
  }

  normalizeTimeOfDay(hour) {
    // Normalize hour to 0-1 where unusual hours get higher scores
    const usualHours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]; // 9 AM - 6 PM
    return usualHours.includes(hour) ? 0.2 : 0.7;
  }

  normalizeDayOfWeek(day) {
    // 0 = Sunday, 6 = Saturday
    const weekday = day >= 1 && day <= 5; // Monday to Friday
    return weekday ? 0.3 : 0.6; // Higher risk on weekends
  }

  async makePrediction(features) {
    // Simulated ML prediction
    // In production, this would call a trained model
    
    // Calculate weighted risk
    const weights = {
      booking_amount: 0.2,
      user_age_days: 0.15,
      booking_frequency: 0.1,
      payment_failures: 0.2,
      location_anomaly: 0.15,
      device_fingerprint: 0.1,
      time_of_day: 0.05,
      day_of_week: 0.05
    };
    
    let weightedSum = 0;
    let totalWeight = 0;
    
    Object.entries(weights).forEach(([feature, weight]) => {
      if (features[feature] !== undefined) {
        weightedSum += features[feature] * weight;
        totalWeight += weight;
      }
    });
    
    const predictionScore = weightedSum / totalWeight;
    const confidence = 0.8 + Math.random() * 0.15; // 80-95% confidence
    
    return {
      score: predictionScore,
      confidence: confidence,
      label: predictionScore > 0.5 ? 'suspicious' : 'safe'
    };
  }

  calculateRiskScore(prediction, features) {
    // Base risk from prediction
    let riskScore = prediction.score;
    
    // Adjust based on feature combinations
    if (features.user_age_days < 0.2 && features.booking_amount > 0.7) {
      // New user + high amount = higher risk
      riskScore *= 1.3;
    }
    
    if (features.location_anomaly > 0.7 && features.device_fingerprint > 0.6) {
      // Unusual location + unknown device = higher risk
      riskScore *= 1.2;
    }
    
    // Cap at 1.0
    return Math.min(riskScore, 1.0);
  }

  generateExplanation(features, riskScore) {
    const contributingFactors = [];
    
    if (features.booking_amount > 0.7) {
      contributingFactors.push('High booking amount');
    }
    
    if (features.user_age_days < 0.3) {
      contributingFactors.push('New user account');
    }
    
    if (features.payment_failures > 0.5) {
      contributingFactors.push('Multiple payment failures');
    }
    
    if (features.location_anomaly > 0.7) {
      contributingFactors.push('Unusual location');
    }
    
    let explanation = `Risk score: ${riskScore.toFixed(2)}`;
    
    if (contributingFactors.length > 0) {
      explanation += `. Contributing factors: ${contributingFactors.join(', ')}`;
    }
    
    return {
      text: explanation,
      contributing_factors: contributingFactors,
      feature_scores: features
    };
  }

  async trainModel(trainingData) {
    try {
      logger.agent('MLClient', 'Training ML model');
      
      // In production, this would:
      // 1. Preprocess training data
      // 2. Train model
      // 3. Validate performance
      // 4. Deploy new version
      
      // Simulate training
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const newVersion = `1.${Math.floor(Math.random() * 100)}.0`;
      this.modelVersion = newVersion;
      
      const accuracy = 0.85 + Math.random() * 0.1; // 85-95% accuracy
      const precision = 0.8 + Math.random() * 0.15; // 80-95% precision
      const recall = 0.75 + Math.random() * 0.2; // 75-95% recall
      
      return {
        success: true,
        model_version: newVersion,
        training_samples: trainingData.length,
        metrics: {
          accuracy: accuracy,
          precision: precision,
          recall: recall,
          f1_score: 2 * (precision * recall) / (precision + recall)
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Model training failed: ${error.message}`);
      throw error;
    }
  }

  async batchPredict(dataPoints) {
    try {
      logger.agent('MLClient', `Batch predicting ${dataPoints.length} data points`);
      
      const predictions = [];
      
      for (const data of dataPoints) {
        const prediction = await this.analyzeBooking(
          data.bookingData,
          data.userData,
          data.eventData
        );
        
        predictions.push({
          bookingId: data.bookingData.bookingId,
          ...prediction
        });
      }
      
      // Generate batch statistics
      const stats = this.calculateBatchStats(predictions);
      
      return {
        success: true,
        predictions: predictions,
        statistics: stats,
        model_version: this.modelVersion
      };
    } catch (error) {
      logger.error(`Batch prediction failed: ${error.message}`);
      throw error;
    }
  }

  calculateBatchStats(predictions) {
    const total = predictions.length;
    if (total === 0) return { total: 0 };
    
    const riskScores = predictions.map(p => p.risk_score);
    const avgRisk = riskScores.reduce((a, b) => a + b, 0) / total;
    
    const suspiciousCount = predictions.filter(p => p.prediction === 'suspicious').length;
    const safeCount = predictions.filter(p => p.prediction === 'safe').length;
    
    const confidences = predictions.map(p => p.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / total;
    
    return {
      total: total,
      average_risk_score: avgRisk,
      suspicious_count: suspiciousCount,
      suspicious_percentage: (suspiciousCount / total) * 100,
      safe_count: safeCount,
      safe_percentage: (safeCount / total) * 100,
      average_confidence: avgConfidence
    };
  }

  getModelVersion() {
    return this.modelVersion;
  }

  async updateModel(newModelData) {
    try {
      logger.agent('MLClient', 'Updating ML model');
      
      // Validate new model
      if (!newModelData || !newModelData.version) {
        throw new Error('Invalid model data');
      }
      
      // In production, would validate model performance
      // before updating
      
      this.modelVersion = newModelData.version;
      this.modelLoaded = false; // Force reinitialization
      
      logger.success(`ML model updated to version ${this.modelVersion}`);
      
      return {
        success: true,
        old_version: this.modelVersion,
        new_version: newModelData.version,
        updated_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Model update failed: ${error.message}`);
      throw error;
    }
  }

  getFeatureImportance() {
    // Simulated feature importance
    const importance = {
      booking_amount: 0.85,
      payment_failures: 0.78,
      user_age_days: 0.72,
      location_anomaly: 0.65,
      booking_frequency: 0.58,
      device_fingerprint: 0.52,
      time_of_day: 0.35,
      day_of_week: 0.28
    };
    
    return {
      success: true,
      model_version: this.modelVersion,
      feature_importance: importance,
      top_features: Object.entries(importance)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([feature, score]) => ({ feature, score }))
    };
  }

  async getModelInfo() {
    return {
      model_version: this.modelVersion,
      model_type: 'fraud_detection_classifier',
      features: this.features,
      last_trained: '2024-01-15T10:30:00Z', // Would be dynamic in production
      performance: {
        accuracy: 0.89,
        precision: 0.85,
        recall: 0.87,
        f1_score: 0.86
      },
      status: this.modelLoaded ? 'loaded' : 'not_loaded'
    };
  }
}

module.exports = MLClient;