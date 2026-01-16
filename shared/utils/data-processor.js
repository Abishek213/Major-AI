/**
 * Data processing utilities for AI agents
 * Handles data transformation, cleaning, and preparation
 */

const natural = require("natural");
const stopword = require("stopword");
const moment = require("moment");
const crypto = require("crypto");

class DataProcessor {
  constructor(config = {}) {
    this.config = {
      // Text processing
      text: {
        minLength: 10,
        maxLength: 10000,
        removeUrls: true,
        removeEmails: true,
        removePhoneNumbers: true,
        removeSpecialCharacters: true,
        normalizeWhitespace: true,
        convertToLowercase: true,
        removeStopwords: true,
        stemWords: true,
        lemmatizeWords: false,
      },

      // Data validation
      validation: {
        strict: false,
        requiredFields: [],
        fieldTypes: {},
        valueRanges: {},
        customValidators: [],
      },

      // Data transformation
      transformation: {
        dateFormat: "YYYY-MM-DD HH:mm:ss",
        numberPrecision: 2,
        encoding: "utf8",
        normalize: true,
      },

      // Performance
      performance: {
        batchSize: 1000,
        concurrency: 5,
        cacheEnabled: true,
      },

      ...config,
    };

    // Initialize NLP tools
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.sentenceTokenizer = new natural.SentenceTokenizer();

    // Initialize cache
    this.cache = new Map();
    this.stats = {
      processed: 0,
      cached: 0,
      errors: 0,
      validationFailed: 0,
    };
  }

  // Text Processing Methods
  processText(text, options = {}) {
    const startTime = Date.now();
    const config = { ...this.config.text, ...options };

    // Check cache
    const cacheKey = this.getTextCacheKey(text, config);
    if (this.config.performance.cacheEnabled && this.cache.has(cacheKey)) {
      this.stats.cached++;
      return this.cache.get(cacheKey);
    }

    let processedText = text;

    try {
      // Length validation
      if (processedText.length < config.minLength) {
        throw new Error(`Text too short (min: ${config.minLength} chars)`);
      }

      if (processedText.length > config.maxLength) {
        processedText = processedText.substring(0, config.maxLength);
      }

      // Remove URLs
      if (config.removeUrls) {
        processedText = processedText.replace(/https?:\/\/[^\s]+/g, "");
      }

      // Remove emails
      if (config.removeEmails) {
        processedText = processedText.replace(/[\w.-]+@[\w.-]+\.\w+/g, "");
      }

      // Remove phone numbers
      if (config.removePhoneNumbers) {
        processedText = processedText.replace(
          /[\+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,6}/g,
          ""
        );
      }

      // Remove special characters
      if (config.removeSpecialCharacters) {
        processedText = processedText.replace(/[^\w\s.,!?]/g, " ");
      }

      // Normalize whitespace
      if (config.normalizeWhitespace) {
        processedText = processedText.replace(/\s+/g, " ").trim();
      }

      // Convert to lowercase
      if (config.convertToLowercase) {
        processedText = processedText.toLowerCase();
      }

      // Remove stopwords
      if (config.removeStopwords) {
        const tokens = this.tokenizer.tokenize(processedText);
        const filteredTokens = stopword.removeStopwords(tokens);
        processedText = filteredTokens.join(" ");
      }

      // Stem words
      if (config.stemWords) {
        const tokens = this.tokenizer.tokenize(processedText);
        const stemmedTokens = tokens.map((token) => this.stemmer.stem(token));
        processedText = stemmedTokens.join(" ");
      }

      // Lemmatize words (requires more sophisticated NLP)
      if (config.lemmatizeWords) {
        // Implementation would require a lemmatizer library
        console.warn(
          "Lemmatization not implemented, requires additional dependencies"
        );
      }

      const result = {
        text: processedText,
        originalLength: text.length,
        processedLength: processedText.length,
        processingTime: Date.now() - startTime,
        transformations: Object.keys(config).filter((k) => config[k]),
      };

      // Cache result
      if (this.config.performance.cacheEnabled) {
        this.cache.set(cacheKey, result);
      }

      this.stats.processed++;
      return result;
    } catch (error) {
      this.stats.errors++;
      console.error("Text processing error:", error);

      return {
        text: text,
        error: error.message,
        originalLength: text.length,
        processingTime: Date.now() - startTime,
      };
    }
  }

