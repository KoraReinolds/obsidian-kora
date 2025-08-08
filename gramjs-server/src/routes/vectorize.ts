/**
 * Route: /vectorize
 * Universal vectorization endpoint for external content.
 */

import type { Express, Request, Response } from 'express';
import { getVectorService } from '../services/vector-service-singleton.js';

export function registerVectorizeRoute(app: Express): void {
  app.post('/vectorize', async (req: Request, res: Response) => {
    try {
      const vectorService = getVectorService();
      if (!vectorService) return res.status(503).json({ error: 'Vector service not available' });

      const { id, contentType, title, content, metadata } = req.body;
      if (!id || !contentType || !content) {
        return res.status(400).json({ error: 'id, contentType, and content are required' });
      }

      const result = await vectorService.vectorizeContent({ id, contentType, title, content, metadata });
      res.json({ success: true, ...result });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[/vectorize] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
