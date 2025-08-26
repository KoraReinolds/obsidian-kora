export interface VectorSettingsInterface {
	qdrantUrl: string;
	qdrantCollection: string;
	openaiApiKey: string;
	embeddingModel: string;
	vectorDimensions: number;
	enableVectorization: boolean;
}

export const defaultVectorSettings: VectorSettingsInterface = {
	qdrantUrl: 'http://localhost:6333',
	qdrantCollection: 'kora_content',
	openaiApiKey: '',
	embeddingModel: 'text-embedding-3-small',
	vectorDimensions: 1536,
	enableVectorization: false,
};
