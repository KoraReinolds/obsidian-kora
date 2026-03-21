/**
 * @module semantic-sqlite/sqlite-semantic-backend
 * @description Полноценный semantic backend на SQLite. Хранит канонические payload-ы
 * и embeddings локально, а semantic search выполняет без внешней vector DB.
 */

import EmbeddingService from '../embedding-service.js';
import type {
	ContentData,
	SearchOptions,
	SearchExcludeOptions,
	SearchResult,
	SemanticBackend,
	SemanticBackendConfig,
	SemanticHealthCheck,
	SemanticStats,
	StoredContentRecord,
	VectorizeResult,
} from '../semantic/types.js';
import {
	buildSemanticPayload,
	cosineSimilarity,
	generateSnippet,
	getNestedValue,
} from '../semantic/utils.js';
import { SQLiteSemanticDatabase } from './sqlite-semantic-db.js';
import { SQLiteSemanticRepository } from './sqlite-semantic-repository.js';

export class SQLiteSemanticBackend implements SemanticBackend {
	private readonly config: Required<SemanticBackendConfig> & {
		[key: string]: unknown;
	};
	private readonly database: SQLiteSemanticDatabase;
	private readonly repository: SQLiteSemanticRepository;
	private readonly embeddingService: EmbeddingService;

	constructor(config: SemanticBackendConfig = {}) {
		this.config = {
			backend: 'sqlite',
			qdrantUrl: '',
			collectionName: 'semantic-index.sqlite',
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
			databasePath: config.databasePath || process.env.SEMANTIC_DB_PATH || '',
			...config,
		};

		this.database = new SQLiteSemanticDatabase({
			databasePath: this.config.databasePath || undefined,
		});
		this.repository = new SQLiteSemanticRepository(
			this.database.getConnection(),
			{
				databasePath: this.database.getDatabasePath(),
			}
		);
		this.embeddingService = new EmbeddingService({
			apiKey: this.config.openaiApiKey,
			baseUrl: this.config.embeddingBaseUrl,
			model: this.config.embeddingModel,
			dimensions: this.config.vectorSize,
		});
	}

	/**
	 * @description Индексирует одну запись в SQLite semantic index.
	 * @param {ContentData} contentData - Канонические данные записи.
	 * @returns {Promise<VectorizeResult>} Результат upsert-а.
	 */
	async vectorizeContent(contentData: ContentData): Promise<VectorizeResult> {
		const { id, contentType, title = '', content, metadata = {} } = contentData;
		if (!id || !contentType || !content) {
			throw new Error('id, contentType, and content are required');
		}

		const embeddingResult =
			await this.embeddingService.generateEmbedding(content);
		const contentHash = this.embeddingService.generateContentHash(content);
		const payload = buildSemanticPayload(
			{ id, contentType, title, content, metadata },
			contentHash,
			embeddingResult
		);
		const upsertResult = this.repository.upsertRecord({
			pointId: id,
			originalId: String(payload.originalId || id),
			contentType,
			title,
			content,
			contentHash,
			chunkId:
				typeof payload.chunkId === 'string' ? payload.chunkId : undefined,
			metadata,
			payload,
			embedding: embeddingResult.embedding,
			embeddingModel: embeddingResult.model,
			embeddingDimensions: embeddingResult.dimensions,
			vectorizedAt: String(payload.vectorizedAt),
		});

		return {
			id,
			pointId: id,
			qdrantId: upsertResult.qdrantId,
			status: upsertResult.status,
			embeddingInfo: embeddingResult,
			existing: upsertResult.existing,
		};
	}

