/**
 * Bridge for communicating with vector services on GramJS server
 * Provides TypeScript interface for vector operations
 */

import { Notice } from 'obsidian';

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
  async getContent(id: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/content/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get content');
      }

      const result = await response.json();
      return result.content;
    } catch (error) {
      console.error('Error getting content:', error);
      throw error;
    }
  }

  /**
   * Delete content by ID
   */
  async deleteContent(id: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/content/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete content');
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting content:', error);
      new Notice(`Ошибка удаления: ${error.message}`);
      throw error;
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
   * Vectorize current Obsidian note
   */
  async vectorizeNote(file: { path: string, content: string, title: string, metadata?: any }): Promise<any> {
    const id = `obsidian_${file.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    return await this.vectorizeContent({
      id,
      contentType: 'obsidian_note',
      title: file.title,
      content: file.content,
      metadata: {
        obsidian: {
          filePath: file.path,
          fileName: file.title,
          folder: file.path.substring(0, file.path.lastIndexOf('/')) || '/',
          modifiedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
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