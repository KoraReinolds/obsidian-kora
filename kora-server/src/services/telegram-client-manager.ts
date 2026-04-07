/**
 * @module services/telegram-client-manager
 * @description Кэширует Telegram client strategy по integrationId и пересоздаёт
 * клиента при изменении runtime-конфига выбранного аккаунта.
 */

import { getIntegrationRegistry } from '../modules/integrations/services/integration-registry-singleton.js';
import type { RuntimeIntegrationAccount } from '../modules/integrations/integration-types.js';
import StrategyFactory from '../strategies/StrategyFactory.js';
import type { TelegramClientStrategy } from '../strategies/TelegramClientStrategy.js';

interface ManagedClientEntry {
	fingerprint: string;
	strategy: TelegramClientStrategy;
}

export class TelegramClientManager {
	private readonly entries = new Map<string, ManagedClientEntry>();

	async getClient(integrationId: string): Promise<TelegramClientStrategy> {
		const normalizedId = integrationId.trim();
		if (!normalizedId) {
			throw new Error('integrationId is required');
		}

		const runtimeAccount =
			getIntegrationRegistry().getRuntimeAccount(normalizedId);
		if (!runtimeAccount) {
			throw new Error(`Integration account not found: ${normalizedId}`);
		}
		if (runtimeAccount.account.provider !== 'telegram') {
			throw new Error(
				`Integration provider "${runtimeAccount.account.provider}" is not supported in this build.`
			);
		}

		const fingerprint = this.buildFingerprint(runtimeAccount);
		const cached = this.entries.get(normalizedId);
		if (
			cached &&
			cached.fingerprint === fingerprint &&
			cached.strategy.isClientConnected()
		) {
			return cached.strategy;
		}

		if (cached) {
			await this.disconnectEntry(normalizedId, cached);
		}

		const transport = runtimeAccount.account.transport as 'bot' | 'userbot';
		const strategy = StrategyFactory.createValidatedStrategy(transport, {
			...runtimeAccount.config,
			mode: transport,
		});
		await strategy.initialize();
		this.entries.set(normalizedId, {
			fingerprint,
			strategy,
		});
		return strategy;
	}

	async disconnectAll(): Promise<void> {
		for (const [integrationId, entry] of this.entries.entries()) {
			await this.disconnectEntry(integrationId, entry);
		}
	}

	private async disconnectEntry(
		integrationId: string,
		entry: ManagedClientEntry
	): Promise<void> {
		try {
			await entry.strategy.disconnect();
		} finally {
			this.entries.delete(integrationId);
		}
	}

	private buildFingerprint(account: RuntimeIntegrationAccount): string {
		return JSON.stringify({
			transport: account.account.transport,
			botToken: account.config.botToken || null,
			apiId: account.config.apiId || null,
			apiHash: account.config.apiHash || null,
			stringSession: account.config.stringSession || null,
			proxy: account.config.proxy || null,
		});
	}
}

let telegramClientManager: TelegramClientManager | null = null;

export function getTelegramClientManager(): TelegramClientManager {
	if (!telegramClientManager) {
		telegramClientManager = new TelegramClientManager();
	}
	return telegramClientManager;
}
