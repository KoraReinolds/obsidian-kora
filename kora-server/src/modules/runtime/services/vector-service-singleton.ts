/**
 * @module modules/runtime/services/vector-service-singleton
 * @description Фабрика semantic backend-а. Routes продолжают видеть единый сервис,
 * а внутри используется только SQLite backend.
 */

import { SQLiteSemanticBackend } from '../../../semantic-sqlite/sqlite-semantic-backend.js';
import type { SemanticBackend } from '../../../semantic/types.js';
import { getConfig } from '../../../services/config-service.js';

let instance: SemanticBackend | null = null;
let currentDatabasePath: string | null = null;
let currentEmbeddingModel: string | null = null;
let currentEmbeddingBaseUrl: string | null = null;
let currentEmbeddingApiKey: string | null = null;

/**
 * @description Возвращает общий semantic backend в соответствии с runtime-конфигом.
 * При смене пути к SQLite или embedding-настроек пересоздаёт singleton.
 * @returns {SemanticBackend | null} Общий backend или null, если инициализация не удалась.
 */
export function getVectorService(): SemanticBackend | null {
	const config = getConfig();
	const nextDatabasePath = config.semanticDatabasePath || null;
	const nextEmbeddingModel = config.embeddingModel || null;
	const nextEmbeddingBaseUrl = config.embeddingBaseUrl || null;
	const nextEmbeddingApiKey = config.openaiApiKey || null;

	if (
		instance &&
		currentDatabasePath === nextDatabasePath &&
		currentEmbeddingModel === nextEmbeddingModel &&
		currentEmbeddingBaseUrl === nextEmbeddingBaseUrl &&
		currentEmbeddingApiKey === nextEmbeddingApiKey
	) {
		return instance;
	}

	resetVectorServices();

	try {
		instance = new SQLiteSemanticBackend({
			backend: 'sqlite',
			openaiApiKey: config.openaiApiKey,
			embeddingModel: config.embeddingModel,
			embeddingBaseUrl: config.embeddingBaseUrl,
			vectorSize: 1536,
			databasePath: nextDatabasePath || undefined,
		});
		currentDatabasePath = nextDatabasePath;
		currentEmbeddingModel = nextEmbeddingModel;
		currentEmbeddingBaseUrl = nextEmbeddingBaseUrl;
		currentEmbeddingApiKey = nextEmbeddingApiKey;
		// eslint-disable-next-line no-console
		console.log('[VectorService] Initialized backend: sqlite');
	} catch (e: any) {
		// eslint-disable-next-line no-console
		console.warn('[VectorService] Failed to initialize:', e?.message ?? e);
		instance = null;
		currentDatabasePath = null;
		currentEmbeddingModel = null;
		currentEmbeddingBaseUrl = null;
		currentEmbeddingApiKey = null;
	}

	return instance;
}

/**
 * @description Сбрасывает singleton semantic backend-а. Нужен при смене пути БД
 * или embedding-конфигурации.
 * @returns {void}
 */
export function resetVectorServices(): void {
	instance?.close?.();
	instance = null;
	currentDatabasePath = null;
	currentEmbeddingModel = null;
	currentEmbeddingBaseUrl = null;
	currentEmbeddingApiKey = null;
}
