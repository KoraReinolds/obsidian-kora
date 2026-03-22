/**
 * @module routes/archive-backfill
 * @description Ручная догрузка более старой истории чата через Telegram (`maxId`) в локальный SQLite-архив.
 */

import type { Express, Request, Response } from 'express';
import type {
	ArchiveBackfillRequest,
	ArchiveBackfillResponse,
} from '../../../packages/contracts/src/telegram.js';
import { getArchiveSyncService } from '../services/archive-service-singleton.js';

/**
 * @description Регистрирует маршрут `POST /archive/backfill`.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerArchiveBackfillRoutes(app: Express): void {
	app.post('/archive/backfill', async (req: Request, res: Response) => {
		try {
			const {
				chatId,
				peer,
				limit = 200,
			} = (req.body || {}) as ArchiveBackfillRequest;

			if (!chatId) {
				return res.status(400).json({ error: 'chatId is required' });
			}

			const result = await getArchiveSyncService().backfillOlder({
				chatId,
				peer,
				limit: typeof limit === 'number' ? limit : Number(limit) || 200,
			});

			const response: ArchiveBackfillResponse = {
				success: true,
				result,
			};

			res.json(response);
		} catch (error: any) {
			console.error('[archive/backfill] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
