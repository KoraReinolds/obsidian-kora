/**
 * VectorService singleton accessor. Lazily initializes and returns a shared instance.
 */

import VectorService from '../vector-service.js';

let instance: VectorService | null = null;

/**
 * JSDoc: Returns a shared VectorService or null if init failed.
 */
export function getVectorService(): VectorService | null {
  if (instance) return instance;
  try {
    instance = new VectorService({
      qdrantUrl: process.env.QDRANT_URL,
      openaiApiKey: process.env.OPENAI_API_KEY,
      collectionName: process.env.QDRANT_COLLECTION,
    });
    // eslint-disable-next-line no-console
    console.log('[VectorService] Initialized');
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[VectorService] Failed to initialize:', e?.message ?? e);
    instance = null;
  }
  return instance;
}
