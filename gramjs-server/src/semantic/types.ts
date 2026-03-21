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

export interface SearchOptions {
	limit?: number;
	contentTypes?: string[];
	filters?: Record<string, any>;
	scoreThreshold?: number;
}

export interface StoredContentRecord {
	qdrantId: string;
	payload: any;
}

export interface SearchResult {
	query: string;
	results: Array<{
		id: string;
		score: number;
		content: any;
		snippet: string;
	}>;
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
