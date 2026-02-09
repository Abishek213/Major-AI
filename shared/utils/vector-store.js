const { OpenAIEmbeddings } = require("@langchain/openai");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const fs = require("fs").promises;
const path = require("path");
const logger = require("../../config/logger");

class SimpleMemoryVectorStore {
  constructor() {
    this.documents = [];
  }

  add(ids, documents, embeddings, metadatas) {
    for (let i = 0; i < ids.length; i++) {
      this.documents.push({
        id: ids[i],
        content: documents[i],
        metadata: metadatas[i] || {},
        embedding: embeddings[i],
      });
    }
  }

  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return isNaN(similarity) ? 0 : similarity;
  }

  query(queryEmbedding, nResults = 3) {
    if (this.documents.length === 0) {
      return { documents: [[]], distances: [[]], metadatas: [[]] };
    }

    const results = this.documents.map((doc) => ({
      ...doc,
      similarity: this.cosineSimilarity(queryEmbedding, doc.embedding),
      distance: 1 - this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, nResults);

    return {
      documents: [topResults.map((r) => r.content)],
      distances: [topResults.map((r) => r.distance)],
      metadatas: [topResults.map((r) => r.metadata)],
    };
  }

  count() {
    return this.documents.length;
  }

  clear() {
    this.documents = [];
  }
}

class VectorStoreManager {
  constructor() {
    this.store = null;
    this.embeddings = null;
    this.isInitialized = false;
    this.documentCount = 0;
    this.chunkSize = 500;
    this.chunkOverlap = 50;
    this.embeddingModel = "text-embedding-ada-002";
    this.mockMode = false;
    this.documents = null;
  }

  async initialize() {
    if (this.isInitialized) {
      logger.info("Vector store already initialized");
      return { success: true, mode: this.mockMode ? "mock" : "live" };
    }

    try {
      logger.info("Initializing Vector Store...");
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey || apiKey === "YOUR_API_KEY") {
        logger.warn(
          "Invalid or default OPENAI_API_KEY found. Using mock mode."
        );
        this.mockMode = true;
        this.isInitialized = true;
        return { success: true, mode: "mock" };
      }

      this.store = new SimpleMemoryVectorStore();
      logger.info("In-memory vector store initialized");

      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: apiKey,
        modelName: this.embeddingModel,
        timeout: 30000,
      });
      logger.info("OpenAI Embeddings initialized");
      logger.info(`Using model: ${this.embeddingModel}`);

      this.mockMode = false;
      this.isInitialized = true;
      return { success: true, mode: "live" };
    } catch (error) {
      logger.error("Error initializing vector store:", error);
      logger.warn("Falling back to mock mode");
      this.mockMode = true;
      this.isInitialized = true;
      return { success: false, mode: "mock", error: error.message };
    }
  }

  async loadFAQDocuments(faqFilePath) {
    try {
      if (!this.isInitialized) await this.initialize();
      logger.info(`Loading FAQ from: ${faqFilePath}`);

      try {
        await fs.access(faqFilePath);
      } catch {
        throw new Error(`FAQ file not found at: ${faqFilePath}`);
      }

      const faqContent = await fs.readFile(faqFilePath, "utf-8");
      if (!faqContent || faqContent.trim().length === 0) {
        throw new Error("FAQ file is empty");
      }
      logger.info(`FAQ file size: ${faqContent.length} characters`);

      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap,
        separators: ["\n## ", "\n### ", "\n#### ", "\n\n", "\n", ". ", " "],
      });

      const docs = await textSplitter.createDocuments([faqContent]);
      logger.info(`Split FAQ into ${docs.length} chunks`);

      if (this.mockMode || !this.embeddings) {
        logger.warn("Running in mock mode. Using keyword matching.");
        this.documents = docs.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        }));
        this.documentCount = docs.length;
        return docs.length;
      }

      logger.info("Generating embeddings...");
      const startTime = Date.now();
      const texts = docs.map((d) => d.pageContent);
      const embeddings = await this.embeddings.embedDocuments(texts);

      const ids = texts.map(
        (_, i) => `faq_chunk_${String(i).padStart(6, "0")}`
      );
      const metadatas = docs.map((d) => d.metadata || {});

      this.store.add(ids, texts, embeddings, metadatas);
      const duration = Date.now() - startTime;
      this.documentCount = docs.length;

      logger.info(`Loaded ${this.documentCount} FAQ chunks in ${duration}ms`);
      return this.documentCount;
    } catch (error) {
      logger.error("Error loading FAQ documents:", error);
      throw new Error(`Failed to load FAQ: ${error.message}`);
    }
  }

  async search(query, topK = 3) {
    try {
      if (!this.isInitialized) await this.initialize();

      if (!query || typeof query !== "string" || query.trim().length === 0) {
        logger.warn("Empty search query provided");
        return [];
      }

      logger.debug(`Searching for: "${query}" (top ${topK} results)`);

      if (this.mockMode || !this.store || !this.embeddings) {
        logger.debug("Using mock keyword search");
        return this.getMockResults(query, topK);
      }

      try {
        const startTime = Date.now();
        const queryEmbedding = await this.embeddings.embedQuery(query);
        const results = this.store.query(queryEmbedding, topK);
        const duration = Date.now() - startTime;

        const formattedResults = [];
        if (results.documents && results.documents[0]) {
          for (let i = 0; i < results.documents[0].length; i++) {
            formattedResults.push({
              content: results.documents[0][i],
              metadata: results.metadatas[0][i] || {},
              score: 1 - results.distances[0][i],
              rank: i + 1,
            });
          }
        }

        logger.info(
          `Found ${formattedResults.length} relevant chunks in ${duration}ms`
        );
        return formattedResults;
      } catch (error) {
        logger.error("Error searching vector store:", error);
        if (error.message.includes("quota") || error.message.includes("429")) {
          logger.warn("OpenAI quota exceeded. Switching to mock mode.");
          this.mockMode = true;
        }
        return this.getMockResults(query, topK);
      }
    } catch (error) {
      logger.error("Error in search:", error);
      return this.getMockResults(query, topK);
    }
  }

  async getContext(query, topK = 3) {
    try {
      const results = await this.search(query, topK);
      if (results.length === 0) {
        logger.warn("No relevant context found for query");
        return "";
      }

      const formattedContext = results
        .map((result, index) => {
          const contextLabel = `[Context ${index + 1}]`;
          const score = result.score
            ? ` (Relevance: ${result.score.toFixed(2)})`
            : "";
          return `${contextLabel}${score}:\n${result.content}`;
        })
        .join("\n\n---\n\n");

      logger.debug(
        `Generated context: ${formattedContext.length} characters from ${results.length} chunks`
      );
      return formattedContext;
    } catch (error) {
      logger.error("Error getting context:", error);
      return "";
    }
  }

  getMockResults(query, topK = 3) {
    const lowerQuery = query.toLowerCase();

    // Enhanced keyword matching with word boundaries and stemming
    const queryWords = lowerQuery.split(/\s+/);

    const mockFAQs = [
      {
        keywords: [
          "payment",
          "pay",
          "khalti",
          "esewa",
          "transaction",
          "method",
          "methods",
          "credit",
          "debit",
          "card",
          "cash",
          "accept",
          "accepted",
        ],
        content: `**Payment Methods Accepted**
We accept the following payment methods:
- **Khalti**: For quick and secure payments in Nepal
- **eSewa**: Another popular payment method in Nepal
- **Credit/Debit Cards**: Visa, MasterCard, and American Express
- **Bank Transfer**: Direct bank transfers are accepted
- **Cash Payment**: Available for in-person events

**Payment Process:**
1. Select your preferred payment method at checkout
2. You'll be redirected to the secure payment gateway
3. Enter your payment details and confirm
4. After successful payment, you'll receive a confirmation

**Security:** All payments are encrypted and secure. We don't store your payment details.

Need help with payment? Contact support@eventa.com with your transaction ID.`,
        score: 0.95,
      },
      {
        keywords: [
          "cancel",
          "cancellation",
          "abort",
          "stop",
          "terminate",
          "end",
        ],
        content: `**How to Cancel Your Booking**
1. Log in to your Eventa account
2. Go to "My Bookings" section
3. Find the event you want to cancel
4. Click "Cancel Booking"
5. Confirm the cancellation

**Refund Policy:**
- 48+ hours before event: 100% refund
- 24-48 hours before event: 50% refund
- Less than 24 hours before event: No refund

Refunds are processed within 7-10 business days.`,
        score: 0.93,
      },
      {
        keywords: [
          "refund",
          "money back",
          "reimbursement",
          "return",
          "repayment",
        ],
        content: `**Refund Policy**
Full Refund: 48+ hours before event
Partial Refund: 24-48 hours before event
No Refund: <24 hours before event
Processing Time: 7-10 business days

Contact support@eventa.com for refund inquiries.`,
        score: 0.91,
      },
      {
        keywords: [
          "book",
          "booking",
          "reserve",
          "ticket",
          "purchase",
          "buy",
          "register",
          "registration",
        ],
        content: `**How to Book an Event**
1. Browse events on Eventa
2. Select an event that interests you
3. Choose number of tickets
4. Review event details and price
5. Proceed to payment
6. Complete payment securely
7. Receive confirmation email and SMS

You can view all your bookings in the "My Bookings" section of your account.`,
        score: 0.89,
      },
      {
        keywords: [
          "account",
          "login",
          "password",
          "profile",
          "register",
          "signup",
          "sign",
          "create",
        ],
        content: `**Account Management**
Sign Up: Enter email and password
Login Issues: Use "Forgot Password"
Profile: Update info, change password, manage payment methods, view booking history

For account issues, contact support@eventa.com`,
        score: 0.87,
      },
      {
        keywords: [
          "event",
          "details",
          "information",
          "time",
          "location",
          "venue",
          "address",
          "date",
        ],
        content: `**Event Information**
Event details include: Name, description, date, time, location, price, available slots, organizer info

Finding Events: Browse by category, search by name, filter by date/price/location

Click on any event to see complete details and book.`,
        score: 0.85,
      },
    ];

    // Score each FAQ based on keyword matches
    const scoredFAQs = mockFAQs.map((faq) => {
      let score = 0;
      let matches = 0;

      for (const keyword of faq.keywords) {
        // Check if keyword appears in query
        if (lowerQuery.includes(keyword)) {
          score += 1;
          matches++;
        }

        // Also check for word variations
        for (const word of queryWords) {
          if (word.includes(keyword) || keyword.includes(word)) {
            score += 0.5;
            matches++;
          }
        }
      }

      return {
        ...faq,
        matchScore: score,
        matches: matches,
        finalScore: score + (faq.score || 0),
      };
    });

    // Filter out FAQs with no matches and sort by final score
    let matches = scoredFAQs
      .filter((faq) => faq.matchScore > 0)
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((faq) => ({
        content: faq.content,
        metadata: {
          source: "mock",
          matches: faq.matches,
          score: faq.finalScore,
        },
        score: faq.finalScore,
      }));

    if (matches.length === 0) {
      // If no matches, return the most relevant generic FAQ
      matches = [
        {
          content: `**General Information**
For assistance with:
- Booking events and tickets
- Cancellations and refunds
- Payment methods and issues
- Account management
- Event details and information

Please be specific with your question so I can help you better.

Common topics: How to book events, refund policy, cancel bookings, accepted payment methods, account login issues`,
          metadata: { source: "mock-generic" },
          score: 0.5,
        },
      ];
    }

    return matches.slice(0, topK);
  }

  async addDocuments(documents) {
    try {
      if (!this.store || !this.embeddings) {
        logger.warn("Vector store not properly initialized");
        return 0;
      }

      if (!Array.isArray(documents) || documents.length === 0) {
        logger.warn("No documents provided to add");
        return 0;
      }

      logger.info(`Adding ${documents.length} new documents...`);

      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap,
      });

      const docs = await textSplitter.createDocuments(documents);
      const texts = docs.map((d) => d.pageContent);
      const embeddings = await this.embeddings.embedDocuments(texts);

      const baseIndex = this.documentCount;
      const ids = texts.map(
        (_, i) => `added_chunk_${String(baseIndex + i).padStart(6, "0")}`
      );
      const metadatas = docs.map((d) => d.metadata || {});

      this.store.add(ids, texts, embeddings, metadatas);
      this.documentCount += docs.length;

      logger.info(`Added ${docs.length} new chunks to vector store`);
      return docs.length;
    } catch (error) {
      logger.error("Error adding documents:", error);
      throw error;
    }
  }

  async clear() {
    if (this.store) this.store.clear();
    this.documents = null;
    this.documentCount = 0;
    logger.info("Vector store cleared");
  }

  getStats() {
    return {
      initialized: this.isInitialized,
      documentCount: this.documentCount,
      hasStore: !!this.store,
      hasEmbeddings: !!this.embeddings,
      mockMode: this.mockMode,
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
      embeddingModel: this.embeddingModel,
    };
  }

  checkHealth() {
    return {
      status: this.isInitialized ? "ready" : "not_initialized",
      mode: this.mockMode ? "mock" : "live",
      documentCount: this.documentCount,
      storeType: "simple-memory",
      embeddingsModel: this.embeddingModel,
      operational: this.isInitialized && (this.store || this.mockMode),
    };
  }
}

module.exports = new VectorStoreManager();
