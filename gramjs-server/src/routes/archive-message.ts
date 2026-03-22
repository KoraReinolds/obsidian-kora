/**
 * @module routes/archive-message
 * @description Возвращает одно архивное сообщение по стабильному первичному ключу.
 */

import type { Express, Request, Response } from 'express';
import type { ArchiveMessageResponse } from '../../../packages/contracts/src/telegram.js';
import { getArchiveRepository } from '../services/archive-service-singleton.js';

/**
 * @description Регистрирует маршрут `GET /archive/message/:id`.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerArchiveSingleMessageRoutes(app: Express): void {
	app.get('/archive/message/:id', (req: Request, res: Response) => {
		try {
			const message = getArchiveRepository().getMessage(req.params.id);

			if (!message) {
				return res.status(404).json({ error: 'Archived message not found' });
			}

			const response: ArchiveMessageResponse = {
				success: true,
				message,
			};

			res.json(response);
		} catch (error: any) {
			console.error('[archive/message] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
