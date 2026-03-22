/**
 * @module services/semantic-service-singleton
 * @description Нейтральная точка входа для semantic backend-а. Пока routes ещё
 * импортируют `vector-service-singleton`, но новый модуль уже даёт стабильное имя
 * для постепенного перехода на нейтральную semantic-терминологию.
 */

export {
	getVectorService as getSemanticBackend,
	resetVectorServices as resetSemanticBackends,
} from './vector-service-singleton.js';
