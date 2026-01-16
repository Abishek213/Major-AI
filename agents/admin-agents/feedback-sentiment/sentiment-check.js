const logger = require('../../../config/logger');

class SentimentCheck {
  constructor() {
    this.positiveWords = new Set([
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
      'awesome', 'perfect', 'love', 'enjoy', 'happy', 'satisfied',
      'impressive', 'outstanding', 'superb', 'brilliant', 'nice', 'best'
    ]);
    
    this.negativeWords = new Set([
      'bad', 'terrible', 'awful', 'horrible', 'poor', 'disappointing',
      'worst', 'hate', 'dislike', 'unhappy', 'unsatisfied', 'frustrated',
      'annoying', 'ridiculous', 'useless', 'waste', 'broken', 'failed'
    ]);
    
    this.issuePatterns = {
      'pricing': /\b(expensive|overpriced|costly|pricey|cheap|value)\b/i,
      'logistics': /\b(late|delay|wait|schedule|timing|location|venue)\b/i,
      'quality': /\b(quality|standard|professional|amateur|experienced)\b/i,
      'service': /\b(service|staff|helpful|rude|friendly|support)\b/i,
      'organization': /\b(organized|chaos|confusion|planning|management)\b/i,
      'technical': /\b(technical|issues|bug|glitch|error|crash|broken)\b/i
    };
    
    this.topicPatterns = {
      'food': /\b(food|drink|meal|snack|beverage|water|coffee)\b/i,
      'venue': /\b(venue|hall|room|space|facility|location|place)\b/i,
      'speakers': /\b(speaker|presenter|trainer|instructor|expert)\b/i,
      'content': /\b(content|material|information|knowledge|learning)\b/i,
      'networking': /\b(networking|connection|people|attendees|crowd)\b/i,
      'entertainment': /\b(entertainment|music|performance|show|fun)\b/i
    };
  }

  async initialize() {
    logger.agent('SentimentCheck', 'Initializing sentiment analyzer');
    return true;
  }

  async analyzeSentiment(text) {
    try {
      const cleanedText = this.cleanText(text);
      const words = cleanedText.toLowerCase().split(/\W+/).filter(w => w.length > 2);
      
      let positive = 0;
      let negative = 0;
      let neutral = 0;
      
      // Count sentiment words
      words.forEach(word => {
        if (this.positiveWords.has(word)) {
          positive++;
        } else if (this.negativeWords.has(word)) {
          negative++;
        } else {
          neutral++;
        }
      });
      
      // Calculate score (-1 to 1)
      const totalScored = positive + negative;
      const score = totalScored > 0 ? (positive - negative) / totalScored : 0;
      
      // Calculate magnitude (0 to 1)
      const magnitude = Math.min((positive + negative) / words.length, 1);
      
      // Determine label
      let label;
      if (score > 0.2) label = 'positive';
      else if (score < -0.2) label = 'negative';
      else label = 'neutral';
      
      // Check for intensifiers and negations
      const adjustedScore = this.adjustForIntensifiers(score, text);
      
      return {
        score: adjustedScore,
        magnitude: magnitude,
        label: label,
        word_counts: { positive, negative, neutral, total: words.length },
        raw_score: score
      };
    } catch (error) {
      logger.error(`Sentiment analysis failed: ${error.message}`);
      return {
        score: 0,
        magnitude: 0,
        label: 'neutral',
        error: 'Analysis failed'
      };
    }
  }

