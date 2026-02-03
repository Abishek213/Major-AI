const { OpenAIEmbeddings } = require("@langchain/openai");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const fs = require("fs").promises;
const path = require("path");
const logger = require("../../config/logger");

/**
 * ============================================================================
 * VECTOR STORE MANAGER - FAQ & DOCUMENT SEARCH
 * ============================================================================
 *
 * PURPOSE:
 * - Enables semantic search over FAQ documents (meaning, not just keywords)
 * - Stores document embeddings for fast similarity matching
 * - Supports RAG (Retrieval Augmented Generation) for accurate AI responses
 * - Uses in-memory vector storage (no external database needed)
 *
 * ============================================================================
 * HOW RAG WORKS WITH VECTOR STORE:
 * ============================================================================
 *
 * WITHOUT VECTOR STORE (BAD):
 * User: "How do I cancel?"
 * AI: *Makes up answer* "Contact support..." ❌ WRONG
 *
 * WITH VECTOR STORE (GOOD):
 * User: "How do I cancel?"
 * Vector Store: Finds relevant FAQ chunks about cancellation
 * AI: Gets FAQ context → "Go to My Bookings → Cancel..." ✅ CORRECT
 *
 * ============================================================================
 * SEMANTIC SEARCH EXAMPLE:
 * ============================================================================
 *
 * Traditional Keyword Search:
 * Query: "abort my reservation"
 * Match: ❌ No results (no exact match for "abort" or "reservation")
 *
 * Semantic Vector Search:
 * Query: "abort my reservation"
 * Understands meaning: "cancel" = "abort", "booking" = "reservation"
 * Match: ✅ Returns cancellation FAQ
 *
 * ============================================================================
 * ARCHITECTURE:
 * ============================================================================
 *
 * FAQ Document
 *     ↓
 * Text Splitter (breaks into chunks)
 *     ↓
 * OpenAI Embeddings (converts to vectors)
 *     ↓
 * Memory Storage (stores vectors in RAM)
 *     ↓
 * Cosine Similarity Search (finds relevant chunks)
 *     ↓
 * Return to AI Agent (for context)
 *
 * ============================================================================
 */

/**
 * Simple In-Memory Vector Store
 * Stores embeddings in memory and performs cosine similarity search
 */
class SimpleMemoryVectorStore {
  constructor() {
    this.documents = []; // Array of { id, content, metadata, embedding }
  }

  /**
   * Add documents with their embeddings
   */
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

  /**
   * Calculate cosine similarity between two vectors
   */
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

  /**
   * Search for similar documents
   */
  query(queryEmbedding, nResults = 3) {
    if (this.documents.length === 0) {
      return { documents: [[]], distances: [[]], metadatas: [[]] };
    }

    // Calculate similarities for all documents
    const results = this.documents.map((doc) => ({
      ...doc,
      similarity: this.cosineSimilarity(queryEmbedding, doc.embedding),
      // Convert similarity to distance (1 - similarity)
      distance: 1 - this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    // Take top N results
    const topResults = results.slice(0, nResults);

    // Format as ChromaDB-style response
    return {
      documents: [topResults.map((r) => r.content)],
      distances: [topResults.map((r) => r.distance)],
      metadatas: [topResults.map((r) => r.metadata)],
    };
  }

  /**
   * Get document count
   */
  count() {
    return this.documents.length;
  }

  /**
   * Clear all documents
   */
  clear() {
    this.documents = [];
  }
}

class VectorStoreManager {
  constructor() {
    this.store = null; // SimpleMemoryVectorStore instance
    this.embeddings = null; // OpenAIEmbeddings instance
    this.isInitialized = false;
    this.documentCount = 0;
    this.chunkSize = 500; // Characters per chunk
    this.chunkOverlap = 50; // Overlap between chunks
    this.embeddingModel = "text-embedding-ada-002";
    this.mockMode = false; // Fallback when no API key
    this.documents = null; // used only in mock mode
  }

  /**
   * ========================================================================
   * INITIALIZE VECTOR STORE
   * ========================================================================
   *
   * Sets up in-memory vector store and OpenAI embeddings.
   * Falls back to mock mode if OPENAI_API_KEY is missing.
   *
   * @returns {Promise<{ success: boolean, mode: string }>}
   */
  async initialize() {
    if (this.isInitialized) {
      logger.info("✅ Vector store already initialized");
      return { success: true, mode: this.mockMode ? "mock" : "live" };
    }

    try {
      logger.info("🚀 Initializing Vector Store...");

      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        logger.warn(
          "⚠️ OPENAI_API_KEY not found. Vector store will operate in mock mode."
        );
        logger.warn(
          "Mock mode uses keyword-based search instead of semantic search."
        );
        this.mockMode = true;
        this.isInitialized = true;
        return { success: true, mode: "mock" };
      }

      // Initialize in-memory vector store
      this.store = new SimpleMemoryVectorStore();
      logger.info("📦 In-memory vector store initialized");

      // Initialize OpenAI Embeddings
      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: apiKey,
        modelName: this.embeddingModel,
        timeout: 30000,
      });
      logger.success("✅ OpenAI Embeddings initialized");
      logger.info(`📊 Using model: ${this.embeddingModel}`);

      this.mockMode = false;
      this.isInitialized = true;
      return { success: true, mode: "live" };
    } catch (error) {
      logger.error("❌ Error initializing vector store:", error);
      logger.warn("Falling back to mock mode due to initialization error");
      this.mockMode = true;
      this.isInitialized = true;
      return { success: false, mode: "mock", error: error.message };
    }
  }

