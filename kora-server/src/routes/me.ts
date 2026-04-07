/**
 * Route: /me
 * Returns the authenticated Telegram account info for the active strategy.
 */

import type { Express, Request, Response } from 'express';
import {
	normalizeIntegrationId,
	resolveTelegramStrategy,
} from '../services/telegram-strategy-resolver.js';

export function registerMeRoutes(app: Express): void {
	app.get('/me', async (req: Request, res: Response) => {
		try {
			const integrationId = normalizeIntegrationId(req.query?.integrationId);
			const strategy = await resolveTelegramStrategy(integrationId);
			const me = await strategy.getMe();
			res.json({
				id: me.id,
				username: me.username,
				firstName: me.firstName,
				lastName: me.lastName,
				phone: me.phone,
				mode: strategy.getMode(),
				integrationId: integrationId || null,
				capabilities: (me as any).capabilities || null,
			});
		} catch (error: any) {
			// eslint-disable-next-line no-console
			console.error('[me] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
