/**
 * @module routes/archive-sync-state
 * @description Отдаёт курсоры синхронизации архива и статус последнего запуска.
 */

import type { Express, Request, Response } from 'express';
import type { ArchiveSyncStateResponse } from '../../../telegram-types.js';
import { getArchiveRepository } from '../services/archive-service-singleton.js';

/**
 * @description Регистрирует маршрут `GET /archive/sync_state`.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerArchiveSyncStateRoutes(app: Express): void {
	app.get('/archive/sync_state', (req: Request, res: Response) => {
		try {
			const { chatId } = req.query as { chatId?: string };
			const syncState = getArchiveRepository().getSyncState(chatId);

			const response: ArchiveSyncStateResponse = chatId
				? {
						success: true,
						state: (syncState as ArchiveSyncStateResponse['state']) || null,
					}
				: {
						success: true,
						states: (syncState as ArchiveSyncStateResponse['states']) || [],
					};

			res.json(response);
		} catch (error: any) {
			console.error('[archive/sync_state] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
