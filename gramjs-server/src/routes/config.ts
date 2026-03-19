/**
 * Route: /config
 * Updates runtime configuration and resets strategy when mode changes.
 */

import type { Express, Request, Response } from 'express';
import {
	getConfig,
	updateConfig,
	getConfigValidation,
} from '../services/config-service.js';
import StrategyFactory from '../strategies/StrategyFactory.js';
import { disconnectStrategy } from '../services/strategy-service.js';
import { resetArchiveServices } from '../services/archive-service-singleton.js';

export function registerConfigRoutes(app: Express): void {
	app.post('/config', async (req: Request, res: Response) => {
		try {
			const previousConfig = getConfig();
			const prevMode = previousConfig.mode;
			const prevArchiveDatabasePath = previousConfig.archiveDatabasePath;
			const {
				mode,
				botToken,
				apiId,
				apiHash,
				stringSession,
				archiveDatabasePath,
			} = req.body || {};

			const parsed = updateConfig({
				mode: mode ?? prevMode,
				botToken,
				apiId:
					typeof apiId === 'number' ? apiId : apiId ? Number(apiId) : undefined,
				apiHash,
				stringSession,
				archiveDatabasePath,
			});

			if (prevMode !== parsed.mode) {
				await disconnectStrategy();
			}

			if (prevArchiveDatabasePath !== parsed.archiveDatabasePath) {
				resetArchiveServices();
			}

			const validation = getConfigValidation(parsed.mode);

			res.json({
				success: true,
				message: 'Configuration updated',
				currentConfig: {
					mode: parsed.mode,
					hasApiId: !!parsed.apiId,
					hasApiHash: !!parsed.apiHash,
					hasBotToken: !!parsed.botToken,
					hasStringSession: !!parsed.stringSession,
					archiveDatabasePath: parsed.archiveDatabasePath || null,
				},
				validation,
				strategyInfo: StrategyFactory.getStrategyInfo(parsed.mode),
			});
		} catch (error: any) {
			// eslint-disable-next-line no-console
			console.error('[config] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
