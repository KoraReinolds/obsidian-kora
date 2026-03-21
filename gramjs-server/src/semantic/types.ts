import type { EmbeddingResult } from '../embedding-service.js';

export type SemanticBackendType = 'qdrant' | 'sqlite';

export interface SemanticBackendConfig {
	backend?: SemanticBackendType;
	qdrantUrl?: string;
	collectionName?: string;
	vectorSize?: number;
	openaiApiKey?: string;
	embeddingModel?: string;
	embeddingBaseUrl?: string;
	databasePath?: string;
	[key: string]: unknown;
}

export interface ContentData {
	id: string;
	contentType: string;
	title?: string;
	content: string;
	metadata?: Record<string, any>;
}

/**
 * @description Отрицательные фильтры для search pipeline. Нужны, когда UI знает
 * текущий контекст (например, активную заметку) и хочет исключить его ещё на
 * сервере до ранжирования и применения `limit`.
 */
export interface SearchExcludeOptions {
	/** Точный `chunkId`, который нужно убрать из выдачи. */
	chunkId?: string;
	/** `originalId` всей заметки/документа, который нужно исключить целиком. */
	originalId?: string;
	/** Путь файла заметки, который нужно исключить из выдачи. */
	filePath?: string;
}

export interface SearchOptions {
	limit?: number;
	contentTypes?: string[];
	filters?: Record<string, any>;
	scoreThreshold?: number;
	/** Вес лексического (FTS5) скора при смешивании с косинусом; только `sqlite` backend. */
	lexicalBoostWeight?: number;
	/** Исключения по текущему контексту; сейчас используются в `sqlite` backend. */
	exclude?: SearchExcludeOptions;
}

export interface StoredContentRecord {
	qdrantId: string;
	payload: any;
}

/**
 * @description Детализация итогового search score. Нужна UI, чтобы показывать не
 * только merged значение, но и вклад semantic/lexical частей ранжирования.
 */
export interface SearchScoreDetails {
	/** Режим ранжирования результата: hybrid, vector-only или lexical fallback. */
	mode: 'hybrid' | 'vector' | 'lexical_fallback';
	/** Косинусный semantic score; для lexical fallback может быть `null`. */
	vectorScore: number | null;
	/** Сырой lexical score из FTS; для vector-only может быть `null`. */
	lexicalScore: number | null;
	/** Вклад lexical части в merged score после умножения на weight. */
	lexicalContribution: number | null;
	/** Вес lexical буста, использованный при merge. */
	lexicalBoostWeight: number | null;
	/** Итоговый score, по которому результат сортировался и фильтровался. */
	combinedScore: number;
}

/**
 * @description Одна строка результата semantic search с payload и подробностями score.
 */
export interface SearchResultItem {
	id: string;
	score: number;
	content: any;
	snippet: string;
	scoreDetails?: SearchScoreDetails;
}

export interface SearchResult {
	query: string;
	results: SearchResultItem[];
	total: number;
	queryEmbeddingInfo: EmbeddingResult;
}

export interface VectorizeResult {
	id: string;
	pointId?: string;
	qdrantId?: string;
	status: 'created' | 'updated' | 'unchanged' | 'error';
	embeddingInfo?: EmbeddingResult;
	existing?: boolean;
	error?: string;
}

export interface SemanticStats {
	backend: SemanticBackendType;
	collection: string;
	totalPoints: number;
	vectorSize: number;
	contentTypeBreakdown: Record<string, number>;
	status: string;
	qdrantUrl?: string;
	databasePath?: string;
}

export interface SemanticHealthCheck {
	status: 'healthy' | 'unhealthy';
	backend: SemanticBackendType;
	collection?: string;
	stats?: SemanticStats;
	error?: string;
	qdrantUrl?: string;
	databasePath?: string;
	embeddingModel?: string;
	embeddingBaseUrl?: string;
}

export interface SemanticBackend {
	vectorizeContent(contentData: ContentData): Promise<VectorizeResult>;
	batchVectorize(
		contentList: ContentData[],
		onProgress?: (progress: {
			current: number;
			total: number;
			result: VectorizeResult;
		}) => void
	): Promise<VectorizeResult[]>;
	searchContent(query: string, options?: SearchOptions): Promise<SearchResult>;
	getContentBy(key: string, value: string): Promise<StoredContentRecord | null>;
	getContentsBy(
		key: string,
		value: string,
		limit?: number
	): Promise<StoredContentRecord[]>;
	deleteBy(
		key: string,
		value: string | string[],
		options?: { preCountLimit?: number }
	): Promise<{ deleted: number }>;
	getStats(): Promise<SemanticStats>;
	healthCheck(): Promise<SemanticHealthCheck>;
	close?(): void;
}
