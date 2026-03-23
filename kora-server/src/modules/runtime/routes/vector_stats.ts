/**
 * Route: /vector_stats
 * Returns stats from the vector service.
 */

import type { Express, Request, Response } from 'express';
import { getVectorService } from '../services/vector-service-singleton.js';

export function registerVectorStatsRoute(app: Express): void {
	app.get('/vector_stats', async (req: Request, res: Response) => {
		try {
			const vectorService = getVectorService();
			if (!vectorService)
				return res.status(503).json({ error: 'Vector service not available' });
			const stats = await vectorService.getStats();
			res.json({ success: true, ...stats });
		} catch (error: any) {
			// eslint-disable-next-line no-console
			console.error('[/vector_stats] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
