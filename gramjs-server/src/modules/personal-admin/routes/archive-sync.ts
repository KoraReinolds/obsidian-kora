/**
 * @module modules/personal-admin/routes/archive-sync
 * @description Синхронизирует историю Telegram в локальный SQLite-архив.
 */

import type { Express, Request, Response } from 'express';
import type {
	ArchiveSyncRequest,
	ArchiveSyncResponse,
} from '../../../../../packages/contracts/src/telegram.js';
import { getArchiveSyncService } from '../services/archive-service-singleton.js';

/**
 * @description Регистрирует маршрут `POST /archive/sync`.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerArchiveSyncRoutes(app: Express): void {
	app.post('/archive/sync', async (req: Request, res: Response) => {
		try {
			const {
				peer,
				limit = 200,
				forceFull = false,
			} = (req.body || {}) as ArchiveSyncRequest;

			if (!peer) {
				return res.status(400).json({ error: 'peer is required' });
			}

			const result = await getArchiveSyncService().syncPeer({
				peer,
				limit: typeof limit === 'number' ? limit : Number(limit) || 200,
				forceFull: Boolean(forceFull),
			});

			const response: ArchiveSyncResponse = {
				success: true,
				result,
			};

			res.json(response);
		} catch (error: any) {
			console.error('[archive/sync] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
