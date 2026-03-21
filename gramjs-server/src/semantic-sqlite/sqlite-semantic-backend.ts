/**
 * @module semantic-sqlite/sqlite-semantic-backend
 * @description Полноценный semantic backend на SQLite. Хранит канонические payload-ы
 * и embeddings локально, а semantic search выполняет без внешней vector DB.
 */

import EmbeddingService from '../embedding-service.js';
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
		} = options;

		const queryEmbedding = await this.embeddingService.generateEmbedding(query);
		const vectorCandidates = this.repository
			.listVectorCandidates(contentTypes)
			.filter(candidate => this.matchesFilters(candidate.payload, filters));
		const lexicalMatches = this.repository
			.findLexicalMatches(query, Math.max(limit * 3, 25))
			.filter(match => {
				const contentType = String(match.payload?.contentType || '');
				if (contentTypes.length > 0 && !contentTypes.includes(contentType)) {
					return false;
				}
				return this.matchesFilters(match.payload, filters);
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
				const combinedScore = vectorScore + lexicalBoost * 0.15;

				return {
					id: candidate.qdrantId,
					score: combinedScore,
					content: candidate.payload,
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
}
