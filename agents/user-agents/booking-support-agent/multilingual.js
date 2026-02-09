const logger = require("../../../config/logger");

class MultilingualSupport {
  constructor() {
    this.francAvailable = false;
    this.franc = null;
    this.francMinLength = 10;

    try {
      // Try different ways franc might be exported
      const francModule = require("franc");

      // Check different export patterns
      if (typeof francModule === "function") {
        // Direct function export: module.exports = function() {}
        this.franc = francModule;
        this.francAvailable = true;
      } else if (typeof francModule.default === "function") {
        // ES6 default export: export default function()
        this.franc = francModule.default;
        this.francAvailable = true;
      } else if (typeof francModule.franc === "function") {
        // Named export: export { franc }
        this.franc = francModule.franc;
        this.francAvailable = true;
      } else {
        logger.warn("Franc module found but no valid function export");
        this.francAvailable = false;
      }

      if (this.francAvailable) {
        logger.info("Franc language detection library loaded successfully");
        logger.debug(`Franc function type: ${typeof this.franc}`);
      }
    } catch (error) {
      logger.warn("Franc library not found. Using pattern-based detection.");
      logger.debug(`Franc require error: ${error.message}`);
    }

    this.languagePatterns = {
      en: {
        name: "English",
        nativeName: "English",
        patterns: [
          /\b(hello|hi|thanks|thank you|how|what|please|yes|no|cancel|booking|refund|book|payment|pay)\b/i,
        ],
        greetings: ["Hello", "Hi", "Welcome"],
        script: "latin",
      },
      ne: {
        name: "Nepali",
        nativeName: "नेपाली",
        patterns: [
          /[\u0900-\u097F]/,
          /नमस्ते|धन्यवाद|कसरी|कस्तो|छ|होला|गर्नुहोस्|बुकिङ|रद्द|कित्ता|पैसा|भुक्तानी|खाता|लगइन|पासवर्ड/,
        ],
        greetings: ["नमस्ते", "नमस्कार"],
        script: "devanagari",
      },
      hi: {
        name: "Hindi",
        nativeName: "हिन्दी",
        patterns: [
          /[\u0900-\u097F]/,
          /नमस्कार|धन्यवाद|कैसे|हैं|है|करें|बुकिंग|रद्द|टिकट|भुगतान|खाता|लॉगिन|पासवर्ड/,
        ],
        greetings: ["नमस्कार", "नमस्ते"],
        script: "devanagari",
      },
      es: {
        name: "Spanish",
        nativeName: "Español",
        patterns: [
          /\b(hola|gracias|cómo|qué|por favor|sí|no|cancelar|reserva|pago|método|tarjeta)\b/i,
        ],
        greetings: ["Hola", "Buenos días"],
        script: "latin",
      },
      fr: {
        name: "French",
        nativeName: "Français",
        patterns: [
          /\b(bonjour|merci|comment|quoi|s'il vous plaît|oui|non|annuler|réservation|paiement|méthode|carte)\b/i,
        ],
        greetings: ["Bonjour", "Salut"],
        script: "latin",
      },
      de: {
        name: "German",
        nativeName: "Deutsch",
        patterns: [
          /\b(hallo|danke|wie|was|bitte|ja|nein|stornieren|buchung|zahlung|methode|karte)\b/i,
        ],
        greetings: ["Hallo", "Guten Tag"],
        script: "latin",
      },
      zh: {
        name: "Chinese",
        nativeName: "中文",
        patterns: [
          /[\u4e00-\u9fff]/,
          /你好|谢谢|怎么|什么|请|是|不|取消|预订|付款|方法|卡/,
        ],
        greetings: ["你好", "您好"],
        script: "chinese",
      },
      ja: {
        name: "Japanese",
        nativeName: "日本語",
        patterns: [
          /[\u3040-\u309f\u30a0-\u30ff]/,
          /こんにちは|ありがとう|どう|何|お願い|はい|いいえ|キャンセル|予約|支払い|方法|カード/,
        ],
        greetings: ["こんにちは", "おはよう"],
        script: "japanese",
      },
    };

    this.defaultLanguage = "en";
    this.translationEnabled = false;
    this.detectionStats = { totalDetections: 0, detectionsByLanguage: {} };
  }

  detectLanguage(text) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return this.defaultLanguage;
    }

    const trimmedText = text.trim();

    // Try franc detection if available and text is long enough
    if (
      this.francAvailable &&
      this.franc &&
      trimmedText.length >= this.francMinLength
    ) {
      try {
        // For better franc compatibility, try different calling patterns
        let francResult;

        if (typeof this.franc === "function") {
          // Try calling with options first
          try {
            francResult = this.franc(trimmedText, {
              minLength: this.francMinLength,
              only: ["eng", "nep", "hin", "spa", "fra", "deu", "cmn", "jpn"],
            });
          } catch (optionsError) {
            // Fall back to simple call
            francResult = this.franc(trimmedText);
          }

          if (francResult && francResult !== "und") {
            const langCode = this.mapFrancToISO639_1(francResult);
            if (langCode && this.isSupported(langCode)) {
              logger.debug(
                `Franc detected: ${this.getLanguageName(
                  langCode
                )} (${langCode})`
              );
              this.recordDetection(langCode);
              return langCode;
            }
          }
        }
      } catch (error) {
        logger.debug(`Franc detection failed: ${error.message}`);
        // Continue to pattern detection
      }
    }

