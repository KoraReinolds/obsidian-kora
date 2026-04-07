/**
 * ShutdownService: Attaches process signal listeners to cleanup strategy.
 */

import { getCurrentStrategy, disconnectStrategy } from './strategy-service.js';
import { getTelegramClientManager } from './telegram-client-manager.js';

/**
 * JSDoc: Attach SIGINT handler for graceful shutdown.
 */
export function attachGracefulShutdown(): void {
	process.on('SIGINT', async () => {
		// eslint-disable-next-line no-console
		console.log('Shutting down Kora server...');
		const strategy = getCurrentStrategy();
		if (strategy) {
			try {
				await disconnectStrategy();
				// eslint-disable-next-line no-console
				console.log('Strategy disconnected successfully');
			} catch (e: any) {
				// eslint-disable-next-line no-console
				console.warn('Error disconnecting strategy:', e?.message ?? e);
			}
		}

		try {
			await getTelegramClientManager().disconnectAll();
		} catch (error: any) {
			// eslint-disable-next-line no-console
			console.warn(
				'Error disconnecting managed Telegram clients:',
				error?.message ?? error
			);
		}
		process.exit(0);
	});
}
