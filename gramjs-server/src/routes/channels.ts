/**
 * Route: /channels
 * Lists dialogs/channels using the current strategy.
 */

import type { Express, Request, Response } from 'express';
import StrategyFactory from '../strategies/StrategyFactory.js';
import { initClient, getCurrentStrategy } from '../services/strategy-service.js';

export function registerChannelRoutes(app: Express): void {
  app.get('/channels', async (req: Request, res: Response) => {
    try {
      const strategy = await initClient();
      const { limit } = req.query as { limit?: string };

      const dialogs = await strategy.getDialogs({ limit: limit ? parseInt(limit, 10) : undefined });
      const channels = strategy.formatChannels(dialogs);

      res.json({
        success: true,
        channels,
        total: channels.length,
        mode: strategy.getMode(),
        strategyInfo: StrategyFactory.getStrategyInfo(strategy.getMode()),
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[channels] Error:', error);
      const strategy = getCurrentStrategy();
      const mode = strategy ? strategy.getMode() : 'unknown';

      if (mode === 'bot' && String(error.message || '').includes('dialog')) {
        return res.json({
          success: true,
          channels: [],
          total: 0,
          mode: 'bot',
          note: "Bot cannot access dialogs. This is normal for bots that haven't been added to any chats yet.",
          error: error.message,
        });
      }

      res.status(500).json({ error: error.message, mode });
    }
  });
}
