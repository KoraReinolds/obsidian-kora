#!/usr/bin/env node

/**
 * OpenAI Embeddings Service
 * Handles text vectorization using OpenAI API
 */

const OpenAI = require('openai');
const crypto = require('crypto');

class EmbeddingService {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      model: config.model || 'text-embedding-3-small',
      dimensions: config.dimensions || 1536, // Default for text-embedding-3-small
      maxTokens: config.maxTokens || 8000, // Safe limit for chunking
      ...config
    };

    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({
      apiKey: this.config.apiKey
    });
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text) {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Text must be a non-empty string');
      }

      // Clean and prepare text
      const cleanText = this.cleanText(text);
      
      // Check if text needs chunking
      const chunks = this.chunkText(cleanText);
      
      if (chunks.length === 1) {
        // Single chunk - direct embedding
        return await this.getSingleEmbedding(chunks[0]);
      } else {
        // Multiple chunks - average embeddings
        return await this.getAveragedEmbedding(chunks);
      }
    } catch (error) {
      console.error('[EmbeddingService] Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embedding for single text chunk
   */
  async getSingleEmbedding(text) {
    const response = await this.openai.embeddings.create({
      model: this.config.model,
      input: text,
      dimensions: this.config.dimensions
    });

    return {
      embedding: response.data[0].embedding,
      model: this.config.model,
      dimensions: this.config.dimensions,
      usage: response.usage,
      chunked: false
    };
  }

  /**
   * Generate averaged embedding for multiple chunks
   */
  async getAveragedEmbedding(chunks) {
    console.log(`[EmbeddingService] Processing ${chunks.length} chunks`);
    
    const embeddings = [];
    let totalUsage = { prompt_tokens: 0, total_tokens: 0 };

    // Process chunks sequentially to avoid rate limits
    for (const chunk of chunks) {
      const response = await this.openai.embeddings.create({
        model: this.config.model,
        input: chunk,
        dimensions: this.config.dimensions
      });

      embeddings.push(response.data[0].embedding);
      totalUsage.prompt_tokens += response.usage.prompt_tokens;
      totalUsage.total_tokens += response.usage.total_tokens;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Average the embeddings
    const avgEmbedding = this.averageEmbeddings(embeddings);

    return {
      embedding: avgEmbedding,
      model: this.config.model,
      dimensions: this.config.dimensions,
      usage: totalUsage,
      chunked: true,
      chunkCount: chunks.length
    };
  }

  /**
   * Clean text for embedding
   */
  cleanText(text) {
    return text
      .replace(/\r\n/g, '\n')  // Normalize line endings
      .replace(/\n+/g, '\n')   // Remove multiple newlines
      .trim();
  }

  /**
   * Split text into chunks if needed
   */
  chunkText(text) {
    // Rough token estimation (1 token ≈ 4 characters for English)
    const estimatedTokens = Math.ceil(text.length / 4);
    
    if (estimatedTokens <= this.config.maxTokens) {
      return [text];
    }

    // Split into sentences first
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks = [];
    let currentChunk = '';
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = Math.ceil(sentence.length / 4);
      
      if (currentTokens + sentenceTokens > this.config.maxTokens && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
        currentTokens = sentenceTokens;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
        currentTokens += sentenceTokens;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Average multiple embeddings
   */
  averageEmbeddings(embeddings) {
    if (embeddings.length === 0) {
      throw new Error('No embeddings to average');
    }

    if (embeddings.length === 1) {
      return embeddings[0];
    }

    const dimensions = embeddings[0].length;
    const averaged = new Array(dimensions).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        averaged[i] += embedding[i];
      }
    }

    // Normalize by count
    for (let i = 0; i < dimensions; i++) {
      averaged[i] /= embeddings.length;
    }

    return averaged;
  }

  /**
   * Generate content hash for caching/deduplication
   */
  generateContentHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if two embeddings are similar (for debugging)
   */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get model info
   */
  getModelInfo() {
    return {
      model: this.config.model,
      dimensions: this.config.dimensions,
      maxTokens: this.config.maxTokens
    };
  }
}

module.exports = EmbeddingService;