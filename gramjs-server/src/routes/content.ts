/**
 * Routes: /content/:id
 * Get and Delete vectorized content by id.
 */

import type { Express, Request, Response } from 'express';
import { getVectorService } from '../services/vector-service-singleton.js';

export function registerContentRoutes(app: Express): void {
  // Unified content getter via query (single or multiple)
  app.get('/content', async (req: Request, res: Response) => {
    try {
      const vectorService = getVectorService();
      if (!vectorService) return res.status(503).json({ error: 'Vector service not available' });

      const by = (req.query.by as string) || 'originalId';
      const value = (req.query.value as string) || '';
      const multiple = String(req.query.multiple || 'false') === 'true';
      const limit = parseInt((req.query.limit as string) || '2048', 10);
      if (!value) return res.status(400).json({ error: 'Missing value parameter' });

      if (multiple) {
        const contents = await vectorService.getContentsBy(by, value, limit);
        res.json({ success: true, contents });
      } else {
        const content = await vectorService.getContentBy(by, value);
        if (!content) return res.status(404).json({ error: 'Content not found' });
        res.json({ success: true, content });
      }
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(`[GET /content] Error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Universal delete-by filter: /content?by=originalId&value=...
  app.delete('/content', async (req: Request, res: Response) => {
    try {
      const vectorService = getVectorService();
      if (!vectorService) return res.status(503).json({ error: 'Vector service not available' });

      const by = (req.query.by as string) || 'originalId';
      const value = (req.query.value as string) || '';
      if (!value) return res.status(400).json({ error: 'Missing value parameter' });

      const result = await vectorService.deleteBy(by, value);
      res.json({ success: true, ...result });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(`[DELETE /content] Error:`, error);
      res.status(500).json({ error: error.message });
    }
  });
}
