/**
 * Route: /messages
 * Fetches messages for a given peer with optional date filters.
 */

import type { Express, Request, Response } from 'express';
import { initClient } from '../services/strategy-service.js';
import { formatTelegramMessage } from '../utils/format.js';

/**
 * JSDoc: Registers GET /messages endpoint.
 */
export function registerMessageRoutes(app: Express): void {
  app.get('/messages', async (req: Request, res: Response) => {
    try {
      const { peer, startDate, endDate, limit = '100' } = req.query as Record<string, string>;
      if (!peer) return res.status(400).json({ error: 'peer is required' });

      const strategy = await initClient();
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      const messages = await strategy.getMessages(peer, {
        limit: parseInt(String(limit), 10),
        offsetDate: end || undefined,
        minId: 0,
        maxId: 0,
      });

      const filtered = start || end
        ? messages.filter(m => {
            const msgDate = new Date(m.date * 1000);
            if (start && msgDate < start) return false;
            if (end && msgDate > end) return false;
            return true;
          })
        : messages;

      const formatted = filtered.map(formatTelegramMessage);

      res.json({
        success: true,
        messages: formatted,
        total: formatted.length,
        peer,
        mode: strategy.getMode(),
        dateRange: { start: start?.toISOString() || null, end: end?.toISOString() || null },
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[messages] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
