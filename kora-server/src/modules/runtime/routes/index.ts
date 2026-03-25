import type { Express } from 'express';
import { registerPipelineRoutes } from './pipeline.js';
import { registerContentRoutes } from './content.js';
import { registerSearchRoute } from './search.js';
import { registerVectorHealthRoute } from './vector_health.js';
import { registerVectorStatsRoute } from './vector_stats.js';
import { registerVectorizeRoute } from './vectorize.js';
import { registerVectorizeMessagesRoute } from './vectorize_messages.js';

/**
 * @description Регистрирует HTTP-маршруты runtime-модуля.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerRuntimeRoutes(app: Express): void {
	registerPipelineRoutes(app);
	registerVectorizeRoute(app);
	registerVectorizeMessagesRoute(app);
	registerSearchRoute(app);
	registerContentRoutes(app);
	registerVectorStatsRoute(app);
	registerVectorHealthRoute(app);
}
