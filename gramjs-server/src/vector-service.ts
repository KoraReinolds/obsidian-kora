#!/usr/bin/env node

/**
 * Vector Service for Qdrant
 * Handles universal content vectorization and search
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import EmbeddingService, { type EmbeddingConfig, type EmbeddingResult } from './embedding-service.js';
import { v4 as uuidv4 } from 'uuid';

export interface VectorConfig {
  qdrantUrl?: string;
  collectionName?: string;
  vectorSize?: number;
  openaiApiKey?: string;
  [key: string]: any;
}

export interface ContentData {
  id: string;
  contentType: string;
  title?: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  limit?: number;
  contentTypes?: string[];
  filters?: Record<string, any>;
  scoreThreshold?: number;
}

export interface SearchResult {
  query: string;
  results: Array<{
    id: string;
    score: number;
    content: any;
    snippet: string;
  }>;
  total: number;
  queryEmbeddingInfo: EmbeddingResult;
}

export interface VectorizeResult {
  id: string;
  qdrantId?: string;
  status: 'created' | 'updated' | 'unchanged' | 'error';
  embeddingInfo?: EmbeddingResult;
  existing?: boolean;
  error?: string;
}

class VectorService {
  private config: Required<VectorConfig> & { [key: string]: any };
  private client: QdrantClient;
  private embeddingService: EmbeddingService;
  private isInitialized: boolean;

  constructor(config: VectorConfig = {}) {
    this.config = {
      qdrantUrl: config.qdrantUrl || process.env.QDRANT_URL || 'http://localhost:6333',
      collectionName: config.collectionName || 'kora_content',
      vectorSize: config.vectorSize || 1536,
      openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY || '',
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
  async initialize(): Promise<void> {
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
  async createIndexes(): Promise<void> {
    try{
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
  async vectorizeContent(contentData: ContentData): Promise<VectorizeResult> {
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
      const existingResult = await this.getContentBy('originalId', id);
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
  async searchContent(query: string, options: SearchOptions = {}): Promise<SearchResult> {
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
        id: point.id.toString(),
        score: point.score,
        content: point.payload,
        // Add snippet for preview
        snippet: this.generateSnippet((point.payload as any).content as string, query)
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
   * Get content by any key
   * - key 'id' or 'qdrantId' will search by Qdrant point id via retrieve
   * - otherwise searches by payload field equality via scroll filter
   */
  async getContentBy(key: string, value: string): Promise<{ qdrantId: string; payload: any } | null> {
    await this.initialize();

    try {
      if (key === 'id' || key === 'qdrantId') {
        const points = await this.client.retrieve(this.config.collectionName, {
          ids: [value],
          with_payload: true,
          with_vector: false
        });
        return points.length > 0
          ? { qdrantId: points[0].id.toString(), payload: points[0].payload }
          : null;
      }

      const searchResult = await this.client.scroll(this.config.collectionName, {
        filter: {
          must: [{
            key,
            match: { value }
          }]
        },
        limit: 1,
        with_payload: true,
        with_vector: false
      });

      return searchResult.points.length > 0
        ? { qdrantId: searchResult.points[0].id.toString(), payload: searchResult.points[0].payload }
        : null;
    } catch (error) {
      console.error(`[VectorService] Error getting content by ${key}=${value}:`, error);
      return null;
    }
  }

  /**
   * Get multiple contents by payload key equality (or by Qdrant ID array when key is 'id'/'qdrantId').
   */
  async getContentsBy(key: string, value: string, limit = 2048): Promise<Array<{ qdrantId: string; payload: any }>> {
    await this.initialize();
    try {
      if (key === 'id' || key === 'qdrantId') {
        const points = await this.client.retrieve(this.config.collectionName, {
          ids: [value],
          with_payload: true,
          with_vector: false
        });
        return points.map(p => ({ qdrantId: p.id.toString(), payload: p.payload }));
      }
      const result = await this.client.scroll(this.config.collectionName, {
        filter: { must: [{ key, match: { value } }] },
        limit,
        with_payload: true,
        with_vector: false
      });
      return result.points.map(pt => ({ qdrantId: pt.id.toString(), payload: pt.payload }));
    } catch (error) {
      console.error(`[VectorService] Error getting contents by ${key}=${value}:`, error);
      return [];
    }
  }

  /**
   * Get content by ID (backwards compatibility - tries Qdrant ID first, then original ID)
   */
  async getContent(id: string): Promise<any> {
    await this.initialize();

    try {
      const byId = await this.getContentBy('id', id);
      if (byId) return byId.payload;
      const byOriginal = await this.getContentBy('originalId', id);
      return byOriginal ? byOriginal.payload : null;
      
    } catch (error) {
      console.error(`[VectorService] Error getting content ${id}:`, error);
      return null;
    }
  }

  // Legacy deleteContent(id) removed in favor of deleteBy(key, value, opts)

  /**
   * Delete many contents by payload key/value filter or by qdrantId.
   * Returns an approximate count of deleted points (pre-delete match count).
   * Value can be a string or array of strings (for batch operations).
   * Special case: if key is 'qdrantId', deletes by exact point IDs.
   */
  async deleteBy(
    key: string,
    value: string | string[],
    options?: { preCountLimit?: number }
  ): Promise<{ deleted: number }> {
    await this.initialize();
    try {
      const preCountLimit = options?.preCountLimit ?? 5000;

      // Special case: delete by exact qdrant point IDs
      if (key === 'qdrantId') {
        const ids = Array.isArray(value) ? value : [value];
        console.log('[VectorService] Deleting by qdrantId:', ids.length, 'points');

        await this.client.delete(this.config.collectionName, {
          points: ids
        });

        return { deleted: ids.length };
      }

      // Regular filter-based deletion
      const filter: any = {
        must: [
          Array.isArray(value) ? {
            key,
            match: { any: value }
          } : {
            key,
            match: { value }
          }
        ]
      };

      // Pre-count matches (best-effort)
      let deleted = 0;
      try {
        const scroll = await this.client.scroll(this.config.collectionName, {
          filter,
          limit: preCountLimit,
          with_payload: false,
          with_vector: false
        });
        deleted = scroll.points.length;
      } catch {
        // ignore count errors
      }
      
      console.log('[VectorService] Deleting:', deleted);

      // Delete by filter
      await this.client.delete(this.config.collectionName, {
        filter
      } as any);

      return { deleted };
    } catch (error) {
      console.error(`[VectorService] Error deleting by ${key}=${value}:`, error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{
    collection: string;
    totalPoints: number;
    vectorSize: number;
    contentTypeBreakdown: Record<string, number>;
    status: string;
  }> {
    await this.initialize();

    try {
      const info = await this.client.getCollection(this.config.collectionName);
      
      // Get content type breakdown
      const scroll = await this.client.scroll(this.config.collectionName, {
        limit: 1000,
        with_payload: ['contentType'],
        with_vector: false
      });

      const contentTypes: Record<string, number> = {};
      scroll.points.forEach(point => {
        const type = (point.payload as any).contentType as string || 'unknown';
        contentTypes[type] = (contentTypes[type] || 0) + 1;
      });

      return {
        collection: this.config.collectionName,
        totalPoints: info.points_count || 0,
        vectorSize: (info.config.params as any).vectors.size as number,
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
  buildFilters(contentTypes: string[], customFilters: Record<string, any>): any {
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
  generateSnippet(content: string, query: string, maxLength = 200): string {
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
  async batchVectorize(
    contentList: ContentData[],
    onProgress?: (progress: { current: number; total: number; result: VectorizeResult }) => void
  ): Promise<VectorizeResult[]> {
    const results: VectorizeResult[] = [];
    
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
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    qdrantUrl?: string;
    collection?: string;
    stats?: any;
    error?: string;
  }> {
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

export default VectorService;