  /**
   * ========================================================================
   * LOAD FAQ DOCUMENTS
   * ========================================================================
   *
   * Reads the FAQ markdown file, splits into chunks, generates embeddings
   * via OpenAI, and stores them in memory.
   *
   * CHUNKING STRATEGY:
   * - Size: 500 characters per chunk
   * - Overlap: 50 characters (prevents context loss at boundaries)
   * - Separators: Prioritise markdown headers, then paragraphs
   *
   * @param {string} faqFilePath - Path to FAQ markdown file
   * @returns {Promise<number>} Number of document chunks loaded
   */
  async loadFAQDocuments(faqFilePath) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      logger.info(`📄 Loading FAQ from: ${faqFilePath}`);

      // Check file exists
      try {
        await fs.access(faqFilePath);
      } catch {
        throw new Error(`FAQ file not found at: ${faqFilePath}`);
      }

      const faqContent = await fs.readFile(faqFilePath, "utf-8");
      if (!faqContent || faqContent.trim().length === 0) {
        throw new Error("FAQ file is empty");
      }
      logger.info(`📖 FAQ file size: ${faqContent.length} characters`);

      // ===================================================================
      // TEXT SPLITTING
      // ===================================================================
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap,
        separators: ["\n## ", "\n### ", "\n#### ", "\n\n", "\n", ". ", " "],
      });

      const docs = await textSplitter.createDocuments([faqContent]);
      logger.info(`📊 Split FAQ into ${docs.length} chunks`);

      if (docs.length > 0 && process.env.DEBUG === "true") {
        logger.debug(
          `Sample chunk: ${docs[0].pageContent.substring(0, 100)}...`
        );
      }

      // ===================================================================
      // MOCK MODE – store raw docs for keyword fallback, skip embeddings
      // ===================================================================
      if (this.mockMode || !this.embeddings) {
        logger.warn(
          "⚠️ Running in mock mode. Vector search will use keyword matching."
        );
        this.documents = docs.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        }));
        this.documentCount = docs.length;
        return docs.length;
      }

      // ===================================================================
      // GENERATE EMBEDDINGS
      // ===================================================================
      logger.info("🔄 Generating embeddings (this may take a moment)...");
      const startTime = Date.now();

      const texts = docs.map((d) => d.pageContent);
      const embeddings = await this.embeddings.embedDocuments(texts);

      // ===================================================================
      // STORE IN MEMORY
      // ===================================================================
      const ids = texts.map(
        (_, i) => `faq_chunk_${String(i).padStart(6, "0")}`
      );
      const metadatas = docs.map((d) => d.metadata || {});

      this.store.add(ids, texts, embeddings, metadatas);

      const duration = Date.now() - startTime;
      this.documentCount = docs.length;

      logger.success(
        `✅ Loaded ${this.documentCount} FAQ chunks into vector store in ${duration}ms`
      );

      return this.documentCount;
    } catch (error) {
      logger.error("❌ Error loading FAQ documents:", error);
      throw new Error(`Failed to load FAQ: ${error.message}`);
    }
  }

  /**
   * ========================================================================
   * SEARCH
   * ========================================================================
   *
   * Performs semantic search to find relevant FAQ chunks
   *
   * @param {string} query - Search query
   * @param {number} topK - Number of results to return
   * @returns {Promise<Array>} Array of search results with content and scores
   */
  async search(query, topK = 3) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!query || typeof query !== "string" || query.trim().length === 0) {
        logger.warn("Empty search query provided");
        return [];
      }

      logger.debug(`🔍 Searching for: "${query}" (top ${topK} results)`);

      // ===================================================================
      // MOCK MODE - Keyword-based search
      // ===================================================================
      if (this.mockMode || !this.store) {
        logger.debug("Using mock keyword search");
        return this.getMockResults(query, topK);
      }

      // ===================================================================
      // SEMANTIC SEARCH - Using OpenAI embeddings
      // ===================================================================
      const startTime = Date.now();

      // Generate embedding for query
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // Search vector store
      const results = this.store.query(queryEmbedding, topK);

      const duration = Date.now() - startTime;

      // Format results
      const formattedResults = [];
      if (results.documents && results.documents[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          formattedResults.push({
            content: results.documents[0][i],
            metadata: results.metadatas[0][i] || {},
            score: 1 - results.distances[0][i], // Convert distance back to similarity
            rank: i + 1,
          });
        }
      }

      logger.info(
        `🔍 Found ${formattedResults.length} relevant chunks in ${duration}ms`
      );

      return formattedResults;
    } catch (error) {
      logger.error("❌ Error searching vector store:", error);
      logger.warn("Falling back to mock results due to search error");
      return this.getMockResults(query, topK);
    }
  }

  /**
   * ========================================================================
   * GET CONTEXT
   * ========================================================================
   *
   * Get formatted context string from search results
   *
   * @param {string} query - Search query
   * @param {number} topK - Number of results to return
   * @returns {Promise<string>} Formatted context string
   */
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
        `📝 Generated context: ${formattedContext.length} characters from ${results.length} chunks`
      );

      return formattedContext;
    } catch (error) {
      logger.error("Error getting context:", error);
      return "";
    }
  }

  /**
   * ========================================================================
   * MOCK RESULTS (Fallback)
   * ========================================================================
   *
   * Provides keyword-based search when OpenAI is not available
   */
  getMockResults(query, topK = 3) {
    const lowerQuery = query.toLowerCase();

    const mockFAQs = [
      {
        keywords: ["cancel", "cancellation", "abort", "stop", "refund"],
        content: `**How to Cancel Your Booking**

To cancel your booking:
1. Log in to your Eventa account
2. Go to "My Bookings" section
3. Find the event you want to cancel
4. Click the "Cancel Booking" button
5. Provide a cancellation reason (optional)
6. Confirm cancellation

**Refund Policy:**
- Cancel 48+ hours before event: 100% refund
- Cancel 24-48 hours before: 50% refund
- Cancel <24 hours before: No refund

Refunds are processed within 7-10 business days to your original payment method (Khalti or eSewa).`,
        score: 0.95,
      },
      {
        keywords: ["refund", "money back", "reimbursement", "return"],
        content: `**Refund Policy**

Refunds are processed based on when you cancel:

**Full Refund (100%):**
- Cancellation made 48+ hours before event start time
- Event cancelled by organizer

**Partial Refund (50%):**
- Cancellation made 24-48 hours before event

**No Refund:**
- Cancellation made less than 24 hours before event
- No-show to event

**Processing Time:**
Refunds typically take 7-10 business days to appear in your Khalti or eSewa account.`,
        score: 0.93,
      },
      {
        keywords: ["book", "booking", "reserve", "ticket", "purchase", "buy"],
        content: `**How to Book an Event**

**Booking Process:**
1. **Browse Events:** Find an event you're interested in
2. **Select Event:** Click on the event for details
3. **Choose Tickets:** Select number of seats
4. **Review Details:** Check event date, time, location, and price
5. **Proceed to Payment:** Click "Book Now"
6. **Complete Payment:** Pay securely via Khalti or eSewa
7. **Receive Confirmation:** You'll get a booking confirmation email

**What You'll Need:**
- Active Eventa account
- Valid Khalti or eSewa account
- Event must have available slots`,
        score: 0.91,
      },
      {
        keywords: ["payment", "pay", "khalti", "esewa", "transaction"],
        content: `**Payment Methods**

Eventa accepts two secure payment methods:

**1. Khalti:**
- Digital wallet popular in Nepal
- Instant payment confirmation
- Secure and encrypted transactions

**2. eSewa:**
- Leading digital payment service
- Quick and reliable
- Widely accepted

**Payment Process:**
1. Select your preferred payment method
2. Enter your wallet credentials
3. Confirm payment amount
4. Complete authentication
5. Receive instant confirmation

**Payment Issues:**
If your payment fails but you were charged, it's usually a pending authorization. Contact support@eventa.com with your transaction ID.`,
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
        ],
        content: `**Account Management**

**Creating an Account:**
1. Click "Sign Up" on homepage
2. Enter email and password
3. Verify your email
4. Complete profile information

**Login Issues:**
- Forgot password? Click "Forgot Password" on login page
- Email not verified? Check spam folder or request new verification email

**Profile Management:**
Go to "My Profile" to:
- Update personal information
- Change password
- Manage payment methods
- View booking history`,
        score: 0.87,
      },
      {
        keywords: ["event", "details", "information", "time", "location"],
        content: `**Event Information**

Each event listing includes:
- Event name and description
- Date and time
- Venue/location details
- Ticket price
- Available slots
- Organizer information
- Category/tags
- Reviews from past attendees

**Finding Events:**
- Browse by category
- Search by keyword
- Filter by date, price, location
- Check "Recommended for You" section`,
        score: 0.85,
      },
    ];

    const matches = mockFAQs
      .filter((faq) =>
        faq.keywords.some((keyword) => lowerQuery.includes(keyword))
      )
      .map((faq) => ({
        content: faq.content,
        metadata: { source: "mock" },
        score: faq.score,
      }));

    if (matches.length === 0) {
      matches.push({
        content: `**General Information**

Welcome to Eventa! I'm here to help you with:
- Booking events
- Cancellations and refunds
- Payment issues
- Account management

Please ask a specific question, and I'll provide detailed information from our FAQ.

Common topics:
• "How do I book an event?"
• "What's your refund policy?"
• "How do I cancel my booking?"
• "What payment methods do you accept?"`,
        metadata: { source: "mock-generic" },
        score: 0.5,
      });
    }

    return matches.slice(0, topK);
  }

  /**
   * ========================================================================
   * ADD NEW DOCUMENTS (incremental)
   * ========================================================================
   *
   * @param {Array<string>} documents - Array of document texts
   * @returns {Promise<number>} Number of new chunks added
   */
  async addDocuments(documents) {
    try {
      if (!this.store || !this.embeddings) {
        logger.warn("⚠️ Vector store not properly initialized");
        return 0;
      }

      if (!Array.isArray(documents) || documents.length === 0) {
        logger.warn("No documents provided to add");
        return 0;
      }

      logger.info(`📥 Adding ${documents.length} new documents...`);

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
      logger.success(`✅ Added ${docs.length} new chunks to vector store`);
      return docs.length;
    } catch (error) {
      logger.error("❌ Error adding documents:", error);
      throw error;
    }
  }

  /**
   * Clear all documents from vector store
   */
  async clear() {
    if (this.store) {
      this.store.clear();
    }
    this.documents = null;
    this.documentCount = 0;
    logger.info("🗑️ Vector store cleared");
  }

  /**
   * Get statistics about the vector store
   */
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

  /**
   * Health check
   */
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
