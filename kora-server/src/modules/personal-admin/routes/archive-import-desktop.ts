/**
 * @module modules/personal-admin/routes/archive-import-desktop
 * @description Импортирует Telegram Desktop export в локальный архив SQLite.
 */

import type { Express, Request, Response } from 'express';
import type {
	ArchiveDesktopImportRequest,
	ArchiveDesktopImportResponse,
} from '../../../../../packages/contracts/src/telegram.js';
import { getArchiveDesktopImportService } from '../services/archive-service-singleton.js';

/**
 * @description Регистрирует маршрут `POST /archive/import-desktop`.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerArchiveImportDesktopRoutes(app: Express): void {
	app.post('/archive/import-desktop', (req: Request, res: Response) => {
		try {
			const body = (req.body || {}) as ArchiveDesktopImportRequest;
			const folderPath = body.folderPath?.trim();
			const folderLabel = body.folderLabel?.trim() || 'telegram-desktop-export';
			const exportData =
				body.exportData && typeof body.exportData === 'object'
					? body.exportData
					: null;

			if (!folderPath && !exportData) {
				const response: ArchiveDesktopImportResponse = {
					success: false,
					error: 'folderPath or exportData is required',
				};
				res.status(400).json(response);
				return;
			}

			const service = getArchiveDesktopImportService();
			const result = exportData
				? service.importParsedExport(exportData, folderLabel)
				: service.importFolder(folderPath as string);
			const response: ArchiveDesktopImportResponse = {
				success: true,
				result,
			};
			res.json(response);
		} catch (error: any) {
			console.error('[archive/import-desktop] Error:', error);
			const response: ArchiveDesktopImportResponse = {
				success: false,
				error: error.message,
			};
			res.status(500).json(response);
		}
	});
}
