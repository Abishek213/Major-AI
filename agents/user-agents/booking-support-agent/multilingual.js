const logger = require("../../../config/logger");

/**
 * ============================================================================
 * MULTILINGUAL SUPPORT FOR AI AGENTS
 * ============================================================================
 *
 * PURPOSE:
 * - Automatically detects user's language
 * - Enables responses in multiple languages
 * - Supports global user base
 * - Currently: Detection + acknowledgment
 * - Future: Full translation with GPT or Google Translate API
 *
 * ============================================================================
 * PHASE 1 (CURRENT):
 * ============================================================================
 * - Detect language from user input
 * - Acknowledge user's language
 * - Respond in English
 * - Example:
 *   User: "नमस्ते, म बुकिङ रद्द गर्न चाहन्छु"
 *   Agent: "Namaste! I noticed you're communicating in Nepali.
 *           I'll respond in English for now. To cancel your booking..."
 *
 * ============================================================================
 * PHASE 2 (FUTURE):
 * ============================================================================
 * - Full response translation
 * - Use OpenAI for translation (maintains context)
 * - Example:
 *   User: "नमस्ते, म बुकिङ रद्द गर्न चाहन्छु"
 *   Agent: "नमस्ते! तपाईंको बुकिङ रद्द गर्न..."
 *
 * ============================================================================
 * SUPPORTED LANGUAGES:
 * ============================================================================
 * Primary:
 * - English (en) - Default
 * - Nepali (ne) - Target market
 * - Hindi (hi) - Large user base
 *
 * Additional:
 * - Spanish (es)
 * - French (fr)
 * - German (de)
 * - Chinese (zh)
 * - Japanese (ja)
 *
 * ============================================================================
 */

class MultilingualSupport {
  constructor() {
    // Try to load franc for better language detection
    // franc is a statistical language detection library
    // Falls back to pattern matching if not available
    this.francAvailable = false;
    this.franc = null;

    try {
      this.franc = require("franc");
      this.francAvailable = true;
      logger.info("✅ Franc language detection library loaded");
    } catch (error) {
      logger.warn("⚠️ Franc library not found. Using pattern-based detection.");
      logger.warn("Install franc for better detection: npm install franc");
    }

    // Language configuration
    // Each language has:
    // - name: Display name
    // - patterns: Regex patterns for detection (fallback)
    // - greetings: Greeting phrases
    // - script: Character script used (for fallback detection)
    this.languagePatterns = {
      en: {
        name: "English",
        nativeName: "English",
        patterns: [
          /\b(hello|hi|thanks|thank you|how|what|please|yes|no|cancel|booking|refund)\b/i,
        ],
        greetings: ["Hello", "Hi", "Welcome"],
        script: "latin",
      },
      ne: {
        name: "Nepali",
        nativeName: "नेपाली",
        patterns: [
          /[\u0900-\u097F]/, // Devanagari script
          /नमस्ते|धन्यवाद|कस्तो|छ|होला|गर्नुहोस्|बुकिङ|रद्द/,
        ],
        greetings: ["नमस्ते", "नमस्कार"],
        script: "devanagari",
      },
      hi: {
        name: "Hindi",
        nativeName: "हिन्दी",
        patterns: [
          /[\u0900-\u097F]/, // Devanagari script (shared with Nepali)
          /नमस्कार|धन्यवाद|कैसे|हैं|है|करें|बुकिंग|रद्द/,
        ],
        greetings: ["नमस्कार", "नमस्ते"],
        script: "devanagari",
      },
      es: {
        name: "Spanish",
        nativeName: "Español",
        patterns: [
          /\b(hola|gracias|cómo|qué|por favor|sí|no|cancelar|reserva)\b/i,
        ],
        greetings: ["Hola", "Buenos días"],
        script: "latin",
      },
      fr: {
        name: "French",
        nativeName: "Français",
        patterns: [
          /\b(bonjour|merci|comment|quoi|s'il vous plaît|oui|non|annuler|réservation)\b/i,
        ],
        greetings: ["Bonjour", "Salut"],
        script: "latin",
      },
      de: {
        name: "German",
        nativeName: "Deutsch",
        patterns: [
          /\b(hallo|danke|wie|was|bitte|ja|nein|stornieren|buchung)\b/i,
        ],
        greetings: ["Hallo", "Guten Tag"],
        script: "latin",
      },
      zh: {
        name: "Chinese",
        nativeName: "中文",
        patterns: [
          /[\u4e00-\u9fff]/, // Chinese characters
          /你好|谢谢|怎么|什么|请|是|不|取消|预订/,
        ],
        greetings: ["你好", "您好"],
        script: "chinese",
      },
      ja: {
        name: "Japanese",
        nativeName: "日本語",
        patterns: [
          /[\u3040-\u309f\u30a0-\u30ff]/, // Hiragana and Katakana
          /こんにちは|ありがとう|どう|何|お願い|はい|いいえ|キャンセル|予約/,
        ],
        greetings: ["こんにちは", "おはよう"],
        script: "japanese",
      },
    };

    this.defaultLanguage = "en";
    this.translationEnabled = false; // Phase 2 feature

    // Language detection statistics
    this.detectionStats = {
      totalDetections: 0,
      detectionsByLanguage: {},
    };
  }

  /**
   * ========================================================================
   * DETECT LANGUAGE
   * ========================================================================
   *
   * Uses franc library if available, falls back to pattern matching
   *
   * DETECTION STRATEGY:
   * 1. Try franc (statistical analysis) - most accurate
   * 2. Fall back to pattern matching if franc unavailable
   * 3. Default to English if no match
   *
   * @param {string} text - User's message
   * @returns {string} Detected language code (en, ne, hi, es, etc.)
   */
  detectLanguage(text) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return this.defaultLanguage;
    }

