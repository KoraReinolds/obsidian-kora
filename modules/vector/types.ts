export interface VectorSettingsInterface {
	semanticBackend: 'qdrant' | 'sqlite';
	semanticDatabasePath: string;
	qdrantUrl: string;
	qdrantCollection: string;
	openaiApiKey: string;
	embeddingBaseUrl: string;
	embeddingModel: string;
	vectorDimensions: number;
	enableVectorization: boolean;
	/** Минимальный итоговый скор (вектор + FTS-буст на sqlite) для `/search` и Related Chunks. */
	searchScoreThreshold: number;
	/** Множитель лексического (FTS5) скора при смешивании с косинусом; только backend sqlite. */
	lexicalBoostWeight: number;
}

/**
 * @description Параметры семантического поиска, передаваемые в `/search` из настроек плагина.
 */
export interface VectorSearchRuntimeOptions {
	scoreThreshold: number;
	lexicalBoostWeight: number;
}

export type VectorSearchOptionsProvider = () => VectorSearchRuntimeOptions;

export const defaultVectorSettings: VectorSettingsInterface = {
	semanticBackend: 'qdrant',
	semanticDatabasePath: 'data/semantic-index.sqlite',
	qdrantUrl: 'http://localhost:6333',
	qdrantCollection: 'kora_content',
	openaiApiKey: '',
	embeddingBaseUrl: 'https://openrouter.ai/api/v1',
	embeddingModel: 'text-embedding-3-small',
	vectorDimensions: 1536,
	enableVectorization: false,
	searchScoreThreshold: 0.3,
	lexicalBoostWeight: 0.15,
};
