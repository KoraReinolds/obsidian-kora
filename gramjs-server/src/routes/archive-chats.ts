/**
 * @module routes/archive-chats
 * @description Возвращает список архивных чатов из SQLite для UI Obsidian.
 */

import type { Express, Request, Response } from 'express';
import type { ArchiveChatsResponse } from '../../../packages/contracts/src/telegram.js';
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

	app.delete('/archive/chat/:chatId', (req: Request, res: Response) => {
		try {
			const raw = req.params.chatId;
			const chatId = raw ? decodeURIComponent(raw).trim() : '';
			if (!chatId) {
				res.status(400).json({
					success: false,
					error: 'chatId is required',
				});
				return;
			}

			const { deleted } = getArchiveRepository().deleteChat(chatId);
			res.json({
				success: true,
				deleted,
				chatId,
			});
		} catch (error: any) {
			console.error('[archive/chat DELETE] Error:', error);
			res.status(500).json({ success: false, error: error.message });
		}
	});
}
