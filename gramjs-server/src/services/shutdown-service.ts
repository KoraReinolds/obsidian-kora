/**
 * ShutdownService: Attaches process signal listeners to cleanup strategy.
 */

import { getCurrentStrategy, disconnectStrategy } from './strategy-service.js';

/**
 * JSDoc: Attach SIGINT handler for graceful shutdown.
 */
export function attachGracefulShutdown(): void {
	process.on('SIGINT', async () => {
		// eslint-disable-next-line no-console
		console.log('Shutting down GramJS server...');
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
		process.exit(0);
	});
}
