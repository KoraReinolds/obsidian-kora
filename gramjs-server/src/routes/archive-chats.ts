/**
 * @module routes/archive-chats
 * @description Возвращает список архивных чатов из SQLite для UI Obsidian.
 */

import type { Express, Request, Response } from 'express';
import type { ArchiveChatsResponse } from '../../../telegram-types.js';
import { getArchiveRepository } from '../services/archive-service-singleton.js';

/**
 * @description Регистрирует маршрут `GET /archive/chats`.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerArchiveChatRoutes(app: Express): void {
	app.get('/archive/chats', (req: Request, res: Response) => {
		try {
			const { limit = '100' } = req.query as { limit?: string };
			const parsedLimit = Number(limit) || 100;
			const chats = getArchiveRepository().listChats(parsedLimit);

			const response: ArchiveChatsResponse = {
				success: true,
				chats,
				total: chats.length,
			};

			res.json(response);
		} catch (error: any) {
			console.error('[archive/chats] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
