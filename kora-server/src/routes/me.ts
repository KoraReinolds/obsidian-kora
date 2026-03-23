/**
 * Route: /me
 * Returns the authenticated Telegram account info for the active strategy.
 */

import type { Express, Request, Response } from 'express';
import { initClient } from '../services/strategy-service.js';

export function registerMeRoutes(app: Express): void {
	app.get('/me', async (req: Request, res: Response) => {
		try {
			const strategy = await initClient();
			const me = await strategy.getMe();
			res.json({
				id: me.id,
				username: me.username,
				firstName: me.firstName,
				lastName: me.lastName,
				phone: me.phone,
				mode: strategy.getMode(),
				capabilities: (me as any).capabilities || null,
			});
		} catch (error: any) {
			// eslint-disable-next-line no-console
			console.error('[me] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
