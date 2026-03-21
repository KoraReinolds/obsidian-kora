/**
 * Vector module - vector search and embedding utilities
 */

export { VectorBridge } from './vector-bridge';
export type {
	SearchResult,
	VectorHealthResponse,
	VectorStoredContentRecord,
} from './vector-bridge';
export { VectorSettingTab } from './settings-tab';
export type {
	VectorSearchOptionsProvider,
	VectorSearchRuntimeOptions,
	VectorSettingsInterface,
} from './types';
export { defaultVectorSettings } from './types';
