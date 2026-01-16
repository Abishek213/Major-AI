/**
 * Enhanced language detection and translation utilities
 * For multilingual support in AI agents
 */

const franc = require("franc");
const { translate } = require("@vitalets/google-translate-api");
const fs = require("fs").promises;
const path = require("path");

class LanguageDetector {
  constructor() {
    this.supportedLanguages = {
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      ru: "Russian",
      zh: "Chinese",
      ja: "Japanese",
      ko: "Korean",
      ar: "Arabic",
      hi: "Hindi",
      ne: "Nepali",
      th: "Thai",
      vi: "Vietnamese",
    };

    this.languageCache = new Map();
    this.translationCache = new Map();

    // Load language-specific configurations
    this.loadLanguageConfigs();
  }

  async loadLanguageConfigs() {
    try {
      const configPath = path.join(__dirname, "../config/languages.json");
      const configData = await fs.readFile(configPath, "utf8");
      this.languageConfigs = JSON.parse(configData);
    } catch (error) {
      console.warn("Could not load language configs, using defaults");
      this.languageConfigs = {};
    }
  }

  detectLanguage(text, options = {}) {
    const {
      minLength = 10,
      whitelist = Object.keys(this.supportedLanguages),
      cache = true,
    } = options;

    // Check cache first
    if (cache) {
      const cacheKey = text.substring(0, 100).toLowerCase();
      if (this.languageCache.has(cacheKey)) {
        return this.languageCache.get(cacheKey);
      }
    }

    // Validate input
    if (!text || text.trim().length < minLength) {
      const result = {
        language: "un",
        confidence: 0,
        reliable: false,
        iso6393: "und",
        name: "Unknown",
      };

      if (cache) {
        this.languageCache.set(text, result);
      }

      return result;
    }

    try {
      // Use franc for language detection
      const francResult = franc(text, { minLength, whitelist });
      const [languageCode, confidence] = francResult;

      const result = {
        language: languageCode,
        confidence: confidence,
        reliable: confidence > 0.8,
        iso6393: this.getISO6393Code(languageCode),
        name: this.supportedLanguages[languageCode] || "Unknown",
        detectedText: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
      };

      // Cache result
      if (cache) {
        const cacheKey = text.substring(0, 100).toLowerCase();
        this.languageCache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      console.error("Language detection error:", error);
      return {
        language: "un",
        confidence: 0,
        reliable: false,
        iso6393: "und",
        name: "Unknown",
        error: error.message,
      };
    }
  }

  async translateText(text, targetLang = "en", options = {}) {
    const { sourceLang = "auto", cache = true, fallback = true } = options;

    // Check cache first
    if (cache) {
      const cacheKey = `${text.substring(0, 50)}_${targetLang}`;
      if (this.translationCache.has(cacheKey)) {
        return this.translationCache.get(cacheKey);
      }
    }

    try {
      // First detect language if auto
      let detectedLang = sourceLang;
      if (sourceLang === "auto") {
        const detection = this.detectLanguage(text, { minLength: 5 });
        detectedLang = detection.language;

        // If same language, return original
        if (detectedLang === targetLang) {
          return {
            text: text,
            from: detectedLang,
            to: targetLang,
            original: text,
            confidence: 1,
          };
        }
      }

      // Translate using Google Translate API
      const result = await translate(text, {
        to: targetLang,
        from: detectedLang,
      });

      const translation = {
        text: result.text,
        from: result.from.language.iso,
        to: targetLang,
        original: text,
        confidence: result.raw ? result.raw.confidence : 0.8,
        raw: result.raw,
      };

      // Cache result
      if (cache) {
        const cacheKey = `${text.substring(0, 50)}_${targetLang}`;
        this.translationCache.set(cacheKey, translation);
      }

      return translation;
    } catch (error) {
      console.error("Translation error:", error);

      // Fallback to simple translation or return original
      if (fallback) {
        return {
          text: text,
          from: "un",
          to: targetLang,
          original: text,
          confidence: 0,
          error: error.message,
          fallback: true,
        };
      }

      throw error;
    }
  }

  async batchTranslate(texts, targetLang = "en", options = {}) {
    const {
      batchSize = 10,
      delayBetweenBatches = 1000,
      concurrency = 3,
    } = options;

    const results = [];
    const batches = [];

    // Create batches
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    // Process batches with concurrency control
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);

      const batchPromises = concurrentBatches.map(async (batch, batchIndex) => {
        const batchResults = [];

        for (const text of batch) {
          try {
            const translation = await this.translateText(
              text,
              targetLang,
              options
            );
            batchResults.push(translation);
          } catch (error) {
            batchResults.push({
              text: text,
              error: error.message,
              success: false,
            });
          }
        }

        return batchResults;
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.flat());

      // Delay between batches to avoid rate limiting
      if (i + concurrency < batches.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatches)
        );
      }
    }

    return results;
  }

  getISO6393Code(iso6391Code) {
    const mapping = {
      en: "eng",
      es: "spa",
      fr: "fra",
      de: "deu",
      it: "ita",
      pt: "por",
      ru: "rus",
      zh: "zho",
      ja: "jpn",
      ko: "kor",
      ar: "ara",
      hi: "hin",
      ne: "nep",
      th: "tha",
      vi: "vie",
    };

    return mapping[iso6391Code] || iso6391Code;
  }

  getLanguageInfo(languageCode) {
    const info = {
      code: languageCode,
      name: this.supportedLanguages[languageCode] || "Unknown",
      nativeName: this.getNativeName(languageCode),
      direction: this.getTextDirection(languageCode),
      script: this.getScript(languageCode),
      countryCodes: this.getCountryCodes(languageCode),
    };

    return info;
  }

  getNativeName(languageCode) {
    const nativeNames = {
      en: "English",
      es: "Español",
      fr: "Français",
      de: "Deutsch",
      it: "Italiano",
      pt: "Português",
      ru: "Русский",
      zh: "中文",
      ja: "日本語",
      ko: "한국어",
      ar: "العربية",
      hi: "हिन्दी",
      ne: "नेपाली",
      th: "ไทย",
      vi: "Tiếng Việt",
    };

    return (
      nativeNames[languageCode] ||
      this.supportedLanguages[languageCode] ||
      "Unknown"
    );
  }

  getTextDirection(languageCode) {
    const rtlLanguages = ["ar", "he", "fa", "ur"];
    return rtlLanguages.includes(languageCode) ? "rtl" : "ltr";
  }

  getScript(languageCode) {
    const scripts = {
      zh: "Han",
      ja: ["Han", "Hiragana", "Katakana"],
      ko: "Hangul",
      ar: "Arabic",
      ru: "Cyrillic",
      el: "Greek",
      he: "Hebrew",
    };

    return scripts[languageCode] || "Latin";
  }

  getCountryCodes(languageCode) {
    const countryMapping = {
      en: ["US", "GB", "AU", "CA", "IN"],
      es: ["ES", "MX", "AR", "CO", "PE"],
      fr: ["FR", "CA", "BE", "CH"],
      de: ["DE", "AT", "CH"],
      it: ["IT", "CH"],
      pt: ["PT", "BR"],
      ru: ["RU", "BY", "KZ"],
      zh: ["CN", "TW", "SG"],
      ja: ["JP"],
      ko: ["KR", "KP"],
      ar: ["SA", "EG", "AE", "IQ"],
      hi: ["IN"],
      ne: ["NP"],
      th: ["TH"],
      vi: ["VN"],
    };

    return countryMapping[languageCode] || [];
  }

  async createMultilingualResponse(
    text,
    targetLanguages = ["en"],
    options = {}
  ) {
    const {
      detectFirst = true,
      includeOriginal = true,
      format = "object", // 'object' or 'array'
    } = options;

    const response = {
      original: {
        text: text,
        language: "auto",
      },
      translations: [],
    };

    // Detect source language if needed
    if (detectFirst) {
      const detection = this.detectLanguage(text);
      response.original.language = detection.language;
      response.original.confidence = detection.confidence;
    }

    // Translate to target languages
    const translationPromises = targetLanguages.map(async (targetLang) => {
      if (targetLang === response.original.language) {
        return {
          language: targetLang,
          text: text,
          confidence: 1,
          isOriginal: true,
        };
      }

      try {
        const translation = await this.translateText(text, targetLang, options);
        return {
          language: targetLang,
          text: translation.text,
          confidence: translation.confidence,
          isOriginal: false,
          from: translation.from,
        };
      } catch (error) {
        return {
          language: targetLang,
          text: text, // Fallback to original
          confidence: 0,
          error: error.message,
          isOriginal: false,
        };
      }
    });

    const translations = await Promise.all(translationPromises);
    response.translations = translations;

    // Format response
    if (format === "array") {
      return translations.map((t) => ({
        lang: t.language,
        text: t.text,
        confidence: t.confidence,
      }));
    }

    return response;
  }

  async analyzeMultilingualContent(contentArray, options = {}) {
    const {
      groupByLanguage = true,
      threshold = 0.7,
      includeStats = true,
    } = options;

    const analyses = [];

    for (const content of contentArray) {
      const analysis = this.detectLanguage(content.text || content, {
        minLength: 5,
        cache: false,
      });

      analyses.push({
        content: typeof content === "string" ? content : content.text,
        original: content,
        analysis: analysis,
        length: (content.text || content).length,
      });
    }

    const result = {
      analyses: analyses,
      stats: null,
    };

    if (includeStats) {
      result.stats = this.calculateLanguageStats(analyses, threshold);
    }

    if (groupByLanguage) {
      result.grouped = this.groupByLanguage(analyses, threshold);
    }

    return result;
  }

  calculateLanguageStats(analyses, threshold = 0.7) {
    const stats = {
      total: analyses.length,
      languages: {},
      reliable: 0,
      unreliable: 0,
    };

    for (const analysis of analyses) {
      const lang = analysis.analysis.language;
      const isReliable = analysis.analysis.confidence >= threshold;

      if (!stats.languages[lang]) {
        stats.languages[lang] = {
          count: 0,
          reliable: 0,
          unreliable: 0,
          totalLength: 0,
          avgConfidence: 0,
        };
      }

      stats.languages[lang].count++;
      stats.languages[lang].totalLength += analysis.length;
      stats.languages[lang].avgConfidence =
        (stats.languages[lang].avgConfidence *
          (stats.languages[lang].count - 1) +
          analysis.analysis.confidence) /
        stats.languages[lang].count;

      if (isReliable) {
        stats.languages[lang].reliable++;
        stats.reliable++;
      } else {
        stats.languages[lang].unreliable++;
        stats.unreliable++;
      }
    }

    // Calculate percentages
    for (const lang in stats.languages) {
      const langStats = stats.languages[lang];
      langStats.percentage = (langStats.count / stats.total) * 100;
      langStats.reliablePercentage =
        langStats.reliable > 0
          ? (langStats.reliable / langStats.count) * 100
          : 0;
    }

    return stats;
  }

  groupByLanguage(analyses, threshold = 0.7) {
    const groups = {};

    for (const analysis of analyses) {
      const lang = analysis.analysis.language;

      if (!groups[lang]) {
        groups[lang] = {
          language: lang,
          name: this.supportedLanguages[lang] || "Unknown",
          analyses: [],
          count: 0,
          reliableCount: 0,
        };
      }

      groups[lang].analyses.push(analysis);
      groups[lang].count++;

      if (analysis.analysis.confidence >= threshold) {
        groups[lang].reliableCount++;
      }
    }

    // Sort by count
    return Object.values(groups)
      .sort((a, b) => b.count - a.count)
      .map((group) => ({
        ...group,
        reliablePercentage: (group.reliableCount / group.count) * 100,
      }));
  }

  clearCache() {
    this.languageCache.clear();
    this.translationCache.clear();
    console.log("Language detection cache cleared");
  }

  getCacheStats() {
    return {
      languageCache: this.languageCache.size,
      translationCache: this.translationCache.size,
      total: this.languageCache.size + this.translationCache.size,
    };
  }
}

