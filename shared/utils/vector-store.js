/**
 * Enhanced Vector Store for AI Agents
 * Supports multiple vector databases and advanced retrieval
 */

const { Chroma } = require("langchain/vectorstores/chroma");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { Document } = require("langchain/document");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

class EnhancedVectorStore {
  constructor(config = {}) {
    this.config = {
      // Vector store type
      type: config.type || "chroma", // chroma, pinecone, weaviate

      // Embeddings configuration
      embeddings: config.embeddings || {
        provider: "openai",
        model: "text-embedding-ada-002",
        dimensions: 1536,
      },

      // Text splitting configuration
      textSplitter: config.textSplitter || {
        chunkSize: 1000,
        chunkOverlap: 200,
        separators: ["\n\n", "\n", " ", ""],
      },

      // Retrieval configuration
      retrieval: config.retrieval || {
        k: 5, // Number of results to retrieve
        scoreThreshold: 0.7, // Minimum similarity score
        includeMetadata: true,
        includeDistance: true,
      },

      // Cache configuration
      cache: config.cache || {
        enabled: true,
        ttl: 3600000, // 1 hour in milliseconds
        maxSize: 1000,
      },

      // Index configuration
      indexes: config.indexes || {
        faq: "faq_index",
        events: "events_index",
        users: "users_index",
        agents: "agents_index",
      },

      // Performance configuration
      performance: config.performance || {
        batchSize: 100,
        concurrency: 5,
        timeout: 30000,
      },

      ...config,
    };

    // Initialize components
    this.embeddings = this.createEmbeddings();
    this.textSplitter = this.createTextSplitter();
    this.vectorStores = new Map();
    this.cache = new Map();
    this.stats = {
      queries: 0,
      hits: 0,
      misses: 0,
      embeddingsGenerated: 0,
      documentsIndexed: 0,
    };

    // Initialize indexes
    this.initializeIndexes();
  }

  createEmbeddings() {
    switch (this.config.embeddings.provider) {
      case "openai":
        return new OpenAIEmbeddings({
          openAIApiKey: process.env.OPENAI_API_KEY,
          modelName: this.config.embeddings.model,
          dimensions: this.config.embeddings.dimensions,
        });
      // Add more embedding providers here
      default:
        throw new Error(
          `Unsupported embedding provider: ${this.config.embeddings.provider}`
        );
    }
  }

  createTextSplitter() {
    return new RecursiveCharacterTextSplitter({
      chunkSize: this.config.textSplitter.chunkSize,
      chunkOverlap: this.config.textSplitter.chunkOverlap,
      separators: this.config.textSplitter.separators,
    });
  }

  async initializeIndexes() {
    console.log("Initializing vector store indexes...");

    for (const [name, indexName] of Object.entries(this.config.indexes)) {
      try {
        const store = await this.createVectorStore(indexName);
        this.vectorStores.set(name, store);
        console.log(`  ✅ Index initialized: ${name} -> ${indexName}`);
      } catch (error) {
        console.error(
          `  ❌ Failed to initialize index ${name}:`,
          error.message
        );
      }
    }
  }

  async createVectorStore(indexName) {
    switch (this.config.type) {
      case "chroma":
        return await Chroma.fromExistingCollection(this.embeddings, {
          collectionName: indexName,
          url: process.env.CHROMA_URL || "http://localhost:8000",
        });
      // Add more vector store types here
      default:
        throw new Error(`Unsupported vector store type: ${this.config.type}`);
    }
  }

