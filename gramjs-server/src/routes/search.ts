/**
 * Route: /search
 * Semantic search across vectorized content.
 */

import type { Express, Request, Response } from 'express';
import { getVectorService } from '../services/vector-service-singleton.js';

export function registerSearchRoute(app: Express): void {
	app.post('/search', async (req: Request, res: Response) => {
		try {
			const vectorService = getVectorService();
			if (!vectorService)
				return res.status(503).json({ error: 'Vector service not available' });

			const {
				query,
				limit = 10,
				contentTypes = [],
				filters = {},
				scoreThreshold = 0.0,
			} = req.body || {};
			if (!query || typeof query !== 'string') {
				return res
					.status(400)
					.json({ error: 'query is required and must be a string' });
			}

			const results = await vectorService.searchContent(query, {
				limit,
				contentTypes,
				filters,
				scoreThreshold,
			});

			res.json({ success: true, ...results });
		} catch (error: any) {
			// eslint-disable-next-line no-console
			console.error('[/search] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
