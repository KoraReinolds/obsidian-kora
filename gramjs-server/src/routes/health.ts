/**
 * Route: /health
 * Returns server/strategy health and configuration mode.
 */

import type { Express, Request, Response } from 'express';
import StrategyFactory from '../strategies/StrategyFactory.js';
import { getConfig } from '../services/config-service.js';
import { getCurrentStrategy } from '../services/strategy-service.js';

export function registerHealthRoutes(app: Express): void {
	app.get('/health', (req: Request, res: Response) => {
		const cfg = getConfig();
		const strategy = getCurrentStrategy();
		res.json({
			status: 'ok',
			connected: strategy ? strategy.isClientConnected() : false,
			mode: strategy ? strategy.getMode() : null,
			configuredMode: cfg.mode,
			strategyInfo: strategy
				? StrategyFactory.getStrategyInfo(strategy.getMode())
				: null,
			timestamp: new Date().toISOString(),
		});
	});
}