// Singleton instance
let instance = null;

function getLanguageDetector() {
  if (!instance) {
    instance = new LanguageDetector();
  }
  return instance;
}

// Utility functions for common use cases
async function detectAndTranslate(text, targetLang = "en", options = {}) {
  const detector = getLanguageDetector();
  const detection = detector.detectLanguage(text, options);

  if (detection.language === targetLang) {
    return {
      original: text,
      translated: text,
      from: detection.language,
      to: targetLang,
      confidence: detection.confidence,
      wasTranslated: false,
    };
  }

  const translation = await detector.translateText(text, targetLang, options);

  return {
    original: text,
    translated: translation.text,
    from: translation.from,
    to: targetLang,
    confidence: translation.confidence,
    wasTranslated: true,
  };
}

async function getMultilingualFAQ(
  faqItems,
  targetLanguages = ["en"],
  options = {}
) {
  const detector = getLanguageDetector();
  const multilingualFAQ = [];

  for (const faq of faqItems) {
    const multilingualItem = {
      id: faq.id,
      question: {},
      answer: {},
      category: faq.category,
      tags: faq.tags,
    };

    // Translate question and answer to each target language
    for (const lang of targetLanguages) {
      const questionTrans = await detector.translateText(
        faq.question,
        lang,
        options
      );
      const answerTrans = await detector.translateText(
        faq.answer,
        lang,
        options
      );

      multilingualItem.question[lang] = {
        text: questionTrans.text,
        confidence: questionTrans.confidence,
      };

      multilingualItem.answer[lang] = {
        text: answerTrans.text,
        confidence: answerTrans.confidence,
      };
    }

    multilingualFAQ.push(multilingualItem);
  }

  return multilingualFAQ;
}

module.exports = {
  LanguageDetector,
  getLanguageDetector,
  detectAndTranslate,
  getMultilingualFAQ,
};