    // Fall back to pattern-based detection
    return this.detectLanguageByPatterns(trimmedText);
  }

  detectLanguageByPatterns(text) {
    const trimmedText = text.trim();

    // First pass: Try pattern matching
    for (const [langCode, config] of Object.entries(this.languagePatterns)) {
      for (const pattern of config.patterns) {
        if (pattern.test(trimmedText)) {
          logger.debug(`Pattern detected: ${config.name} (${langCode})`);
          this.recordDetection(langCode);
          return langCode;
        }
      }
    }

    // Second pass: Script detection for specific character ranges
    if (/[\u0900-\u097F]/.test(trimmedText)) {
      // Check for Nepali-specific words
      const nepaliWords =
        /छ|होला|गर्नुहोस्|कसरी|कस्तो|बुकिङ|भुक्तानी|खाता/.test(trimmedText);
      const hindiWords = /हैं|है|करें|बुकिंग|भुगतान|खाता/.test(trimmedText);

      if (nepaliWords && !hindiWords) {
        logger.debug("Script detected: Nepali (ne) - based on specific words");
        this.recordDetection("ne");
        return "ne";
      } else {
        logger.debug("Script detected: Hindi (hi)");
        this.recordDetection("hi");
        return "hi";
      }
    }

    if (/[\u4e00-\u9fff]/.test(trimmedText)) {
      logger.debug("Script detected: Chinese (zh)");
      this.recordDetection("zh");
      return "zh";
    }

    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(trimmedText)) {
      logger.debug("Script detected: Japanese (ja)");
      this.recordDetection("ja");
      return "ja";
    }

    // Default to English
    logger.debug("Language detection defaulted to English");
    this.recordDetection(this.defaultLanguage);
    return this.defaultLanguage;
  }

  mapFrancToISO639_1(francCode) {
    const mapping = {
      eng: "en",
      nep: "ne",
      hin: "hi",
      spa: "es",
      fra: "fr",
      deu: "de",
      cmn: "zh",
      jpn: "ja",
      und: null,
    };
    return mapping[francCode] || null;
  }

  getGreeting(languageCode = "en") {
    const config = this.languagePatterns[languageCode];
    if (!config || !config.greetings || config.greetings.length === 0) {
      return this.languagePatterns["en"].greetings[0];
    }
    return config.greetings[0];
  }

  getLanguageName(languageCode) {
    return this.languagePatterns[languageCode]?.name || "English";
  }

  getNativeLanguageName(languageCode) {
    return this.languagePatterns[languageCode]?.nativeName || "English";
  }

  needsTranslation(languageCode) {
    return languageCode !== "en" && !this.translationEnabled;
  }

  getLanguageInstruction(languageCode) {
    const languageName = this.getLanguageName(languageCode);
    const nativeName = this.getNativeLanguageName(languageCode);

    if (languageCode === "en") return "";

    if (!this.translationEnabled) {
      return `
LANGUAGE DETECTION: The user is communicating in ${languageName} (${nativeName}).
RESPONSE GUIDELINES:
1. Start with a brief acknowledgment in their language: "${this.getGreeting(
        languageCode
      )}!"
2. Mention you'll respond in English for now
3. Keep acknowledgment brief (1 sentence)
4. Provide full response in English
Example: "${this.getGreeting(
        languageCode
      )}! I noticed you're communicating in ${languageName}. I'll respond in English for now. [Continue...]"`;
    }

    return `
LANGUAGE INSTRUCTION: The user is communicating in ${languageName} (${nativeName}).
CRITICAL: Respond ENTIRELY in ${languageName}. Translate accurately while maintaining technical accuracy and helpful tone.`;
  }

  wrapResponse(response, languageCode = "en") {
    if (languageCode === "en") return response;

    const greeting = this.getGreeting(languageCode);
    const languageName = this.getLanguageName(languageCode);

    if (!this.translationEnabled) {
      return `${greeting}! I noticed you're communicating in ${languageName}. I'll respond in English for now.\n\n${response}`;
    }

    return response;
  }

  getSupportedLanguages() {
    return Object.entries(this.languagePatterns).map(([code, config]) => ({
      code,
      name: config.name,
      nativeName: config.nativeName,
      script: config.script,
    }));
  }

  isSupported(code) {
    return !!this.languagePatterns[code];
  }

  recordDetection(languageCode) {
    this.detectionStats.totalDetections++;
    if (!this.detectionStats.detectionsByLanguage[languageCode]) {
      this.detectionStats.detectionsByLanguage[languageCode] = 0;
    }
    this.detectionStats.detectionsByLanguage[languageCode]++;
  }

  getStats() {
    return {
      supportedLanguages: this.getSupportedLanguages().length,
      defaultLanguage: this.defaultLanguage,
      translationEnabled: this.translationEnabled,
      francAvailable: this.francAvailable,
      francFunctionType: this.franc ? typeof this.franc : "none",
      francMinLength: this.francMinLength,
      detectionMethod:
        this.francAvailable && this.franc
          ? "franc + patterns"
          : "patterns only",
      detectionStats: {
        total: this.detectionStats.totalDetections,
        byLanguage: this.detectionStats.detectionsByLanguage,
      },
    };
  }

  resetStats() {
    this.detectionStats = { totalDetections: 0, detectionsByLanguage: {} };
    logger.info("Multilingual statistics reset");
  }

  enableTranslation(enable = true) {
    this.translationEnabled = enable;
    logger.info(
      `Translation ${enable ? "enabled" : "disabled"} (Phase ${
        enable ? "2" : "1"
      } mode)`
    );
  }
}

module.exports = new MultilingualSupport();