  batchProcessText(texts, options = {}) {
    const results = [];
    const batchSize = options.batchSize || this.config.performance.batchSize;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = batch.map((text) => this.processText(text, options));
      results.push(...batchResults);
    }

    return results;
  }

  // Data Validation Methods
  validateData(data, schema = {}) {
    const errors = [];
    const validatedData = { ...data };

    // Merge schema with config
    const validationSchema = {
      requiredFields: [
        ...this.config.validation.requiredFields,
        ...(schema.requiredFields || []),
      ],
      fieldTypes: {
        ...this.config.validation.fieldTypes,
        ...(schema.fieldTypes || {}),
      },
      valueRanges: {
        ...this.config.validation.valueRanges,
        ...(schema.valueRanges || {}),
      },
      customValidators: [
        ...this.config.validation.customValidators,
        ...(schema.customValidators || []),
      ],
    };

    // Check required fields
    for (const field of validationSchema.requiredFields) {
      if (
        validatedData[field] === undefined ||
        validatedData[field] === null ||
        validatedData[field] === ""
      ) {
        errors.push({
          field,
          error: "Field is required",
          value: validatedData[field],
        });

        if (this.config.validation.strict) {
          return {
            valid: false,
            errors,
            data: null,
          };
        }
      }
    }

    // Check field types
    for (const [field, type] of Object.entries(validationSchema.fieldTypes)) {
      if (validatedData[field] !== undefined) {
        const value = validatedData[field];
        let isValid = true;

        switch (type) {
          case "string":
            isValid = typeof value === "string";
            break;
          case "number":
            isValid = typeof value === "number" && !isNaN(value);
            break;
          case "integer":
            isValid = Number.isInteger(value);
            break;
          case "boolean":
            isValid = typeof value === "boolean";
            break;
          case "date":
            isValid = !isNaN(Date.parse(value));
            break;
          case "array":
            isValid = Array.isArray(value);
            break;
          case "object":
            isValid =
              typeof value === "object" &&
              value !== null &&
              !Array.isArray(value);
            break;
          case "email":
            isValid =
              typeof value === "string" &&
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            break;
          case "phone":
            isValid =
              typeof value === "string" &&
              /^[\+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,6}$/.test(
                value
              );
            break;
          default:
            // Custom type check
            if (typeof type === "function") {
              isValid = type(value);
            }
        }

        if (!isValid) {
          errors.push({
            field,
            error: `Field must be of type ${type}`,
            value,
          });

          if (this.config.validation.strict) {
            return {
              valid: false,
              errors,
              data: null,
            };
          }
        }
      }
    }

    // Check value ranges
    for (const [field, range] of Object.entries(validationSchema.valueRanges)) {
      if (validatedData[field] !== undefined) {
        const value = validatedData[field];

        if (range.min !== undefined && value < range.min) {
          errors.push({
            field,
            error: `Value must be at least ${range.min}`,
            value,
            constraint: `min: ${range.min}`,
          });
        }

        if (range.max !== undefined && value > range.max) {
          errors.push({
            field,
            error: `Value must be at most ${range.max}`,
            value,
            constraint: `max: ${range.max}`,
          });
        }

        if (range.enum && !range.enum.includes(value)) {
          errors.push({
            field,
            error: `Value must be one of: ${range.enum.join(", ")}`,
            value,
            constraint: `enum: ${range.enum}`,
          });
        }

        if (range.pattern && !new RegExp(range.pattern).test(value)) {
          errors.push({
            field,
            error: `Value must match pattern: ${range.pattern}`,
            value,
            constraint: `pattern: ${range.pattern}`,
          });
        }
      }
    }

    // Run custom validators
    for (const validator of validationSchema.customValidators) {
      const result = validator(validatedData);
      if (result && result.error) {
        errors.push(result);

        if (this.config.validation.strict) {
          return {
            valid: false,
            errors,
            data: null,
          };
        }
      }
    }

    if (errors.length > 0) {
      this.stats.validationFailed++;
    }

    return {
      valid: errors.length === 0,
      errors,
      data: validatedData,
    };
  }

  // Data Transformation Methods
  transformData(data, transformations = {}) {
    const transformed = { ...data };
    const config = { ...this.config.transformation, ...transformations };

    // Date transformations
    if (config.dateFormat) {
      for (const [key, value] of Object.entries(transformed)) {
        if (value instanceof Date) {
          transformed[key] = moment(value).format(config.dateFormat);
        } else if (typeof value === "string" && !isNaN(Date.parse(value))) {
          transformed[key] = moment(value).format(config.dateFormat);
        }
      }
    }

    // Number transformations
    if (config.numberPrecision !== undefined) {
      for (const [key, value] of Object.entries(transformed)) {
        if (typeof value === "number") {
          transformed[key] = parseFloat(value.toFixed(config.numberPrecision));
        }
      }
    }

    // Normalize values
    if (config.normalize) {
      for (const [key, value] of Object.entries(transformed)) {
        if (typeof value === "string") {
          transformed[key] = value.trim();
        }
      }
    }

    // Encoding
    if (config.encoding && config.encoding !== "utf8") {
      // Note: In Node.js, strings are UTF-16 internally
      // This is just for demonstration
      console.warn("Encoding transformation may require additional handling");
    }

    return transformed;
  }

  // Feature Extraction Methods
  extractTextFeatures(text, options = {}) {
    const processed = this.processText(text, options);

    const features = {
      // Basic features
      length: processed.text.length,
      wordCount: this.tokenizer.tokenize(processed.text).length,
      sentenceCount: this.sentenceTokenizer.tokenize(text).length,
      avgWordLength: this.calculateAverageWordLength(processed.text),

      // Readability features
      readabilityScore: this.calculateReadability(text),

      // Sentiment features (basic)
      positiveWords: this.countPositiveWords(processed.text),
      negativeWords: this.countNegativeWords(processed.text),

      // Topic features
      uniqueWords: this.countUniqueWords(processed.text),
      commonWords: this.getMostCommonWords(processed.text, 10),

      // Metadata
      hasNumbers: /\d/.test(text),
      hasUrls: /https?:\/\/[^\s]+/.test(text),
      hasEmails: /[\w.-]+@[\w.-]+\.\w+/.test(text),
      hasPhoneNumbers:
        /[\+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,6}/.test(text),

      // Processing metadata
      processingTime: processed.processingTime,
      transformations: processed.transformations || [],
    };

    return features;
  }

  calculateAverageWordLength(text) {
    const words = this.tokenizer.tokenize(text);
    if (words.length === 0) return 0;

    const totalLength = words.reduce((sum, word) => sum + word.length, 0);
    return totalLength / words.length;
  }

  calculateReadability(text) {
    // Flesch Reading Ease simplified
    const sentences = this.sentenceTokenizer.tokenize(text);
    const words = this.tokenizer.tokenize(text);

    if (sentences.length === 0 || words.length === 0) return 0;

    const wordsPerSentence = words.length / sentences.length;
    const syllablesPerWord = this.estimateSyllablesPerWord(words);

    // Simplified Flesch score
    const score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
    return Math.max(0, Math.min(100, score));
  }

  estimateSyllablesPerWord(words) {
    let totalSyllables = 0;

    for (const word of words) {
      // Simple syllable estimation
      let syllables = 0;
      const vowels = "aeiouy";
      let prevWasVowel = false;

      for (let i = 0; i < word.length; i++) {
        const isVowel = vowels.includes(word[i].toLowerCase());
        if (isVowel && !prevWasVowel) {
          syllables++;
        }
        prevWasVowel = isVowel;
      }

      // Adjust for silent e
      if (word.length > 2 && word.endsWith("e")) {
        syllables--;
      }

      // At least one syllable
      syllables = Math.max(1, syllables);
      totalSyllables += syllables;
    }

    return words.length > 0 ? totalSyllables / words.length : 0;
  }

  countPositiveWords(text) {
    const positiveWords = [
      "good",
      "great",
      "excellent",
      "amazing",
      "wonderful",
      "fantastic",
      "awesome",
      "love",
      "like",
    ];
    const words = this.tokenizer.tokenize(text.toLowerCase());

    return words.filter((word) => positiveWords.includes(word)).length;
  }

  countNegativeWords(text) {
    const negativeWords = [
      "bad",
      "poor",
      "terrible",
      "awful",
      "horrible",
      "hate",
      "dislike",
      "worst",
    ];
    const words = this.tokenizer.tokenize(text.toLowerCase());

    return words.filter((word) => negativeWords.includes(word)).length;
  }

  countUniqueWords(text) {
    const words = this.tokenizer.tokenize(text.toLowerCase());
    const uniqueWords = new Set(words);
    return uniqueWords.size;
  }

  getMostCommonWords(text, limit = 10) {
    const words = this.tokenizer.tokenize(text.toLowerCase());
    const wordCount = {};

    for (const word of words) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }

    const sortedWords = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));

    return sortedWords;
  }

  // Data Cleaning Methods
  cleanDataset(data, options = {}) {
    const cleaned = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      try {
        const item = data[i];
        let cleanedItem = { ...item };

        // Remove null/undefined values if specified
        if (options.removeNulls) {
          for (const key in cleanedItem) {
            if (cleanedItem[key] === null || cleanedItem[key] === undefined) {
              delete cleanedItem[key];
            }
          }
        }

        // Remove duplicate fields if specified
        if (options.removeDuplicates) {
          cleanedItem = this.removeDuplicateFields(cleanedItem);
        }

        // Standardize field names if specified
        if (options.standardizeFields) {
          cleanedItem = this.standardizeFieldNames(cleanedItem);
        }

        // Validate data if specified
        if (options.validate) {
          const validation = this.validateData(
            cleanedItem,
            options.validationSchema
          );
          if (!validation.valid && options.strictValidation) {
            errors.push({
              index: i,
              errors: validation.errors,
              original: item,
            });
            continue; // Skip invalid items in strict mode
          }

          cleanedItem = validation.data;
        }

        cleaned.push(cleanedItem);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          original: data[i],
        });
      }
    }

    return {
      cleanedData: cleaned,
      errors,
      stats: {
        originalCount: data.length,
        cleanedCount: cleaned.length,
        errorCount: errors.length,
        successRate: (cleaned.length / data.length) * 100,
      },
    };
  }

  removeDuplicateFields(obj) {
    const seen = new Set();
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
      const valueString = JSON.stringify(value);
      if (!seen.has(valueString)) {
        seen.add(valueString);
        result[key] = value;
      }
    }

    return result;
  }

  standardizeFieldNames(obj) {
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
      const standardizedKey = key
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");

      result[standardizedKey] = value;
    }

    return result;
  }

  // Data Sampling Methods
  sampleData(data, sampleSize, method = "random") {
    if (sampleSize >= data.length) {
      return [...data];
    }

    switch (method) {
      case "random":
        return this.randomSample(data, sampleSize);
      case "stratified":
        return this.stratifiedSample(data, sampleSize);
      case "systematic":
        return this.systematicSample(data, sampleSize);
      default:
        throw new Error(`Unknown sampling method: ${method}`);
    }
  }

  randomSample(data, sampleSize) {
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, sampleSize);
  }

  stratifiedSample(data, sampleSize, strataField = "category") {
    // Group by strata
    const strata = {};
    for (const item of data) {
      const stratum = item[strataField] || "unknown";
      if (!strata[stratum]) {
        strata[stratum] = [];
      }
      strata[stratum].push(item);
    }

    // Calculate sample size per stratum
    const result = [];
    for (const [stratum, items] of Object.entries(strata)) {
      const stratumSampleSize = Math.ceil(
        (items.length / data.length) * sampleSize
      );
      const stratumSample = this.randomSample(items, stratumSampleSize);
      result.push(...stratumSample);
    }

    // Trim to exact sample size if needed
    return result.slice(0, sampleSize);
  }

  systematicSample(data, sampleSize) {
    const interval = Math.floor(data.length / sampleSize);
    const result = [];

    for (let i = 0; i < sampleSize; i++) {
      const index = Math.min(i * interval, data.length - 1);
      result.push(data[index]);
    }

    return result;
  }

  // Utility Methods
  getTextCacheKey(text, options) {
    const optionsString = JSON.stringify(options);
    const hash = crypto
      .createHash("md5")
      .update(text + optionsString)
      .digest("hex");
    return hash;
  }

  clearCache() {
    this.cache.clear();
    this.stats.cached = 0;
    console.log("Data processor cache cleared");
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      cacheHitRate:
        this.stats.processed > 0
          ? (this.stats.cached / this.stats.processed) * 100
          : 0,
    };
  }

  // Batch Processing with Concurrency
  async processBatchAsync(items, processorFn, options = {}) {
    const {
      batchSize = this.config.performance.batchSize,
      concurrency = this.config.performance.concurrency,
      progressCallback,
    } = options;

    const results = [];
    const errors = [];

    // Split into batches
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    // Process batches with concurrency control
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);

      const batchPromises = concurrentBatches.map(async (batch, batchIndex) => {
        const batchResults = [];
        const batchErrors = [];

        for (const item of batch) {
          try {
            const result = await processorFn(item);
            batchResults.push(result);
          } catch (error) {
            batchErrors.push({
              item,
              error: error.message,
            });
          }
        }

        // Call progress callback if provided
        if (progressCallback) {
          progressCallback({
            total: items.length,
            processed: results.length + batchResults.length,
            currentBatch: batchIndex + 1,
            totalBatches: batches.length,
          });
        }

        return { results: batchResults, errors: batchErrors };
      });

      const batchResults = await Promise.all(batchPromises);

      for (const {
        results: batchResultsArray,
        errors: batchErrorsArray,
      } of batchResults) {
        results.push(...batchResultsArray);
        errors.push(...batchErrorsArray);
      }

      // Small delay between batch groups
      if (i + concurrency < batches.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return {
      results,
      errors,
      stats: {
        totalItems: items.length,
        processedItems: results.length,
        errorItems: errors.length,
        successRate: (results.length / items.length) * 100,
      },
    };
  }
}

// Factory function
function createDataProcessor(config = {}) {
  return new DataProcessor(config);
}

// Utility functions for common tasks
function normalizeText(text) {
  const processor = new DataProcessor();
  return processor.processText(text, {
    removeUrls: true,
    removeEmails: true,
    removeSpecialCharacters: true,
    normalizeWhitespace: true,
    convertToLowercase: true,
  }).text;
}

function validateUserData(userData) {
  const processor = new DataProcessor();

  const schema = {
    requiredFields: ["email", "name"],
    fieldTypes: {
      email: "email",
      name: "string",
      age: "integer",
      phone: "phone",
    },
    valueRanges: {
      age: { min: 13, max: 120 },
      email: { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
    },
  };

  return processor.validateData(userData, schema);
}

function extractFeaturesFromTexts(texts) {
  const processor = new DataProcessor();
  return texts.map((text) => processor.extractTextFeatures(text));
}

module.exports = {
  DataProcessor,
  createDataProcessor,
  normalizeText,
  validateUserData,
  extractFeaturesFromTexts,
};
