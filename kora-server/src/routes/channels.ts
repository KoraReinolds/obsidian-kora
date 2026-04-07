/**
 * Route: /channels
 * Lists dialogs/channels using the current strategy.
 */

import type { Express, Request, Response } from 'express';
import StrategyFactory from '../strategies/StrategyFactory.js';
import { getCurrentStrategy } from '../services/strategy-service.js';
import {
	normalizeIntegrationId,
	resolveTelegramStrategy,
} from '../services/telegram-strategy-resolver.js';
import type { ChannelsResponse } from '../../../packages/contracts/src/telegram.js';
import type { TelegramClientStrategy } from '../strategies/TelegramClientStrategy.js';

export function registerChannelRoutes(app: Express): void {
	app.get('/channels', async (req: Request, res: Response) => {
		let strategy: TelegramClientStrategy | null = null;
		try {
			const integrationId = normalizeIntegrationId(req.query?.integrationId);
			const { limit } = req.query as { limit?: string };
			strategy = await resolveTelegramStrategy(integrationId);

			const dialogs = await strategy.getDialogs({
				limit: limit ? parseInt(limit, 10) : undefined,
			});
			const channels = strategy.formatChannels(dialogs);

			const response: ChannelsResponse = {
				success: true,
				channels,
				total: channels.length,
				mode: strategy.getMode(),
				strategyInfo: StrategyFactory.getStrategyInfo(
					strategy.getMode()
				) as unknown as {
					[key: string]: unknown;
				},
			};

			res.json(response);
		} catch (error: any) {
			// eslint-disable-next-line no-console
			console.error('[channels] Error:', error);
			const legacyStrategy = getCurrentStrategy();
			const effectiveStrategy = strategy || legacyStrategy;
			const mode = effectiveStrategy ? effectiveStrategy.getMode() : 'unknown';

			if (mode === 'bot' && String(error.message || '').includes('dialog')) {
				const botResponse: ChannelsResponse = {
					success: true,
					channels: [],
					total: 0,
					mode: 'bot',
					note: "Bot cannot access dialogs. This is normal for bots that haven't been added to any chats yet.",
					error: error.message,
				};
				return res.json(botResponse);
			}

			res.status(500).json({ error: error.message, mode });
		}
	});
}
