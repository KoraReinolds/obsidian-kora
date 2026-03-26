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
import { resetVectorServices } from '../services/vector-service-singleton.js';
import { resetEternalAiServices } from '../modules/eternal-ai/services/eternal-ai-service-singleton.js';

export function registerConfigRoutes(app: Express): void {
	app.post('/config', async (req: Request, res: Response) => {
		try {
			const previousConfig = getConfig();
			const prevMode = previousConfig.mode;
			const prevArchiveDatabasePath = previousConfig.archiveDatabasePath;
			const prevSemanticDatabasePath = previousConfig.semanticDatabasePath;
			const prevEternalAiDatabasePath = previousConfig.eternalAiDatabasePath;
			const {
				mode,
				botToken,
				apiId,
				apiHash,
				stringSession,
				archiveDatabasePath,
				semanticDatabasePath,
				openaiApiKey,
				embeddingModel,
				embeddingBaseUrl,
				eternalAiApiKey,
				eternalAiBaseUrl,
				eternalAiModel,
				eternalAiDatabasePath,
			} = req.body || {};

			const parsed = updateConfig({
				mode: mode ?? prevMode,
				botToken: botToken ?? previousConfig.botToken,
				apiId:
					typeof apiId === 'number'
						? apiId
						: apiId
							? Number(apiId)
							: previousConfig.apiId,
				apiHash: apiHash ?? previousConfig.apiHash,
				stringSession: stringSession ?? previousConfig.stringSession,
				archiveDatabasePath:
					archiveDatabasePath ?? previousConfig.archiveDatabasePath,
				semanticBackend: 'sqlite',
				semanticDatabasePath:
					semanticDatabasePath ?? previousConfig.semanticDatabasePath,
				openaiApiKey: openaiApiKey ?? previousConfig.openaiApiKey,
				embeddingModel: embeddingModel ?? previousConfig.embeddingModel,
				embeddingBaseUrl: embeddingBaseUrl ?? previousConfig.embeddingBaseUrl,
				eternalAiApiKey: eternalAiApiKey ?? previousConfig.eternalAiApiKey,
				eternalAiBaseUrl: eternalAiBaseUrl ?? previousConfig.eternalAiBaseUrl,
				eternalAiModel: eternalAiModel ?? previousConfig.eternalAiModel,
				eternalAiDatabasePath:
					eternalAiDatabasePath ?? previousConfig.eternalAiDatabasePath,
			});

			if (prevMode !== parsed.mode) {
				await disconnectStrategy();
			}

			if (prevArchiveDatabasePath !== parsed.archiveDatabasePath) {
				resetArchiveServices();
			}

			if (
				prevSemanticDatabasePath !== parsed.semanticDatabasePath ||
				previousConfig.openaiApiKey !== parsed.openaiApiKey ||
				previousConfig.embeddingModel !== parsed.embeddingModel ||
				previousConfig.embeddingBaseUrl !== parsed.embeddingBaseUrl
			) {
				resetVectorServices();
			}

			if (
				prevEternalAiDatabasePath !== parsed.eternalAiDatabasePath ||
				previousConfig.eternalAiApiKey !== parsed.eternalAiApiKey ||
				previousConfig.eternalAiBaseUrl !== parsed.eternalAiBaseUrl ||
				previousConfig.eternalAiModel !== parsed.eternalAiModel
			) {
				resetEternalAiServices();
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
					semanticBackend: parsed.semanticBackend,
					semanticDatabasePath: parsed.semanticDatabasePath || null,
					embeddingModel: parsed.embeddingModel || null,
					embeddingBaseUrl: parsed.embeddingBaseUrl || null,
					eternalAiBaseUrl: parsed.eternalAiBaseUrl || null,
					eternalAiModel: parsed.eternalAiModel || null,
					eternalAiDatabasePath: parsed.eternalAiDatabasePath || null,
					hasEternalAiApiKey: !!parsed.eternalAiApiKey,
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
