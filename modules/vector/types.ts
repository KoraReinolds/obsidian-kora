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
}

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
};