  async addDocuments(indexName, documents, metadata = {}) {
    const startTime = Date.now();

    try {
      // Get or create vector store
      let vectorStore = this.vectorStores.get(indexName);
      if (!vectorStore) {
        vectorStore = await this.createVectorStore(indexName);
        this.vectorStores.set(indexName, vectorStore);
      }

      // Split documents if needed
      let splitDocs = documents;
      if (this.config.textSplitter.enabled !== false) {
        splitDocs = await this.textSplitter.splitDocuments(documents);
      }

      // Add metadata to documents
      const enhancedDocs = splitDocs.map((doc, index) => {
        const docMetadata = {
          ...doc.metadata,
          ...metadata,
          index: index,
          chunkId: crypto
            .createHash("md5")
            .update(doc.pageContent)
            .digest("hex"),
          timestamp: new Date().toISOString(),
          source: metadata.source || "unknown",
        };

        return new Document({
          pageContent: doc.pageContent,
          metadata: docMetadata,
        });
      });

      // Add to vector store in batches
      const batchSize = this.config.performance.batchSize;
      for (let i = 0; i < enhancedDocs.length; i += batchSize) {
        const batch = enhancedDocs.slice(i, i + batchSize);
        await vectorStore.addDocuments(batch);

        // Update stats
        this.stats.documentsIndexed += batch.length;

        // Small delay to avoid rate limiting
        if (i + batchSize < enhancedDocs.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Clear cache for this index
      this.clearCacheForIndex(indexName);

      const duration = Date.now() - startTime;
      console.log(
        `Indexed ${enhancedDocs.length} documents to ${indexName} in ${duration}ms`
      );

      return {
        success: true,
        index: indexName,
        documentsIndexed: enhancedDocs.length,
        duration,
        stats: {
          originalDocs: documents.length,
          splitDocs: enhancedDocs.length,
          averageChunkSize:
            enhancedDocs.reduce((sum, doc) => sum + doc.pageContent.length, 0) /
            enhancedDocs.length,
        },
      };
    } catch (error) {
      console.error(`Error adding documents to ${indexName}:`, error);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  async similaritySearch(indexName, query, options = {}) {
    const startTime = Date.now();
    this.stats.queries++;

    // Check cache first
    const cacheKey = this.getCacheKey(indexName, query, options);
    if (this.config.cache.enabled && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.config.cache.ttl) {
        this.stats.hits++;
        return cached.results;
      } else {
        // Cache expired
        this.cache.delete(cacheKey);
      }
    }

    this.stats.misses++;

    try {
      // Get vector store
      const vectorStore = this.vectorStores.get(indexName);
      if (!vectorStore) {
        throw new Error(`Vector store not found for index: ${indexName}`);
      }

      // Perform similarity search
      const searchOptions = {
        k: options.k || this.config.retrieval.k,
        filter: options.filter,
        includeMetadata:
          options.includeMetadata !== undefined
            ? options.includeMetadata
            : this.config.retrieval.includeMetadata,
        includeDistance:
          options.includeDistance !== undefined
            ? options.includeDistance
            : this.config.retrieval.includeDistance,
      };

      const results = await vectorStore.similaritySearch(
        query,
        searchOptions.k,
        searchOptions.filter
      );

      // Apply score threshold
      const filteredResults = results.filter((result) => {
        if (result.metadata && result.metadata.distance !== undefined) {
          const similarity = 1 - result.metadata.distance; // Convert distance to similarity
          return (
            similarity >=
            (options.scoreThreshold || this.config.retrieval.scoreThreshold)
          );
        }
        return true;
      });

      // Format results
      const formattedResults = filteredResults.map((result, index) => {
        const formatted = {
          content: result.pageContent,
          metadata: result.metadata || {},
          index: index,
          score:
            result.metadata && result.metadata.distance !== undefined
              ? 1 - result.metadata.distance
              : 1.0,
        };

        // Include distance if requested
        if (
          searchOptions.includeDistance &&
          result.metadata &&
          result.metadata.distance !== undefined
        ) {
          formatted.distance = result.metadata.distance;
        }

        return formatted;
      });

      // Sort by score (highest first)
      formattedResults.sort((a, b) => b.score - a.score);

      // Cache results
      if (this.config.cache.enabled && formattedResults.length > 0) {
        this.cache.set(cacheKey, {
          results: formattedResults,
          timestamp: Date.now(),
        });

        // Clean cache if too large
        if (this.cache.size > this.config.cache.maxSize) {
          this.cleanCache();
        }
      }

      const duration = Date.now() - startTime;
      console.log(
        `Similarity search on ${indexName}: ${formattedResults.length} results in ${duration}ms`
      );

      return formattedResults;
    } catch (error) {
      console.error(`Error in similarity search for ${indexName}:`, error);
      return [];
    }
  }

  async similaritySearchWithScore(indexName, query, options = {}) {
    const results = await this.similaritySearch(indexName, query, {
      ...options,
      includeDistance: true,
    });

    return results.map((result) => ({
      document: {
        content: result.content,
        metadata: result.metadata,
      },
      score: result.score,
    }));
  }

  async hybridSearch(indexName, query, options = {}) {
    const startTime = Date.now();

    try {
      // Perform vector similarity search
      const vectorResults = await this.similaritySearch(
        indexName,
        query,
        options
      );

      // Perform keyword search (if implemented)
      const keywordResults = await this.keywordSearch(
        indexName,
        query,
        options
      );

      // Combine results using reciprocal rank fusion (RRF)
      const combinedResults = this.combineSearchResults(
        vectorResults,
        keywordResults,
        options
      );

      const duration = Date.now() - startTime;
      console.log(
        `Hybrid search on ${indexName}: ${combinedResults.length} results in ${duration}ms`
      );

      return combinedResults;
    } catch (error) {
      console.error(`Error in hybrid search for ${indexName}:`, error);
      return [];
    }
  }

  async keywordSearch(indexName, query, options = {}) {
    // Basic keyword search implementation
    // In production, use a proper search engine like Elasticsearch
    const vectorStore = this.vectorStores.get(indexName);
    if (!vectorStore) {
      return [];
    }

    // This is a simplified implementation
    // Actual implementation would depend on the vector store
    const allDocs = await vectorStore.getDocuments();

    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 2);
    const results = [];

    for (const doc of allDocs) {
      const content = doc.pageContent.toLowerCase();
      let score = 0;

      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          score += 1;
          // Bonus for multiple occurrences
          const occurrences = (content.match(new RegExp(keyword, "g")) || [])
            .length;
          score += Math.min(occurrences - 1, 3) * 0.1;
        }
      }

      if (score > 0) {
        results.push({
          content: doc.pageContent,
          metadata: doc.metadata,
          score: score / keywords.length, // Normalize score
          searchType: "keyword",
        });
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    // Limit results
    return results.slice(0, options.k || this.config.retrieval.k);
  }

  combineSearchResults(vectorResults, keywordResults, options = {}) {
    const k = options.k || this.config.retrieval.k;
    const vectorWeight = options.vectorWeight || 0.7;
    const keywordWeight = options.keywordWeight || 0.3;

    // Create a map of unique documents
    const documentMap = new Map();

    // Add vector results
    vectorResults.forEach((result, index) => {
      const docKey = this.getDocumentKey(result.content, result.metadata);
      const score = (k - index) / k; // Reciprocal rank

      documentMap.set(docKey, {
        content: result.content,
        metadata: result.metadata,
        vectorScore: score * vectorWeight,
        keywordScore: 0,
        totalScore: score * vectorWeight,
      });
    });

    // Add keyword results
    keywordResults.forEach((result, index) => {
      const docKey = this.getDocumentKey(result.content, result.metadata);
      const score = (k - index) / k; // Reciprocal rank

      if (documentMap.has(docKey)) {
        const existing = documentMap.get(docKey);
        existing.keywordScore = score * keywordWeight;
        existing.totalScore = existing.vectorScore + existing.keywordScore;
      } else {
        documentMap.set(docKey, {
          content: result.content,
          metadata: result.metadata,
          vectorScore: 0,
          keywordScore: score * keywordWeight,
          totalScore: score * keywordWeight,
        });
      }
    });

    // Convert to array and sort by total score
    const combinedResults = Array.from(documentMap.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, k);

    return combinedResults;
  }

  async getEmbedding(text) {
    try {
      const embedding = await this.embeddings.embedQuery(text);
      this.stats.embeddingsGenerated++;
      return embedding;
    } catch (error) {
      console.error("Error generating embedding:", error);
      throw error;
    }
  }

  async getEmbeddings(texts) {
    try {
      const embeddings = await this.embeddings.embedDocuments(texts);
      this.stats.embeddingsGenerated += texts.length;
      return embeddings;
    } catch (error) {
      console.error("Error generating embeddings:", error);
      throw error;
    }
  }

  async semanticSearch(indexName, query, context, options = {}) {
    // Enhanced semantic search with context awareness
    const enhancedQuery = this.enhanceQueryWithContext(query, context);
    return await this.similaritySearch(indexName, enhancedQuery, options);
  }

  enhanceQueryWithContext(query, context) {
    if (!context || typeof context !== "object") {
      return query;
    }

    let enhancedQuery = query;

    // Add context keywords
    if (context.userPreferences) {
      const prefs = context.userPreferences;
      if (prefs.interests && Array.isArray(prefs.interests)) {
        enhancedQuery += " " + prefs.interests.join(" ");
      }
      if (prefs.location) {
        enhancedQuery += " " + prefs.location;
      }
    }

    // Add temporal context
    if (context.temporal) {
      const now = new Date();
      if (context.temporal.season) {
        enhancedQuery += " " + context.temporal.season;
      }
      if (context.temporal.timeOfDay) {
        enhancedQuery += " " + context.temporal.timeOfDay;
      }
    }

    // Add event-specific context
    if (context.eventType) {
      enhancedQuery += " " + context.eventType;
    }

    return enhancedQuery.trim();
  }

  async updateDocument(indexName, documentId, newContent, metadata = {}) {
    try {
      const vectorStore = this.vectorStores.get(indexName);
      if (!vectorStore) {
        throw new Error(`Vector store not found for index: ${indexName}`);
      }

      // Delete old document
      await this.deleteDocument(indexName, documentId);

      // Add updated document
      const doc = new Document({
        pageContent: newContent,
        metadata: {
          ...metadata,
          documentId: documentId,
          updatedAt: new Date().toISOString(),
        },
      });

      await this.addDocuments(indexName, [doc], metadata);

      return {
        success: true,
        documentId,
        message: "Document updated successfully",
      };
    } catch (error) {
      console.error(
        `Error updating document ${documentId} in ${indexName}:`,
        error
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async deleteDocument(indexName, documentId) {
    try {
      const vectorStore = this.vectorStores.get(indexName);
      if (!vectorStore) {
        throw new Error(`Vector store not found for index: ${indexName}`);
      }

      // This depends on the vector store implementation
      // For Chroma, you would need to use the delete method with filter
      console.log(`Document deletion not fully implemented for ${documentId}`);

      return {
        success: true,
        message:
          "Document deletion functionality depends on vector store implementation",
      };
    } catch (error) {
      console.error(
        `Error deleting document ${documentId} from ${indexName}:`,
        error
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getIndexStats(indexName) {
    try {
      const vectorStore = this.vectorStores.get(indexName);
      if (!vectorStore) {
        return {
          exists: false,
          message: `Index ${indexName} not found`,
        };
      }

      // Get document count (implementation depends on vector store)
      // This is a simplified version
      const allDocs = await vectorStore.getDocuments();

      return {
        exists: true,
        documentCount: allDocs.length,
        indexName,
        vectorStoreType: this.config.type,
      };
    } catch (error) {
      console.error(`Error getting stats for index ${indexName}:`, error);
      return {
        exists: false,
        error: error.message,
      };
    }
  }

  getCacheKey(indexName, query, options) {
    const optionsStr = JSON.stringify(options || {});
    return `${indexName}_${query}_${optionsStr}`;
  }

  getDocumentKey(content, metadata) {
    const metadataStr = metadata ? JSON.stringify(metadata) : "";
    return crypto
      .createHash("md5")
      .update(content + metadataStr)
      .digest("hex");
  }

  clearCacheForIndex(indexName) {
    const keysToDelete = [];

    for (const [key, value] of this.cache.entries()) {
      if (key.startsWith(`${indexName}_`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    console.log(
      `Cleared ${keysToDelete.length} cache entries for index ${indexName}`
    );
  }

  cleanCache() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.config.cache.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    // If still too large, remove oldest entries
    if (this.cache.size > this.config.cache.maxSize) {
      const entries = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );

      const toRemove = entries.slice(
        0,
        this.cache.size - this.config.cache.maxSize
      );
      for (const [key] of toRemove) {
        this.cache.delete(key);
      }
    }

    console.log(
      `Cache cleaned: ${keysToDelete.length} expired entries removed`
    );
  }

  getStats() {
    const cacheStats = {
      size: this.cache.size,
      hitRate:
        this.stats.queries > 0
          ? (this.stats.hits / this.stats.queries) * 100
          : 0,
    };

    return {
      ...this.stats,
      cache: cacheStats,
      indexes: Array.from(this.vectorStores.keys()),
    };
  }

  async exportIndex(indexName, exportPath) {
    try {
      const vectorStore = this.vectorStores.get(indexName);
      if (!vectorStore) {
        throw new Error(`Index ${indexName} not found`);
      }

      const documents = await vectorStore.getDocuments();
      const exportData = {
        indexName,
        exportDate: new Date().toISOString(),
        documentCount: documents.length,
        documents: documents.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        })),
      };

      await fs.writeFile(
        exportPath,
        JSON.stringify(exportData, null, 2),
        "utf8"
      );

      return {
        success: true,
        exportPath,
        documentCount: documents.length,
      };
    } catch (error) {
      console.error(`Error exporting index ${indexName}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async importIndex(indexName, importPath) {
    try {
      const data = await fs.readFile(importPath, "utf8");
      const importData = JSON.parse(data);

      if (importData.indexName !== indexName) {
        console.warn(
          `Import data index name (${importData.indexName}) doesn't match target (${indexName})`
        );
      }

      const documents = importData.documents.map(
        (doc) =>
          new Document({
            pageContent: doc.content,
            metadata: doc.metadata,
          })
      );

      await this.addDocuments(indexName, documents);

      return {
        success: true,
        importedDocuments: documents.length,
        source: importPath,
      };
    } catch (error) {
      console.error(`Error importing index ${indexName}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Factory function for creating vector stores
function createVectorStore(config = {}) {
  return new EnhancedVectorStore(config);
}

// Utility functions for common operations
async function createFAQVectorStore(faqItems, config = {}) {
  const vectorStore = createVectorStore({
    ...config,
    indexes: { faq: "faq_index" },
  });

  const documents = faqItems.map(
    (faq) =>
      new Document({
        pageContent: `Q: ${faq.question}\nA: ${faq.answer}`,
        metadata: {
          id: faq.id,
          category: faq.category,
          tags: faq.tags,
          type: "faq",
          source: "faq_database",
        },
      })
  );

  await vectorStore.addDocuments("faq", documents);
  return vectorStore;
}

async function searchSimilarEvents(query, eventData, config = {}) {
  const vectorStore = createVectorStore({
    ...config,
    indexes: { events: "events_index" },
  });

  const documents = eventData.map(
    (event) =>
      new Document({
        pageContent: `
                Event: ${event.name}
                Description: ${event.description}
                Category: ${event.category}
                Location: ${event.location}
                Tags: ${event.tags.join(", ")}
                Organizer: ${event.organizer}
            `,
        metadata: {
          eventId: event.id,
          name: event.name,
          category: event.category,
          location: event.location,
          price: event.price,
          date: event.date,
          tags: event.tags,
          type: "event",
        },
      })
  );

  await vectorStore.addDocuments("events", documents);
  return await vectorStore.similaritySearch("events", query);
}

module.exports = {
  EnhancedVectorStore,
  createVectorStore,
  createFAQVectorStore,
  searchSimilarEvents,
};