    const trimmedText = text.trim();

    // ===================================================================
    // METHOD 1: Use franc library (if available)
    // ===================================================================
    if (this.francAvailable && trimmedText.length >= 10) {
      try {
        // franc returns ISO 639-3 codes, we need to map to ISO 639-1
        const francResult = this.franc(trimmedText);
        const langCode = this.mapFrancToISO639_1(francResult);

        if (langCode && this.isSupported(langCode)) {
          logger.debug(
            `🌐 Franc detected: ${this.getLanguageName(langCode)} (${langCode})`
          );
          this.recordDetection(langCode);
          return langCode;
        }
      } catch (error) {
        logger.warn("Franc detection error, falling back to patterns");
      }
    }

    // ===================================================================
    // METHOD 2: Pattern-based detection (fallback)
    // ===================================================================
    const lowerText = trimmedText.toLowerCase();

    // Check each language's patterns
    for (const [langCode, config] of Object.entries(this.languagePatterns)) {
      for (const pattern of config.patterns) {
        if (pattern.test(trimmedText)) {
          logger.debug(`🌐 Pattern detected: ${config.name} (${langCode})`);
          this.recordDetection(langCode);
          return langCode;
        }
      }
    }

    // ===================================================================
    // METHOD 3: Script-based detection (last resort)
    // ===================================================================
    // Check for specific character scripts
    if (/[\u0900-\u097F]/.test(trimmedText)) {
      // Devanagari - could be Nepali or Hindi
      // Simple heuristic: if contains Nepali-specific words, it's Nepali
      if (/छ|होला|गर्नुहोस्/.test(trimmedText)) {
        logger.debug("🌐 Script detected: Nepali (ne)");
        this.recordDetection("ne");
        return "ne";
      }
      logger.debug("🌐 Script detected: Hindi (hi)");
      this.recordDetection("hi");
      return "hi";
    }