	/**
	 * @description Батч-индексация через последовательные upsert-ы.
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
				onProgress?.({
					current: i + 1,
					total: contentList.length,
					result,
				});
			} catch (error) {
				results.push({
					id: contentList[i].id,
					pointId: contentList[i].id,
					status: 'error',
					error: (error as Error).message,
				});
			}
		}

		return results;
	}

	/**
	 * @description Semantic search по embeddings; лексический буст через FTS5.
	 * Если векторный топ пуст — только результаты FTS (не LIKE).
	 * @param {string} query - Поисковый запрос.
	 * @param {SearchOptions} [options={}] - Ограничения поиска.
	 * @returns {Promise<SearchResult>} Отранжированные результаты.
	 */
	async searchContent(
		query: string,
		options: SearchOptions = {}
	): Promise<SearchResult> {
		const {
			limit = 10,
			contentTypes = [],
			filters = {},
			scoreThreshold = 0.0,
			lexicalBoostWeight: rawLexicalWeight,
			exclude = {},
		} = options;

		const lexicalBoostWeight =
			typeof rawLexicalWeight === 'number' &&
			!Number.isNaN(rawLexicalWeight) &&
			rawLexicalWeight >= 0
				? rawLexicalWeight
				: 0.15;

		const queryEmbedding = await this.embeddingService.generateEmbedding(query);
		const vectorCandidates = this.repository
			.listVectorCandidates(contentTypes)
			.filter(candidate => this.matchesFilters(candidate.payload, filters))
			.filter(
				candidate =>
					!this.matchesExclude(candidate.payload, candidate.qdrantId, exclude)
			);
		const lexicalMatches = this.repository
			.findLexicalMatches(query, Math.max(limit * 6, 50))
			.filter(match => {
				const contentType = String(match.payload?.contentType || '');
				if (contentTypes.length > 0 && !contentTypes.includes(contentType)) {
					return false;
				}
				if (!this.matchesFilters(match.payload, filters)) {
					return false;
				}
				return !this.matchesExclude(match.payload, match.qdrantId, exclude);
			});

		const lexicalScoreById = new Map<string, number>();
		for (const match of lexicalMatches) {
			lexicalScoreById.set(match.qdrantId, match.lexicalScore);
		}

		const vectorResults = vectorCandidates
			.map(candidate => {
				const vectorScore = cosineSimilarity(
					queryEmbedding.embedding,
					candidate.embedding
				);
				const lexicalBoost = lexicalScoreById.get(candidate.qdrantId) || 0;
				const lexicalContribution = lexicalBoost * lexicalBoostWeight;
				const combinedScore = vectorScore + lexicalContribution;

				return {
					id: candidate.qdrantId,
					score: combinedScore,
					content: candidate.payload,
					scoreDetails: {
						mode: 'hybrid' as const,
						vectorScore,
						lexicalScore: lexicalBoost,
						lexicalContribution,
						lexicalBoostWeight,
						combinedScore,
					},
					snippet: generateSnippet(
						String(candidate.payload?.content || ''),
						query
					),
				};
			})
			.filter(result => result.score >= scoreThreshold)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);

		if (vectorResults.length > 0) {
			return {
				query,
				results: vectorResults,
				total: vectorResults.length,
				queryEmbeddingInfo: queryEmbedding,
			};
		}

		const fallbackResults = lexicalMatches.slice(0, limit).map(match => ({
			id: match.qdrantId,
			score: match.lexicalScore,
			content: match.payload,
			scoreDetails: {
				mode: 'lexical_fallback' as const,
				vectorScore: null,
				lexicalScore: match.lexicalScore,
				lexicalContribution: match.lexicalScore,
				lexicalBoostWeight: lexicalBoostWeight,
				combinedScore: match.lexicalScore,
			},
			snippet: generateSnippet(String(match.payload?.content || ''), query),
		}));

