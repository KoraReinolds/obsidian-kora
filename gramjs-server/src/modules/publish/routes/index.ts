import type { Express } from 'express';
import { registerEditMessageRoute } from './edit-message.js';
import { registerSendFileRoute } from './send-file.js';
import { registerSendMessageRoute } from './send-message.js';

/**
 * @description Регистрирует HTTP-маршруты publish-модуля.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerPublishRoutes(app: Express): void {
	registerSendMessageRoute(app);
	registerEditMessageRoute(app);
	registerSendFileRoute(app);
}
