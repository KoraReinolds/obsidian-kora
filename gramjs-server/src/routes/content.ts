/**
 * Routes: /content/:id
 * Get and Delete vectorized content by id.
 */

import type { Express, Request, Response } from 'express';
import { getVectorService } from '../services/vector-service-singleton.js';

export function registerContentRoutes(app: Express): void {
  app.get('/content/:id', async (req: Request, res: Response) => {
    try {
      const vectorService = getVectorService();
      if (!vectorService) return res.status(503).json({ error: 'Vector service not available' });

      const { id } = req.params;
      const content: { qdrantId: string; payload: any } | null = await vectorService.getContentByOriginalId(id);
      if (!content) return res.status(404).json({ error: 'Content not found' });
      res.json({ success: true, content });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(`[GET /content/:id] Error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/content/:id', async (req: Request, res: Response) => {
    try {
      const vectorService = getVectorService();
      if (!vectorService) return res.status(503).json({ error: 'Vector service not available' });

      const { id } = req.params;
      const result = await vectorService.deleteContent(id);
      res.json({ success: true, ...result });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(`[DELETE /content/:id] Error:`, error);
      res.status(500).json({ error: error.message });
    }
  });
}