		return {
			query,
			results: fallbackResults,
			total: fallbackResults.length,
			queryEmbeddingInfo: queryEmbedding,
		};
	}

	/**
	 * @description Возвращает одну запись по ключу.
	 * @param {string} key - Ключ поиска.
	 * @param {string} value - Значение.
	 * @returns {Promise<StoredContentRecord | null>} Запись или null.
	 */
	async getContentBy(
		key: string,
		value: string
	): Promise<StoredContentRecord | null> {
		return this.repository.getContentBy(key, value);
	}

	/**
	 * @description Возвращает несколько записей по ключу.
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
		return this.repository.getContentsBy(key, value, limit);
	}

	/**
	 * @description Удаляет записи по point id или payload-ключу.
	 * @param {string} key - Ключ удаления.
	 * @param {string | string[]} value - Одно или несколько значений.
	 * @returns {Promise<{ deleted: number }>} Количество удалённых записей.
	 */
	async deleteBy(
		key: string,
		value: string | string[],
		_options?: { preCountLimit?: number }
	): Promise<{ deleted: number }> {
		return this.repository.deleteBy(key, value);
	}

	/**
	 * @description Возвращает статистику SQLite backend-а.
	 * @returns {Promise<SemanticStats>} Сводка по semantic index-у.
	 */
	async getStats(): Promise<SemanticStats> {
		return this.repository.getStats(this.config.vectorSize);
	}

	/**
	 * @description Health-check backend-а и SQLite-файла.
	 * @returns {Promise<SemanticHealthCheck>} Статус backend-а.
	 */
	async healthCheck(): Promise<SemanticHealthCheck> {
		try {
			const stats = await this.getStats();
			return {
				status: 'healthy',
				backend: 'sqlite',
				collection: this.database.getDatabasePath(),
				databasePath: this.database.getDatabasePath(),
				embeddingModel: this.embeddingService.getModelInfo().model,
				embeddingBaseUrl: String(this.config.embeddingBaseUrl),
				stats,
			};
		} catch (error) {
			return {
				status: 'unhealthy',
				backend: 'sqlite',
				databasePath: this.database.getDatabasePath(),
				embeddingModel: this.embeddingService.getModelInfo().model,
				embeddingBaseUrl: String(this.config.embeddingBaseUrl),
				error: (error as Error).message,
			};
		}
	}

	/**
	 * @description Закрывает SQLite connection при reset backend-а.
	 * @returns {void}
	 */
	close(): void {
		this.database.close();
	}

	private matchesFilters(
		payload: Record<string, any>,
		filters: Record<string, any>
	): boolean {
		return Object.entries(filters).every(([key, expected]) => {
			const actual = getNestedValue(payload, key);
			if (Array.isArray(expected)) {
				return expected.includes(actual);
			}
			return actual === expected;
		});
	}

	/**
	 * @anchor <search_exclude_filter>
	 *
	 * @description Проверяет, должен ли текущий payload быть исключён из поисковой
	 * выдачи по контексту активной заметки. Это переносит self-match фильтрацию с
	 * клиента на `sqlite` backend, чтобы исключения применялись до ранжирования и
	 * `limit`, а не уже после ответа `/search`.
	 * @param {Record<string, any>} payload - Канонический payload записи из semantic index.
	 * @param {string} pointId - Стабильный point id записи/чанка.
	 * @param {SearchExcludeOptions} exclude - Отрицательные фильтры текущего контекста.
	 * @returns {boolean} `true`, если запись нужно убрать из выдачи.
	 */
	private matchesExclude(
		payload: Record<string, any>,
		pointId: string,
		exclude: SearchExcludeOptions
	): boolean {
		if (!exclude || typeof exclude !== 'object') {
			return false;
		}

		const payloadChunkId = this.readPayloadChunkId(payload);
		if (exclude.chunkId && payloadChunkId === exclude.chunkId) {
			return true;
		}

		const payloadOriginalId = this.readPayloadOriginalId(payload);
		if (exclude.originalId) {
			if (payloadOriginalId === exclude.originalId) {
				return true;
			}
			if (pointId.startsWith(`${exclude.originalId}#`)) {
				return true;
			}
		}

		const payloadFilePath = this.readPayloadFilePath(payload);
		if (
			exclude.filePath &&
			payloadFilePath &&
			this.normalizePath(payloadFilePath) ===
				this.normalizePath(exclude.filePath)
		) {
			return true;
		}

		return false;
	}

	private readPayloadChunkId(payload: Record<string, any>): string {
		const chunkId =
			getNestedValue(payload, 'chunkId') ??
			getNestedValue(payload, 'meta.chunkId');
		return typeof chunkId === 'string' ? chunkId : '';
	}

	private readPayloadOriginalId(payload: Record<string, any>): string {
		const originalId =
			getNestedValue(payload, 'originalId') ??
			getNestedValue(payload, 'meta.originalId');
		return typeof originalId === 'string' ? originalId : '';
	}

	private readPayloadFilePath(payload: Record<string, any>): string {
		const filePath =
			getNestedValue(payload, 'obsidian.path') ??
			getNestedValue(payload, 'obsidian.filePath') ??
			getNestedValue(payload, 'meta.obsidian.path') ??
			getNestedValue(payload, 'meta.obsidian.filePath');
		return typeof filePath === 'string' ? filePath : '';
	}

	private normalizePath(filePath: string): string {
		return filePath.replace(/\\/g, '/');
	}
}
