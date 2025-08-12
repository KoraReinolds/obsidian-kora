/**
 * Bridge for communicating with vector services on GramJS server
 * Provides TypeScript interface for vector operations
 */

import { Notice } from 'obsidian';
import { chunkNote } from './note-chunker/index.js';

interface VectorBridgeConfig {
  host: string;
  port: number;
  timeout: number;
}

interface VectorizeRequest {
  id: string;
  contentType: 'telegram_post' | 'telegram_comment' | 'obsidian_note';
  title?: string;
  content: string;
  metadata?: any;
}

interface VectorizeMessagesRequest {
  peer: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

interface SearchRequest {
  query: string;
  limit?: number;
  contentTypes?: string[];
  filters?: Record<string, any>;
  scoreThreshold?: number;
}

interface VectorStats {
  collection: string;
  totalPoints: number;
  vectorSize: number;
  contentTypeBreakdown: Record<string, number>;
  status: string;
}

interface SearchResult {
  id: string;
  score: number;
  content: any;
  snippet: string;
}

export class VectorBridge {
  private config: VectorBridgeConfig;
  private baseUrl: string;

  constructor(config: Partial<VectorBridgeConfig> = {}) {
    this.config = {
      host: '127.0.0.1',
      port: 8124,
      timeout: 30000, // Longer timeout for vectorization
      ...config
    };
    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
  }

  /**
   * Check vector service health
   */
  async isVectorServiceHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/vector_health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const health = await response.json();
      return health.status === 'healthy';
    } catch (error) {
      return false;
    }
  }

  /**
   * Vectorize content (universal)
   */
  async vectorizeContent(request: VectorizeRequest): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/vectorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to vectorize content');
      }

      return await response.json();
    } catch (error) {
      console.error('Error vectorizing content:', error);
      new Notice(`Ошибка векторизации: ${error.message}`);
      throw error;
    }
  }

  /**
   * Vectorize multiple contents in batch
   */
  async batchVectorize(contents: VectorizeRequest[]): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/vectorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: contents }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to batch vectorize content');
      }

      return await response.json();
    } catch (error) {
      console.error('Error batch vectorizing content:', error);
      new Notice(`Ошибка батч-векторизации: ${error.message}`);
      throw error;
    }
  }

  /**
   * Vectorize Telegram messages from channel
   */
  async vectorizeMessages(request: VectorizeMessagesRequest): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/vectorize_messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to vectorize messages');
      }

      return await response.json();
    } catch (error) {
      console.error('Error vectorizing messages:', error);
      new Notice(`Ошибка векторизации сообщений: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search vectorized content
   */
  async searchContent(request: SearchRequest): Promise<{ results: SearchResult[], total: number, query: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to search content');
      }

      return await response.json();
    } catch (error) {
      console.error('Error searching content:', error);
      new Notice(`Ошибка поиска: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get content by ID
   */
  /**
   * Universal content getter.
   * - When multiple=true, returns an array; otherwise returns a single item or null.
   */
  async getContentBy(params: { by: string; value: string; multiple?: boolean; limit?: number }): Promise<
    { qdrantId: string; payload: any } | Array<{ qdrantId: string; payload: any }> | null
  > {
    const { by, value, multiple = false, limit = 2048 } = params;
    try {
      const qs = new URLSearchParams({ by, value, multiple: String(multiple), limit: String(limit) });
      const response = await fetch(`${this.baseUrl}/content?${qs.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!multiple && response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get content');
      }

      const result = await response.json();
      return multiple ? (result.contents || []) : (result.content || null);
    } catch (error) {
      console.error('Error getting content:', error);
      throw error;
    }
  }

  /**
   * Delete all vectors for a given originalId. Optionally keep specific chunkIds.
   * Returns number of deleted points.
   */
  async deleteByOriginalId(originalId: string): Promise<number> {
    try {
      // Prefer server-side filtered delete to minimize roundtrips
      const qs = new URLSearchParams({ by: 'originalId', value: originalId });
      const response = await fetch(`${this.baseUrl}/content?${qs.toString()}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete content by originalId');
      }
      const result = await response.json();
      return Number(result.deleted || 0);
    } catch (error) {
      console.error('Error deleting by originalId:', error);
      return 0;
    }
  }

  /**
   * Get vector service statistics
   */
  async getStats(): Promise<VectorStats> {
    try {
      const response = await fetch(`${this.baseUrl}/vector_stats`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get stats');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting vector stats:', error);
      throw error;
    }
  }

  /**
   * Vectorize current Obsidian note.
   * If frontmatter/cache are available, splits the note into chunks and batch vectorizes them.
   * Otherwise falls back to single-document vectorization.
   *
   * @param file - Note descriptor including path, content, title, optional metadata/frontmatter and optional cache
   * @returns Batch result when chunked; otherwise single vectorize result
   */
  async vectorizeNote(file: { originalId: string, path: string, content: string, title: string, metadata?: any, cache?: any }): Promise<any> {
    debugger
    const frontmatter = file?.metadata?.frontmatter ?? file?.metadata ?? {};
    const tags = Array.isArray(frontmatter?.tags) ? frontmatter.tags : [];
    const aliases = Array.isArray(frontmatter?.aliases) ? frontmatter.aliases : [];
    const { originalId, title } = file

    if (file.cache) {
      // Chunk and batch vectorize
      const chunks = chunkNote(
        file.content,
        { notePath: file.path, originalId, frontmatter, tags, aliases },
        {},
        file.cache as any
      );
      // Delete old vectors for chunks that no longer exist
      try {
        await this.deleteByOriginalId(originalId);
      } catch (err) {
        console.warn('Failed to delete old vectors before re-indexing (continuing):', (err as any)?.message ?? err);
      }
      const batch = chunks.map((c) => ({
        id: `${originalId}#${c.chunkId}`,
        contentType: 'obsidian_note',
        title,
        content: c.contentRaw,
        metadata: c.meta,
      }));
      return await this.batchVectorize(batch as any);
    }

    // Fallback: single vectorize
    try {
      // Ensure any previously chunked or single entries for this note are removed
      await this.deleteByOriginalId(originalId);
    } catch (err) {
      console.warn('Failed to delete previous vectors for single-note mode:', (err as any)?.message ?? err);
    }
    return await this.vectorizeContent({
      id: originalId,
      contentType: 'obsidian_note',
      title: file.title,
      content: file.content,
      metadata: {
        obsidian: {
          filePath: file.path,
          fileName: file.title,
          folder: file.path.substring(0, file.path.lastIndexOf('/')) || '/',
          modifiedAt: new Date().toISOString(),
          createdAt: originalId,
          ...file.metadata
        }
      }
    });
  }

  /**
   * Test connection and show status
   */
  async testConnection(): Promise<boolean> {
    try {
      const isHealthy = await this.isVectorServiceHealthy();
      
      if (!isHealthy) {
        new Notice('Vector service недоступен. Убедитесь, что GramJS server запущен с настроенными Qdrant и OpenAI.');
        return false;
      }

      const stats = await this.getStats();
      new Notice(`Vector service готов: ${stats.totalPoints} документов в коллекции ${stats.collection}`);
      return true;
    } catch (error) {
      console.error('Error testing vector connection:', error);
      new Notice(`Ошибка подключения к Vector service: ${error.message}`);
      return false;
    }
  }
}