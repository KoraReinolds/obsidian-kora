import type { Express, Request, Response } from 'express';
import type { IntegrationAccountsResponse } from '../../../../../packages/contracts/src/telegram.js';
import { getIntegrationRegistry } from '../services/integration-registry-singleton.js';

/**
 * @description Регистрирует read-only маршруты реестра интеграций.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerIntegrationRoutes(app: Express): void {
	app.get('/integrations/accounts', (req: Request, res: Response) => {
		try {
			const accounts = getIntegrationRegistry().listAccounts();
			const response: IntegrationAccountsResponse = {
				success: true,
				accounts,
			};
			res.json(response);
		} catch (error) {
			console.error('[integrations/accounts] Error:', error);
			res.status(500).json({
				success: false,
				accounts: [],
				error: (error as Error).message,
			} satisfies IntegrationAccountsResponse);
		}
	});

	app.post('/integrations/reload', (req: Request, res: Response) => {
		try {
			const accounts = getIntegrationRegistry().reload();
			const response: IntegrationAccountsResponse = {
				success: true,
				accounts,
			};
			res.json(response);
		} catch (error) {
			console.error('[integrations/reload] Error:', error);
			res.status(500).json({
				success: false,
				accounts: [],
				error: (error as Error).message,
			} satisfies IntegrationAccountsResponse);
		}
	});
}
