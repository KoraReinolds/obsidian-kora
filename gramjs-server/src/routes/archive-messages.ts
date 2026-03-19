/**
 * @module routes/archive-messages
 * @description Возвращает страницу архивных сообщений из SQLite.
 */

import type { Express, Request, Response } from 'express';
import type { ArchiveMessagesResponse } from '../../../telegram-types.js';
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
			const repository = getArchiveRepository();
			const messages = repository.listMessages(
				chatId,
				parsedLimit,
				parsedOffset
			);

			const response: ArchiveMessagesResponse = {
				success: true,
				chatId,
				messages,
				total: repository.countMessages(chatId),
				offset: parsedOffset,
				limit: parsedLimit,
			};

			res.json(response);
		} catch (error: any) {
			console.error('[archive/messages] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
