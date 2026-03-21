/**
 * @module services/vector-service-singleton
 * @description Фабрика semantic backend-а. Routes продолжают видеть единый сервис,
 * а внутри можно переключать реализацию между Qdrant и SQLite.
 */

import VectorService from '../vector-service.js';
import { SQLiteSemanticBackend } from '../semantic-sqlite/sqlite-semantic-backend.js';
import type {
	SemanticBackend,
	SemanticBackendType,
} from '../semantic/types.js';
import { getConfig } from './config-service.js';

let instance: SemanticBackend | null = null;
let currentBackend: SemanticBackendType | null = null;
let currentDatabasePath: string | null = null;
let currentEmbeddingModel: string | null = null;
let currentEmbeddingBaseUrl: string | null = null;
let currentEmbeddingApiKey: string | null = null;

/**
 * @description Возвращает общий semantic backend в соответствии с runtime-конфигом.
 * При смене backend-а или пути к SQLite пересоздаёт singleton.
 * @returns {SemanticBackend | null} Общий backend или null, если инициализация не удалась.
 */
export function getVectorService(): SemanticBackend | null {
	const config = getConfig();
	const nextBackend = config.semanticBackend || 'qdrant';
	const nextDatabasePath = config.semanticDatabasePath || null;
	const nextEmbeddingModel = config.embeddingModel || null;
	const nextEmbeddingBaseUrl = config.embeddingBaseUrl || null;
	const nextEmbeddingApiKey = config.openaiApiKey || null;

	if (
		instance &&
		currentBackend === nextBackend &&
		(nextBackend !== 'sqlite' || currentDatabasePath === nextDatabasePath) &&
		currentEmbeddingModel === nextEmbeddingModel &&
		currentEmbeddingBaseUrl === nextEmbeddingBaseUrl &&
		currentEmbeddingApiKey === nextEmbeddingApiKey
	) {
		return instance;
	}

	resetVectorServices();

	try {
		instance =
			nextBackend === 'sqlite'
				? new SQLiteSemanticBackend({
						backend: 'sqlite',
						openaiApiKey: config.openaiApiKey,
						embeddingModel: config.embeddingModel,
						embeddingBaseUrl: config.embeddingBaseUrl,
						vectorSize: 1536,
						databasePath: nextDatabasePath || undefined,
					})
				: new VectorService({
						backend: 'qdrant',
						qdrantUrl: process.env.QDRANT_URL,
						openaiApiKey: config.openaiApiKey,
						embeddingModel: config.embeddingModel,
						embeddingBaseUrl: config.embeddingBaseUrl,
						collectionName: process.env.QDRANT_COLLECTION,
						vectorSize: 1536,
					});
		currentBackend = nextBackend;
		currentDatabasePath = nextDatabasePath;
		currentEmbeddingModel = nextEmbeddingModel;
		currentEmbeddingBaseUrl = nextEmbeddingBaseUrl;
		currentEmbeddingApiKey = nextEmbeddingApiKey;
		// eslint-disable-next-line no-console
		console.log(`[VectorService] Initialized backend: ${nextBackend}`);
	} catch (e: any) {
		// eslint-disable-next-line no-console
		console.warn('[VectorService] Failed to initialize:', e?.message ?? e);
		instance = null;
		currentBackend = null;
		currentDatabasePath = null;
		currentEmbeddingModel = null;
		currentEmbeddingBaseUrl = null;
		currentEmbeddingApiKey = null;
	}

	return instance;
}

/**
 * @description Сбрасывает singleton semantic backend-а. Нужен при смене backend-а или пути БД.
 * @returns {void}
 */
export function resetVectorServices(): void {
	instance?.close?.();
	instance = null;
	currentBackend = null;
	currentDatabasePath = null;
	currentEmbeddingModel = null;
	currentEmbeddingBaseUrl = null;
	currentEmbeddingApiKey = null;
}
