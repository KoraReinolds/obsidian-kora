#!/usr/bin/env node

/**
 * Vector Service backed by Qdrant.
 * Kept behind a generic semantic backend contract so it can be swapped for SQLite.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import EmbeddingService from './embedding-service.js';
import { v4 as uuidv4 } from 'uuid';
import type {
	ContentData,
	SearchOptions,
	SearchResult,
	SemanticBackend,
	SemanticBackendConfig,
	SemanticHealthCheck,
	SemanticStats,
	StoredContentRecord,
	VectorizeResult,
} from './semantic/types.js';
import { buildSemanticPayload, generateSnippet } from './semantic/utils.js';

class VectorService implements SemanticBackend {
	private config: Required<SemanticBackendConfig> & { [key: string]: any };
	private client: QdrantClient;
	private embeddingService: EmbeddingService;
	private isInitialized: boolean;

	constructor(config: SemanticBackendConfig = {}) {
		this.config = {
			backend: 'qdrant',
			qdrantUrl:
				config.qdrantUrl || process.env.QDRANT_URL || 'http://localhost:6333',
			collectionName: config.collectionName || 'kora_content',
			vectorSize: config.vectorSize || 1536,
			openaiApiKey:
				config.openaiApiKey ||
				process.env.OPENROUTER_API_KEY ||
				process.env.OPENAI_API_KEY ||
				'',
			embeddingModel:
				config.embeddingModel ||
				process.env.EMBEDDING_MODEL ||
				'text-embedding-3-small',
			embeddingBaseUrl:
				config.embeddingBaseUrl ||
				process.env.OPENROUTER_BASE_URL ||
				process.env.OPENAI_BASE_URL ||
				'https://openrouter.ai/api/v1',
			databasePath: config.databasePath || '',
			...config,
		};

		this.client = new QdrantClient({
			url: this.config.qdrantUrl,
		});
		this.embeddingService = new EmbeddingService({
			apiKey: this.config.openaiApiKey,
			baseUrl: this.config.embeddingBaseUrl,
			model: this.config.embeddingModel,
			dimensions: this.config.vectorSize,
		});
		this.isInitialized = false;
	}

	/**
	 * @description Инициализирует коллекцию Qdrant и payload indexes один раз.
	 * @returns {Promise<void>}
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		try {
			console.log('[VectorService] Initializing...');

			const collections = await this.client.getCollections();
			const collectionExists = collections.collections.some(
				col => col.name === this.config.collectionName
			);

			if (!collectionExists) {
				console.log(
					`[VectorService] Creating collection: ${this.config.collectionName}`
				);
				await this.client.createCollection(this.config.collectionName, {
					vectors: {
						size: this.config.vectorSize,
						distance: 'Cosine',
					},
					optimizers_config: {
						default_segment_number: 2,
					},
					replication_factor: 1,
				});
			}

			await this.createIndexes();
			this.isInitialized = true;
			console.log('[VectorService] Initialized successfully');
		} catch (error) {
			console.error('[VectorService] Initialization failed:', error);
			throw error;
		}
	}

	/**
	 * @description Создаёт payload indexes по наиболее часто фильтруемым полям.
	 * @returns {Promise<void>}
	 */
	async createIndexes(): Promise<void> {
		try {
			const indexFields = [
				'pointId',
				'contentType',
				'originalId',
				'chunkId',
				'telegram.channelId',
				'telegram.author',
				'obsidian.folder',
				'obsidian.tags',
			];

			for (const field of indexFields) {
				try {
					await this.client.createPayloadIndex(this.config.collectionName, {
						field_name: field,
						field_schema: 'keyword',
					});
				} catch (error) {
					if (!error.message?.includes('already exists')) {
						console.warn(
							`[VectorService] Warning creating index for ${field}:`,
							error.message
						);
					}
				}
			}
		} catch (error) {
			console.warn('[VectorService] Warning creating indexes:', error);
		}
	}

	/**
	 * @description Векторизует одну запись и upsert-ит её в Qdrant по stable point id.
	 * @param {ContentData} contentData - Канонические данные записи.
	 * @returns {Promise<VectorizeResult>} Результат upsert-а.
	 */
	async vectorizeContent(contentData: ContentData): Promise<VectorizeResult> {
		await this.initialize();

		try {
			const {
				id,
				contentType,
				title = '',
				content,
				metadata = {},
			} = contentData;

			if (!id || !contentType || !content) {
				throw new Error('id, contentType, and content are required');
			}

			console.log(
				`[VectorService] Vectorizing content: ${id} (${contentType})`
			);

			const existingResult = await this.getContentBy('pointId', id);
			const contentHash = this.embeddingService.generateContentHash(content);

			if (
				existingResult &&
				existingResult.payload.contentHash === contentHash
			) {
				console.log(`[VectorService] Content unchanged, skipping: ${id}`);
				return {
					id,
					pointId: id,
					qdrantId: existingResult.qdrantId,
					status: 'unchanged',
					existing: true,
				};
			}

			const embeddingResult =
				await this.embeddingService.generateEmbedding(content);
			const qdrantId = existingResult ? existingResult.qdrantId : uuidv4();
			const payload = buildSemanticPayload(
				{ id, contentType, title, content, metadata },
				contentHash,
				embeddingResult
			);

			await this.client.upsert(this.config.collectionName, {
				points: [
					{
						id: qdrantId,
						vector: embeddingResult.embedding,
						payload,
					},
				],
			});

			console.log(
				`[VectorService] Successfully vectorized: ${id} (Qdrant ID: ${qdrantId})`
			);

			return {
				id,
				pointId: id,
				qdrantId,
				status: existingResult ? 'updated' : 'created',
				embeddingInfo: embeddingResult,
				existing: !!existingResult,
			};
		} catch (error) {
			console.error(`[VectorService] Error vectorizing content:`, error);
			throw error;
		}
	}

	/**
	 * @description Выполняет semantic search в Qdrant.
	 * @param {string} query - Поисковый запрос.
	 * @param {SearchOptions} [options={}] - Ограничения выборки и threshold.
	 * @returns {Promise<SearchResult>} Отранжированные результаты.
	 */
	async searchContent(
		query: string,
		options: SearchOptions = {}
	): Promise<SearchResult> {
		await this.initialize();

		try {
			const {
				limit = 10,
				contentTypes = [],
				filters = {},
				scoreThreshold = 0.0,
			} = options;

			console.log(`[VectorService] Searching: "${query}"`);

			const queryEmbedding =
				await this.embeddingService.generateEmbedding(query);
			const searchFilters = this.buildFilters(contentTypes, filters);
			const searchResult = await this.client.search(
				this.config.collectionName,
				{
					vector: queryEmbedding.embedding,
					limit,
					filter: searchFilters,
					score_threshold: scoreThreshold,
					with_payload: true,
				}
			);

			const results = searchResult.map(point => ({
				id: point.id.toString(),
				score: point.score,
				content: point.payload,
				snippet: generateSnippet(
					(point.payload as any).content as string,
					query
				),
			}));

			return {
				query,
				results,
				total: results.length,
				queryEmbeddingInfo: queryEmbedding,
			};
		} catch (error) {
			console.error('[VectorService] Search error:', error);
			throw error;
		}
	}

	/**
	 * @description Возвращает одну запись по point id/Qdrant id или payload-полю.
	 * @param {string} key - Ключ поиска.
	 * @param {string} value - Значение.
	 * @returns {Promise<StoredContentRecord | null>} Одна запись или null.
	 */
	async getContentBy(
		key: string,
		value: string
	): Promise<StoredContentRecord | null> {
		await this.initialize();

		try {
			if (key === 'id' || key === 'qdrantId') {
				const points = await this.client.retrieve(this.config.collectionName, {
					ids: [value],
					with_payload: true,
					with_vector: false,
				});
				return points.length > 0
					? { qdrantId: points[0].id.toString(), payload: points[0].payload }
					: null;
			}

			const searchResult = await this.client.scroll(
				this.config.collectionName,
				{
					filter: {
						must: [
							{
								key,
								match: { value },
							},
						],
					},
					limit: 1,
					with_payload: true,
					with_vector: false,
				}
			);

			return searchResult.points.length > 0
				? {
						qdrantId: searchResult.points[0].id.toString(),
						payload: searchResult.points[0].payload,
					}
				: null;
		} catch (error) {
			console.error(
				`[VectorService] Error getting content by ${key}=${value}:`,
				error
			);
			return null;
		}
	}

	/**
	 * @description Возвращает несколько записей по payload-ключу.
	 * @param {string} key - Ключ поиска.
	 * @param {string} value - Значение.
	 * @param {number} [limit=2048] - Максимум результатов.
	 * @returns {Promise<StoredContentRecord[]>} Список записей.
	 */
	async getContentsBy(
		key: string,
		value: string,
		limit = 2048
	): Promise<StoredContentRecord[]> {
		await this.initialize();
		try {
			if (key === 'id' || key === 'qdrantId') {
				const points = await this.client.retrieve(this.config.collectionName, {
					ids: [value],
					with_payload: true,
					with_vector: false,
				});
				return points.map(p => ({
					qdrantId: p.id.toString(),
					payload: p.payload,
				}));
			}

			const result = await this.client.scroll(this.config.collectionName, {
				filter: { must: [{ key, match: { value } }] },
				limit,
				with_payload: true,
				with_vector: false,
			});

			return result.points.map(pt => ({
				qdrantId: pt.id.toString(),
				payload: pt.payload,
			}));
		} catch (error) {
			console.error(
				`[VectorService] Error getting contents by ${key}=${value}:`,
				error
			);
			return [];
		}
	}

	/**
	 * @description Удаляет записи по Qdrant id или filter-key.
	 * @param {string} key - Ключ фильтра.
	 * @param {string | string[]} value - Одно значение или пакет значений.
	 * @param {{ preCountLimit?: number }} [options] - Опции best-effort pre-count.
	 * @returns {Promise<{ deleted: number }>} Сколько записей удалено.
	 */
	async deleteBy(
		key: string,
		value: string | string[],
		options?: { preCountLimit?: number }
	): Promise<{ deleted: number }> {
		await this.initialize();
		try {
			const preCountLimit = options?.preCountLimit ?? 5000;

			if (key === 'qdrantId') {
				const ids = Array.isArray(value) ? value : [value];
				console.log(
					'[VectorService] Deleting by qdrantId:',
					ids.length,
					'points'
				);

				await this.client.delete(this.config.collectionName, {
					points: ids,
				});

				return { deleted: ids.length };
			}

			const filter: any = {
				must: [
					Array.isArray(value)
						? {
								key,
								match: { any: value },
							}
						: {
								key,
								match: { value },
							},
				],
			};

			let deleted = 0;
			try {
				const scroll = await this.client.scroll(this.config.collectionName, {
					filter,
					limit: preCountLimit,
					with_payload: false,
					with_vector: false,
				});
				deleted = scroll.points.length;
			} catch {
				// ignore best-effort count errors
			}

			console.log('[VectorService] Deleting:', deleted);
			await this.client.delete(this.config.collectionName, {
				filter,
			} as any);

			return { deleted };
		} catch (error) {
			console.error(
				`[VectorService] Error deleting by ${key}=${value}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * @description Возвращает статистику коллекции Qdrant в shape, совместимой с SQLite backend.
	 * @returns {Promise<SemanticStats>} Сводка по backend-у.
	 */
	async getStats(): Promise<SemanticStats> {
		await this.initialize();

		try {
			const info = await this.client.getCollection(this.config.collectionName);
			const scroll = await this.client.scroll(this.config.collectionName, {
				limit: 1000,
				with_payload: ['contentType'],
				with_vector: false,
			});

			const contentTypes: Record<string, number> = {};
			scroll.points.forEach(point => {
				const type =
					((point.payload as any).contentType as string) || 'unknown';
				contentTypes[type] = (contentTypes[type] || 0) + 1;
			});

			return {
				backend: 'qdrant',
				collection: this.config.collectionName,
				totalPoints: info.points_count || 0,
				vectorSize: (info.config.params as any).vectors.size as number,
				contentTypeBreakdown: contentTypes,
				status: info.status,
				qdrantUrl: this.config.qdrantUrl,
			};
		} catch (error) {
			console.error('[VectorService] Error getting stats:', error);
			throw error;
		}
	}

	/**
	 * @description Строит payload filters для Qdrant search API.
	 * @param {string[]} contentTypes - Ограничение по типам.
	 * @param {Record<string, any>} customFilters - Дополнительные поля payload.
	 * @returns {any} Qdrant filter или undefined.
	 */
	buildFilters(
		contentTypes: string[],
		customFilters: Record<string, any>
	): any {
		const conditions = [];

		if (contentTypes && contentTypes.length > 0) {
			conditions.push({
				key: 'contentType',
				match: {
					any: contentTypes,
				},
			});
		}

		Object.entries(customFilters).forEach(([key, value]) => {
			if (Array.isArray(value)) {
				conditions.push({
					key,
					match: { any: value },
				});
			} else {
				conditions.push({
					key,
					match: { value },
				});
			}
		});

		return conditions.length > 0 ? { must: conditions } : undefined;
	}

	/**
	 * @description Батч-обёртка над `vectorizeContent`.
	 * @param {ContentData[]} contentList - Список записей.
	 * @param {(progress: { current: number; total: number; result: VectorizeResult }) => void} [onProgress] - Коллбек прогресса.
	 * @returns {Promise<VectorizeResult[]>} Результаты по каждому элементу.
	 */
	async batchVectorize(
		contentList: ContentData[],
		onProgress?: (progress: {
			current: number;
			total: number;
			result: VectorizeResult;
		}) => void
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
						result,
					});
				}

				await new Promise(resolve => setTimeout(resolve, 200));
			} catch (error) {
				console.error(`[VectorService] Batch error for item ${i}:`, error);
				results.push({
					id: contentList[i].id,
					pointId: contentList[i].id,
					status: 'error',
					error: error.message,
				});
			}
		}

		return results;
	}

	/**
	 * @description Health-check в унифицированной форме для route `/vector_health`.
	 * @returns {Promise<SemanticHealthCheck>} Статус backend-а.
	 */
	async healthCheck(): Promise<SemanticHealthCheck> {
		try {
			await this.initialize();
			const stats = await this.getStats();
			return {
				status: 'healthy',
				backend: 'qdrant',
				qdrantUrl: this.config.qdrantUrl,
				collection: this.config.collectionName,
				embeddingModel: this.embeddingService.getModelInfo().model,
				embeddingBaseUrl: this.config.embeddingBaseUrl,
				stats,
			};
		} catch (error) {
			return {
				status: 'unhealthy',
				backend: 'qdrant',
				error: error.message,
				qdrantUrl: this.config.qdrantUrl,
				embeddingModel: this.embeddingService.getModelInfo().model,
				embeddingBaseUrl: this.config.embeddingBaseUrl,
			};
		}
	}
}

export default VectorService;
