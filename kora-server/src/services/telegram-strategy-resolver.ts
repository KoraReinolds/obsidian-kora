/**
 * @module services/telegram-strategy-resolver
 * @description Выбирает legacy strategy или integration-aware client manager в
 * зависимости от наличия integrationId в запросе.
 */

import type { TelegramClientStrategy } from '../strategies/TelegramClientStrategy.js';
import { initClient } from './strategy-service.js';
import { getTelegramClientManager } from './telegram-client-manager.js';

export function normalizeIntegrationId(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export async function resolveTelegramStrategy(
	integrationId?: string
): Promise<TelegramClientStrategy> {
	if (!integrationId) {
		return initClient();
	}
	return getTelegramClientManager().getClient(integrationId);
}
