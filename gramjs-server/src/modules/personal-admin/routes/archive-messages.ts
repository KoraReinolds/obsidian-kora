/**
 * @module modules/personal-admin/routes/archive-messages
 * @description Возвращает страницу архивных сообщений из SQLite.
 */

import type { Express, Request, Response } from 'express';
import type { ArchiveMessagesResponse } from '../../../../../packages/contracts/src/telegram.js';
import { getArchiveRepository } from '../services/archive-service-singleton.js';

/**
 * @description Регистрирует маршрут `GET /archive/messages`.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerArchiveMessageRoutes(app: Express): void {
	app.get('/archive/messages', (req: Request, res: Response) => {
		try {
			const {
				chatId,
				limit = '100',
				offset = '0',
			} = req.query as {
				chatId?: string;
				limit?: string;
				offset?: string;
			};

			if (!chatId) {
				return res.status(400).json({ error: 'chatId is required' });
			}

			const parsedLimit = Number(limit) || 100;
			const parsedOffset = Number(offset) || 0;
			const safeLimit = Math.min(500, Math.max(1, parsedLimit));
			const safeOffset = Math.max(0, parsedOffset);
			const repository = getArchiveRepository();
			const messages = repository.listMessages(chatId, safeLimit, safeOffset);
			const fullRange = repository.getMessagesTimeRange(chatId);

			const response: ArchiveMessagesResponse = {
				success: true,
				chatId,
				messages,
				total: repository.countMessages(chatId),
				offset: safeOffset,
				limit: safeLimit,
				fullRange,
			};

			res.json(response);
		} catch (error: any) {
			console.error('[archive/messages] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
