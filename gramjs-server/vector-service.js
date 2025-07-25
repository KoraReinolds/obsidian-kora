#!/usr/bin/env node

/**
 * Vector Service for Qdrant
 * Handles universal content vectorization and search
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const EmbeddingService = require('./embedding-service');
const { v4: uuidv4 } = require('uuid');

class VectorService {
  constructor(config = {}) {
    this.config = {
      qdrantUrl: config.qdrantUrl || process.env.QDRANT_URL || 'http://localhost:6333',
      collectionName: config.collectionName || 'kora_content',
      vectorSize: config.vectorSize || 1536,
      openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
      ...config
    };

    // Initialize Qdrant client
    this.client = new QdrantClient({
      url: this.config.qdrantUrl,
    });

    // Initialize embedding service
    this.embeddingService = new EmbeddingService({
      apiKey: this.config.openaiApiKey,
      dimensions: this.config.vectorSize
    });

    this.isInitialized = false;
  }

  /**
   * Initialize collection if it doesn't exist
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('[VectorService] Initializing...');
      
      // Check if collection exists
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        col => col.name === this.config.collectionName
      );

      if (!collectionExists) {
        console.log(`[VectorService] Creating collection: ${this.config.collectionName}`);
        await this.client.createCollection(this.config.collectionName, {
          vectors: {
            size: this.config.vectorSize,
            distance: 'Cosine'
          },
          optimizers_config: {
            default_segment_number: 2
          },
          replication_factor: 1
        });
      }

      // Create indexes for efficient filtering
      await this.createIndexes();
      
      this.isInitialized = true;
      console.log('[VectorService] Initialized successfully');
    } catch (error) {
      console.error('[VectorService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create indexes for efficient filtering
   */
  async createIndexes() {
    try {
      const indexFields = [
        'contentType',
        'originalId', // Add index for original ID lookup
        'telegram.channelId', 
        'telegram.author',
        'obsidian.folder',
        'obsidian.tags'
      ];

      for (const field of indexFields) {
        try {
          await this.client.createPayloadIndex(this.config.collectionName, {
            field_name: field,
            field_schema: 'keyword'
          });
        } catch (error) {
          // Index might already exist, ignore error
          if (!error.message?.includes('already exists')) {
            console.warn(`[VectorService] Warning creating index for ${field}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.warn('[VectorService] Warning creating indexes:', error);
    }
  }

  /**
   * Vectorize and store content
   */
  async vectorizeContent(contentData) {
    await this.initialize();

    try {
      const {
        id,
        contentType,
        title = '',
        content,
        metadata = {}
      } = contentData;

      if (!id || !contentType || !content) {
        throw new Error('id, contentType, and content are required');
      }

      console.log(`[VectorService] Vectorizing content: ${id} (${contentType})`);

      // Check if content already exists and unchanged
      const existingResult = await this.getContentByOriginalId(id);
      const contentHash = this.embeddingService.generateContentHash(content);
      
      if (existingResult && existingResult.payload.contentHash === contentHash) {
        console.log(`[VectorService] Content unchanged, skipping: ${id}`);
        return { id, status: 'unchanged', existing: true };
      }

      // Generate embedding
      const embeddingResult = await this.embeddingService.generateEmbedding(content);
      
      // Generate or reuse UUID for Qdrant
      const qdrantId = existingResult ? existingResult.qdrantId : uuidv4();
      
      // Prepare payload
      const payload = {
        originalId: id, // Store original ID for lookup
        contentType,
        title,
        content,
        contentHash,
        vectorizedAt: new Date().toISOString(),
        embeddingModel: embeddingResult.model,
        embeddingInfo: {
          dimensions: embeddingResult.dimensions,
          chunked: embeddingResult.chunked,
          chunkCount: embeddingResult.chunkCount || 1,
          usage: embeddingResult.usage
        },
        ...metadata
      };

      // Store in Qdrant using UUID
      await this.client.upsert(this.config.collectionName, {
        points: [{
          id: qdrantId,
          vector: embeddingResult.embedding,
          payload: payload
        }]
      });

      console.log(`[VectorService] Successfully vectorized: ${id} (Qdrant ID: ${qdrantId})`);
      
      return {
        id,
        qdrantId,
        status: existingResult ? 'updated' : 'created',
        embeddingInfo: embeddingResult,
        existing: !!existingResult
      };

    } catch (error) {
      console.error(`[VectorService] Error vectorizing content:`, error);
      throw error;
    }
  }

  /**
   * Search content by query
   */
  async searchContent(query, options = {}) {
    await this.initialize();

    try {
      const {
        limit = 10,
        contentTypes = [],
        filters = {},
        scoreThreshold = 0.0
      } = options;

      console.log(`[VectorService] Searching: "${query}"`);

      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Build filters
      const searchFilters = this.buildFilters(contentTypes, filters);

      // Search in Qdrant
      const searchResult = await this.client.search(this.config.collectionName, {
        vector: queryEmbedding.embedding,
        limit: limit,
        filter: searchFilters,
        score_threshold: scoreThreshold,
        with_payload: true
      });

      // Format results
      const results = searchResult.map(point => ({
        id: point.id,
        score: point.score,
        content: point.payload,
        // Add snippet for preview
        snippet: this.generateSnippet(point.payload.content, query)
      }));

      return {
        query,
        results,
        total: results.length,
        queryEmbeddingInfo: queryEmbedding
      };

    } catch (error) {
      console.error('[VectorService] Search error:', error);
      throw error;
    }
  }

  /**
   * Get content by original ID (searches by originalId in payload)
   */
  async getContentByOriginalId(originalId) {
    await this.initialize();

    try {
      const searchResult = await this.client.scroll(this.config.collectionName, {
        filter: {
          must: [{
            key: 'originalId',
            match: { value: originalId }
          }]
        },
        limit: 1,
        with_payload: true,
        with_vector: false
      });

      return searchResult.points.length > 0 ? {
        qdrantId: searchResult.points[0].id,
        payload: searchResult.points[0].payload
      } : null;
    } catch (error) {
      console.error(`[VectorService] Error getting content by original ID ${originalId}:`, error);
      return null;
    }
  }

  /**
   * Get content by ID (backwards compatibility - tries Qdrant ID first, then original ID)
   */
  async getContent(id) {
    await this.initialize();

    try {
      // First try as Qdrant ID
      try {
        const points = await this.client.retrieve(this.config.collectionName, {
          ids: [id],
          with_payload: true,
          with_vector: false
        });

        if (points.length > 0) {
          return points[0].payload;
        }
      } catch (error) {
        // If ID format is invalid for Qdrant, fall through to original ID search
      }

      // If not found or invalid format, try as original ID
      const result = await this.getContentByOriginalId(id);
      return result ? result.payload : null;
      
    } catch (error) {
      console.error(`[VectorService] Error getting content ${id}:`, error);
      return null;
    }
  }

  /**
   * Delete content by ID (supports both original ID and Qdrant UUID)
   */
  async deleteContent(id) {
    await this.initialize();

    try {
      let qdrantId = id;
      
      // Try to find by original ID if direct deletion fails
      try {
        await this.client.delete(this.config.collectionName, {
          points: [id]
        });
      } catch (error) {
        // If ID format is invalid, try to find by original ID
        const existingResult = await this.getContentByOriginalId(id);
        if (existingResult) {
          qdrantId = existingResult.qdrantId;
          await this.client.delete(this.config.collectionName, {
            points: [qdrantId]
          });
        } else {
          throw new Error(`Content not found: ${id}`);
        }
      }

      return { id, qdrantId, status: 'deleted' };
    } catch (error) {
      console.error(`[VectorService] Error deleting content ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getStats() {
    await this.initialize();

    try {
      const info = await this.client.getCollection(this.config.collectionName);
      
      // Get content type breakdown
      const scroll = await this.client.scroll(this.config.collectionName, {
        limit: 1000,
        with_payload: ['contentType'],
        with_vector: false
      });

      const contentTypes = {};
      scroll.points.forEach(point => {
        const type = point.payload.contentType || 'unknown';
        contentTypes[type] = (contentTypes[type] || 0) + 1;
      });

      return {
        collection: this.config.collectionName,
        totalPoints: info.points_count,
        vectorSize: info.config.params.vectors.size,
        contentTypeBreakdown: contentTypes,
        status: info.status
      };
    } catch (error) {
      console.error('[VectorService] Error getting stats:', error);
      throw error;
    }
  }

  /**
   * Build search filters
   */
  buildFilters(contentTypes, customFilters) {
    const conditions = [];

    // Content type filter
    if (contentTypes && contentTypes.length > 0) {
      conditions.push({
        key: 'contentType',
        match: {
          any: contentTypes
        }
      });
    }

    // Custom filters
    Object.entries(customFilters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        conditions.push({
          key: key,
          match: { any: value }
        });
      } else {
        conditions.push({
          key: key,
          match: { value: value }
        });
      }
    });

    return conditions.length > 0 ? { must: conditions } : undefined;
  }

  /**
   * Generate content snippet for search results
   */
  generateSnippet(content, query, maxLength = 200) {
    if (!content || !query) return '';

    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    const contentLower = content.toLowerCase();
    
    // Find best position to start snippet
    let bestPosition = 0;
    let maxMatches = 0;

    for (let i = 0; i < content.length - maxLength; i += 20) {
      const segment = contentLower.substring(i, i + maxLength);
      const matches = queryTerms.reduce((count, term) => {
        return count + (segment.includes(term) ? 1 : 0);
      }, 0);

      if (matches > maxMatches) {
        maxMatches = matches;
        bestPosition = i;
      }
    }

    let snippet = content.substring(bestPosition, bestPosition + maxLength);
    
    // Clean up snippet boundaries
    if (bestPosition > 0) {
      const firstSpace = snippet.indexOf(' ');
      if (firstSpace > 0 && firstSpace < 50) {
        snippet = '...' + snippet.substring(firstSpace);
      }
    }

    if (bestPosition + maxLength < content.length) {
      const lastSpace = snippet.lastIndexOf(' ');
      if (lastSpace > maxLength - 50) {
        snippet = snippet.substring(0, lastSpace) + '...';
      }
    }

    return snippet.trim();
  }

  /**
   * Batch vectorize multiple contents
   */
  async batchVectorize(contentList, onProgress = null) {
    const results = [];
    
    for (let i = 0; i < contentList.length; i++) {
      try {
        const result = await this.vectorizeContent(contentList[i]);
        results.push(result);
        
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: contentList.length,
            result
          });
        }

        // Small delay to avoid overwhelming the APIs
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`[VectorService] Batch error for item ${i}:`, error);
        results.push({
          id: contentList[i].id,
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.initialize();
      const stats = await this.getStats();
      return {
        status: 'healthy',
        qdrantUrl: this.config.qdrantUrl,
        collection: this.config.collectionName,
        stats
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        qdrantUrl: this.config.qdrantUrl
      };
    }
  }
}

module.exports = VectorService;