  cleanText(text) {
    return text
      .replace(/[^\w\s.!?,]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  adjustForIntensifiers(score, text) {
    const intensifiers = {
      'very': 1.3,
      'extremely': 1.5,
      'really': 1.2,
      'so': 1.2,
      'too': 1.4,
      'absolutely': 1.6
    };
    
    const negations = {
      'not': -1,
      "isn't": -1,
      "aren't": -1,
      "wasn't": -1,
      "weren't": -1,
      'never': -1,
      'no': -1
    };
    
    const words = text.toLowerCase().split(/\W+/);
    let multiplier = 1;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Check for intensifiers
      if (intensifiers[word] && i + 1 < words.length) {
        const nextWord = words[i + 1];
        if (this.positiveWords.has(nextWord) || this.negativeWords.has(nextWord)) {
          multiplier *= intensifiers[word];
        }
      }
      
      // Check for negations
      if (negations[word] && i + 1 < words.length) {
        const nextWord = words[i + 1];
        if (this.positiveWords.has(nextWord) || this.negativeWords.has(nextWord)) {
          multiplier *= negations[word];
        }
      }
    }
    
    return Math.max(-1, Math.min(1, score * multiplier));
  }

  async extractIssues(text) {
    const issues = [];
    const lowerText = text.toLowerCase();
    
    // Check each issue pattern
    Object.entries(this.issuePatterns).forEach(([type, pattern]) => {
      if (pattern.test(lowerText)) {
        const severity = this.determineIssueSeverity(type, text);
        const examples = this.extractExamples(type, text);
        
        issues.push({
          type: type,
          severity: severity,
          examples: examples,
          confidence: this.calculateConfidence(type, text)
        });
      }
    });
    
    // Check for emotional intensity as additional signal
    const emotionalIntensity = this.checkEmotionalIntensity(text);
    if (emotionalIntensity > 0.7 && issues.length === 0) {
      issues.push({
        type: 'emotional',
        severity: 'medium',
        examples: ['High emotional language detected'],
        confidence: emotionalIntensity
      });
    }
    
    return issues;
  }

  determineIssueSeverity(type, text) {
    const severityIndicators = {
      critical: /\b(terrible|awful|horrible|worst|unacceptable|ruined)\b/i,
      high: /\b(bad|poor|disappointing|frustrating|annoying)\b/i,
      medium: /\b(okay|average|mediocre|could be better)\b/i
    };
    
    for (const [severity, pattern] of Object.entries(severityIndicators)) {
      if (pattern.test(text)) {
        return severity;
      }
    }
    
    return 'low';
  }

  extractExamples(type, text) {
    const sentences = text.split(/[.!?]+/);
    const examples = [];
    
    sentences.forEach(sentence => {
      if (sentence.toLowerCase().includes(type)) {
        examples.push(sentence.trim());
      }
    });
    
    return examples.slice(0, 3);
  }

  calculateConfidence(type, text) {
    const words = text.toLowerCase().split(/\W+/);
    let matches = 0;
    
    words.forEach(word => {
      if (word.includes(type) || this.getRelatedWords(type).includes(word)) {
        matches++;
      }
    });
    
    return Math.min(matches / words.length * 2, 1); // Scale confidence
  }

  getRelatedWords(type) {
    const related = {
      'pricing': ['cost', 'price', 'money', 'expensive', 'cheap'],
      'logistics': ['organization', 'planning', 'schedule', 'timing'],
      'quality': ['standard', 'professionalism', 'expertise'],
      'service': ['staff', 'help', 'assistance', 'support'],
      'organization': ['management', 'coordination', 'arrangement'],
      'technical': ['technology', 'equipment', 'system', 'software']
    };
    
    return related[type] || [];
  }

  checkEmotionalIntensity(text) {
    const emotionalWords = [
      'love', 'hate', 'angry', 'furious', 'ecstatic', 'miserable',
      'delighted', 'devastated', 'thrilled', 'disgusted', 'overjoyed'
    ];
    
    const words = text.toLowerCase().split(/\W+/);
    let emotionalCount = 0;
    
    words.forEach(word => {
      if (emotionalWords.includes(word)) {
        emotionalCount++;
      }
    });
    
    return Math.min(emotionalCount / words.length * 3, 1);
  }

  async extractTopics(text) {
    const topics = [];
    const lowerText = text.toLowerCase();
    
    Object.entries(this.topicPatterns).forEach(([topic, pattern]) => {
      if (pattern.test(lowerText)) {
        topics.push({
          topic: topic,
          mentions: this.countMentions(topic, lowerText),
          relevance: this.calculateTopicRelevance(topic, text)
        });
      }
    });
    
    return topics.sort((a, b) => b.relevance - a.relevance);
  }

  countMentions(topic, text) {
    const pattern = new RegExp(`\\b${topic}\\b`, 'gi');
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }

  calculateTopicRelevance(topic, text) {
    const words = text.toLowerCase().split(/\W+/);
    const topicWords = this.getTopicKeywords(topic);
    
    let matches = 0;
    words.forEach(word => {
      if (topicWords.includes(word)) {
        matches++;
      }
    });
    
    return matches / words.length;
  }

  getTopicKeywords(topic) {
    const keywords = {
      'food': ['food', 'drink', 'meal', 'snack', 'beverage', 'water', 'coffee', 'tea'],
      'venue': ['venue', 'hall', 'room', 'space', 'facility', 'location', 'place', 'site'],
      'speakers': ['speaker', 'presenter', 'trainer', 'instructor', 'expert', 'lecturer'],
      'content': ['content', 'material', 'information', 'knowledge', 'learning', 'education'],
      'networking': ['networking', 'connection', 'people', 'attendees', 'crowd', 'audience'],
      'entertainment': ['entertainment', 'music', 'performance', 'show', 'fun', 'enjoyment']
    };
    
    return keywords[topic] || [];
  }

  async analyzeComparativeSentiment(text1, text2) {
    const sentiment1 = await this.analyzeSentiment(text1);
    const sentiment2 = await this.analyzeSentiment(text2);
    
    const difference = sentiment2.score - sentiment1.score;
    const improvement = difference > 0.1 ? 'improved' : difference < -0.1 ? 'worsened' : 'stable';
    
    return {
      text1_sentiment: sentiment1,
      text2_sentiment: sentiment2,
      difference: difference,
      improvement: improvement,
      significance: Math.abs(difference) > 0.2 ? 'significant' : 'minor'
    };
  }

  async getSentimentTrend(texts) {
    const sentiments = [];
    
    for (const text of texts) {
      const sentiment = await this.analyzeSentiment(text);
      sentiments.push(sentiment.score);
    }
    
    const trend = this.calculateTrend(sentiments);
    
    return {
      sentiments: sentiments,
      average: sentiments.reduce((a, b) => a + b, 0) / sentiments.length,
      trend: trend,
      volatility: this.calculateVolatility(sentiments)
    };
  }

  calculateTrend(sentiments) {
    if (sentiments.length < 2) return 'insufficient_data';
    
    const first = sentiments[0];
    const last = sentiments[sentiments.length - 1];
    const difference = last - first;
    
    if (difference > 0.3) return 'strongly_improving';
    if (difference > 0.1) return 'improving';
    if (difference < -0.3) return 'strongly_declining';
    if (difference < -0.1) return 'declining';
    
    return 'stable';
  }

  calculateVolatility(sentiments) {
    if (sentiments.length < 2) return 0;
    
    const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
    const squaredDiffs = sentiments.map(s => Math.pow(s - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / sentiments.length;
    
    return Math.sqrt(variance);
  }

  async updateLexicon(newWords) {
    try {
      if (newWords.positive) {
        newWords.positive.forEach(word => this.positiveWords.add(word));
      }
      
      if (newWords.negative) {
        newWords.negative.forEach(word => this.negativeWords.add(word));
      }
      
      logger.agent('SentimentCheck', 'Updated lexicon with new words');
      
      return {
        success: true,
        positive_count: this.positiveWords.size,
        negative_count: this.negativeWords.size
      };
    } catch (error) {
      logger.error(`Failed to update lexicon: ${error.message}`);
      throw error;
    }
  }

  getLexiconStats() {
    return {
      positive_words: this.positiveWords.size,
      negative_words: this.negativeWords.size,
      issue_patterns: Object.keys(this.issuePatterns).length,
      topic_patterns: Object.keys(this.topicPatterns).length
    };
  }
}

module.exports = SentimentCheck;