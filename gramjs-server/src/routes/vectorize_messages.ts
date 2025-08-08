/**
 * Route: /vectorize_messages
 * Vectorizes Telegram messages for a given peer and optional date range.
 */

import type { Express, Request, Response } from 'express';
import { initClient } from '../services/strategy-service.js';
import { getVectorService } from '../services/vector-service-singleton.js';

export function registerVectorizeMessagesRoute(app: Express): void {
  app.post('/vectorize_messages', async (req: Request, res: Response) => {
    try {
      const vectorService = getVectorService();
      if (!vectorService) return res.status(503).json({ error: 'Vector service not available' });

      const { peer, startDate, endDate, limit = 100 } = req.body || {};
      if (!peer) return res.status(400).json({ error: 'peer is required' });

      const strategy = await initClient();
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      const messages = await strategy.getMessages(peer, {
        limit: typeof limit === 'number' ? limit : Number(limit) || 1000,
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

      const contentList = filtered
        .filter(m => (m as any).message && String((m as any).message).trim().length > 0)
        .map(m => ({
          id: `telegram_${peer}_${m.id}`,
          contentType: 'telegram_post',
          content: (m as any).message,
          metadata: {
            telegram: {
              channelId: peer,
              messageId: m.id,
              author: (m as any).postAuthor || null,
              date: new Date(m.date * 1000).toISOString(),
              views: (m as any).views,
              forwards: (m as any).forwards,
              isComment: false,
            },
          },
        }));

      if (contentList.length === 0) {
        return res.json({ success: true, message: 'No messages with content found to vectorize', processed: 0, results: [] });
      }

      const results = await vectorService.batchVectorize(contentList, (progress) => {
        // eslint-disable-next-line no-console
        console.log(`[/vectorize_messages] Progress: ${progress.current}/${progress.total}`);
      });

      res.json({
        success: true,
        peer,
        processed: results.length,
        results,
        mode: strategy.getMode(),
        dateRange: { start: start?.toISOString() || null, end: end?.toISOString() || null },
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[/vectorize_messages] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
