/**
 * @module services/semantic-service-singleton
 * @description Нейтральная точка входа для semantic backend-а. Пока routes ещё
 * импортируют `vector-service-singleton`, но новый модуль уже даёт стабильное имя
 * для последующего удаления Qdrant-specific terminology.
 */

export {
	getVectorService as getSemanticBackend,
	resetVectorServices as resetSemanticBackends,
} from './vector-service-singleton.js';
