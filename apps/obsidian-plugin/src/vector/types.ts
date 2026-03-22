export interface VectorSettingsInterface {
	semanticBackend: 'sqlite';
	semanticDatabasePath: string;
	openaiApiKey: string;
	embeddingBaseUrl: string;
	embeddingModel: string;
	vectorDimensions: number;
	enableVectorization: boolean;
	/** Минимальный итоговый скор для `/search` и Related Chunks. */
	searchScoreThreshold: number;
	/** Вес лексического FTS5-скора при смешивании с косинусом. */
	lexicalBoostWeight: number;
}

/**
 * @description Параметры семантического поиска, передаваемые из настроек плагина.
 */
export interface VectorSearchRuntimeOptions {
	scoreThreshold: number;
	lexicalBoostWeight: number;
}

export type VectorSearchOptionsProvider = () => VectorSearchRuntimeOptions;

export const defaultVectorSettings: VectorSettingsInterface = {
	semanticBackend: 'sqlite',
	semanticDatabasePath: 'data/semantic-index.sqlite',
	openaiApiKey: '',
	embeddingBaseUrl: 'https://openrouter.ai/api/v1',
	embeddingModel: 'text-embedding-3-small',
	vectorDimensions: 1536,
	enableVectorization: false,
	searchScoreThreshold: 0.3,
	lexicalBoostWeight: 0.15,
};