    if (/[\u4e00-\u9fff]/.test(trimmedText)) {
      logger.debug("🌐 Script detected: Chinese (zh)");
      this.recordDetection("zh");
      return "zh";
    }

    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(trimmedText)) {
      logger.debug("🌐 Script detected: Japanese (ja)");
      this.recordDetection("ja");
      return "ja";
    }

    // ===================================================================
    // DEFAULT: English
    // ===================================================================
    logger.debug("🌐 Language detection defaulted to English");
    this.recordDetection(this.defaultLanguage);
    return this.defaultLanguage;
  }

  /**
   * ========================================================================
   * MAP FRANC CODES TO ISO 639-1
   * ========================================================================
   *
   * Franc uses ISO 639-3 (3-letter codes)
   * We use ISO 639-1 (2-letter codes)
   *
   * @param {string} francCode - Franc language code
   * @returns {string|null} ISO 639-1 code
   */
  mapFrancToISO639_1(francCode) {
    const mapping = {
      eng: "en", // English
      nep: "ne", // Nepali
      hin: "hi", // Hindi
      spa: "es", // Spanish
      fra: "fr", // French
      deu: "de", // German
      cmn: "zh", // Chinese (Mandarin)
      jpn: "ja", // Japanese
      und: null, // Undetermined
    };

    return mapping[francCode] || null;
  }

  /**
   * ========================================================================
   * GET GREETING
   * ========================================================================
   *
   * Returns appropriate greeting for language
   *
   * @param {string} languageCode - Language code
   * @returns {string} Greeting text
   */
  getGreeting(languageCode = "en") {
    const config = this.languagePatterns[languageCode];
    if (!config || !config.greetings || config.greetings.length === 0) {
      return this.languagePatterns["en"].greetings[0];
    }
    return config.greetings[0];
  }

  /**
   * ========================================================================
   * GET LANGUAGE NAME
   * ========================================================================
   *
   * @param {string} languageCode - Language code
   * @returns {string} Language name in English
   */
  getLanguageName(languageCode) {
    return this.languagePatterns[languageCode]?.name || "English";
  }

  /**
   * ========================================================================
   * GET NATIVE LANGUAGE NAME
   * ========================================================================
   *
   * Returns language name in its own language
   * Example: "Nepali" vs "नेपाली"
   *
   * @param {string} languageCode - Language code
   * @returns {string} Native language name
   */
  getNativeLanguageName(languageCode) {
    return this.languagePatterns[languageCode]?.nativeName || "English";
  }

  /**
   * ========================================================================
   * CHECK IF TRANSLATION NEEDED
   * ========================================================================
   *
   * Phase 1: Always needs translation (respond in English)
   * Phase 2: Will translate responses
   *
   * @param {string} languageCode - Detected language
   * @returns {boolean} Whether translation is needed
   */
  needsTranslation(languageCode) {
    // Phase 1: Translation not implemented yet
    return languageCode !== "en" && !this.translationEnabled;
  }

  /**
   * ========================================================================
   * GET LANGUAGE INSTRUCTION FOR AI
   * ========================================================================
   *
   * Provides instruction to AI about how to handle the language
   *
   * PHASE 1 (Current):
   * - Acknowledge user's language
   * - Respond in English
   *
   * PHASE 2 (Future):
   * - Respond in user's language
   * - Full translation
   *
   * @param {string} languageCode - Language code
   * @returns {string} Instruction for AI
   */
  getLanguageInstruction(languageCode) {
    const languageName = this.getLanguageName(languageCode);
    const nativeName = this.getNativeLanguageName(languageCode);

    if (languageCode === "en") {
      return ""; // No special instruction for English
    }

    // PHASE 1: Acknowledge but respond in English
    if (!this.translationEnabled) {
      return `

LANGUAGE DETECTION:
The user is communicating in ${languageName} (${nativeName}).

RESPONSE GUIDELINES:
1. Start with a brief acknowledgment in their language: "${this.getGreeting(
        languageCode
      )}!"
2. Politely mention you'll respond in English for now
3. Keep the acknowledgment brief (1 sentence)
4. Then provide your full helpful response in English

Example: "${this.getGreeting(
        languageCode
      )}! I noticed you're communicating in ${languageName}. I'll respond in English for now. [Continue with helpful response...]"`;
    }

    // PHASE 2: Full translation (future)
    return `

LANGUAGE INSTRUCTION:
The user is communicating in ${languageName} (${nativeName}).

CRITICAL: Respond ENTIRELY in ${languageName}. Translate your complete response accurately while maintaining:
- Technical accuracy
- Helpful tone
- All specific details (dates, amounts, steps)

Use natural ${languageName} phrasing, not literal word-for-word translation.`;
  }

  /**
   * ========================================================================
   * WRAP RESPONSE (Phase 1 Helper)
   * ========================================================================
   *
   * Adds language-appropriate greeting to response
   * Currently used for Phase 1 acknowledgment
   *
   * @param {string} response - AI response
   * @param {string} languageCode - User's language
   * @returns {string} Enhanced response
   */
  wrapResponse(response, languageCode = "en") {
    if (languageCode === "en") {
      return response;
    }

    const greeting = this.getGreeting(languageCode);
    const languageName = this.getLanguageName(languageCode);

    // Phase 1: Acknowledge their language, respond in English
    if (!this.translationEnabled) {
      return (
        `${greeting}! I noticed you're communicating in ${languageName}. ` +
        `I'll respond in English for now.\n\n${response}`
      );
    }

    // Phase 2: Would contain translated response
    return response;
  }

  /**
   * ========================================================================
   * GET SUPPORTED LANGUAGES
   * ========================================================================
   *
   * @returns {Array} Array of {code, name, nativeName} objects
   */
  getSupportedLanguages() {
    return Object.entries(this.languagePatterns).map(([code, config]) => ({
      code,
      name: config.name,
      nativeName: config.nativeName,
      script: config.script,
    }));
  }

  /**
   * ========================================================================
   * VALIDATE LANGUAGE CODE
   * ========================================================================
   *
   * @param {string} code - Language code to validate
   * @returns {boolean} Whether code is supported
   */
  isSupported(code) {
    return !!this.languagePatterns[code];
  }

  /**
   * ========================================================================
   * RECORD DETECTION (ANALYTICS)
   * ========================================================================
   *
   * Tracks which languages are being used
   * Useful for prioritizing Phase 2 translation development
   *
   * @param {string} languageCode - Detected language code
   */
  recordDetection(languageCode) {
    this.detectionStats.totalDetections++;

    if (!this.detectionStats.detectionsByLanguage[languageCode]) {
      this.detectionStats.detectionsByLanguage[languageCode] = 0;
    }

    this.detectionStats.detectionsByLanguage[languageCode]++;
  }

  /**
   * ========================================================================
   * GET STATISTICS
   * ========================================================================
   *
   * Returns usage statistics
   *
   * @returns {Object} Multilingual support statistics
   */
  getStats() {
    return {
      supportedLanguages: this.getSupportedLanguages().length,
      defaultLanguage: this.defaultLanguage,
      translationEnabled: this.translationEnabled,
      francAvailable: this.francAvailable,
      detectionMethod: this.francAvailable
        ? "franc + patterns"
        : "patterns only",
      detectionStats: {
        total: this.detectionStats.totalDetections,
        byLanguage: this.detectionStats.detectionsByLanguage,
      },
    };
  }

  /**
   * ========================================================================
   * RESET STATISTICS
   * ========================================================================
   *
   * Clears detection statistics (useful for testing)
   */
  resetStats() {
    this.detectionStats = {
      totalDetections: 0,
      detectionsByLanguage: {},
    };
    logger.info("📊 Multilingual statistics reset");
  }

  /**
   * ========================================================================
   * ENABLE TRANSLATION (Phase 2 Feature)
   * ========================================================================
   *
   * Enables full translation mode
   * Requires additional setup (OpenAI translation or Google Translate API)
   *
   * @param {boolean} enable - Whether to enable translation
   */
  enableTranslation(enable = true) {
    this.translationEnabled = enable;
    logger.info(
      `🌐 Translation ${enable ? "enabled" : "disabled"} (Phase ${
        enable ? "2" : "1"
      } mode)`
    );
  }
}

module.exports = new MultilingualSupport();
