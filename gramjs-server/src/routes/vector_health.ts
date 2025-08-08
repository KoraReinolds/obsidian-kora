/**
 * Route: /vector_health
 * Health check for vector service.
 */

import type { Express, Request, Response } from 'express';
import { getVectorService } from '../services/vector-service-singleton.js';

export function registerVectorHealthRoute(app: Express): void {
  app.get('/vector_health', async (req: Request, res: Response) => {
    try {
      const vectorService = getVectorService();
      if (!vectorService) {
        return res.status(503).json({ status: 'unavailable', error: 'Vector service not initialized' });
      }

      const health = await vectorService.healthCheck();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[/vector_health] Error:', error);
      res.status(503).json({ status: 'error', error: error.message });
    }
  });
}
