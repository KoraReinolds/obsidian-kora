/**
 * @module modules/integrations/integration-registry
 * @description In-memory реестр integration accounts. OpenClaw-часть лениво
 * перечитывается по mtime, локальные Kora-аккаунты вычисляются на каждый запрос.
 */

import type { IntegrationAccount } from '../../../../packages/contracts/src/telegram.js';
import { KoraTelegramIntegrationSource } from './kora-telegram-integration-source.js';
import { OpenClawIntegrationSource } from './openclaw-integration-source.js';
import type { RuntimeIntegrationAccount } from './integration-types.js';

export class IntegrationRegistry {
	private readonly openClawSource = new OpenClawIntegrationSource();
	private readonly koraSource = new KoraTelegramIntegrationSource();
	private lastWarnings: string[] = [];

	initialize(): IntegrationAccount[] {
		return this.listAccounts();
	}

	listAccounts(forceReload = false): IntegrationAccount[] {
		return this.collectRuntimeAccounts(forceReload).map(entry => entry.account);
	}

	getRuntimeAccount(
		integrationId: string,
		forceReload = false
	): RuntimeIntegrationAccount | null {
		const normalizedId = integrationId.trim();
		if (!normalizedId) {
			return null;
		}
		return (
			this.collectRuntimeAccounts(forceReload).find(
				entry => entry.account.id === normalizedId
			) || null
		);
	}

	reload(): IntegrationAccount[] {
		return this.listAccounts(true);
	}

	getWarnings(): string[] {
		return [...this.lastWarnings];
	}

	private collectRuntimeAccounts(
		forceReload: boolean
	): RuntimeIntegrationAccount[] {
		const openClaw = this.openClawSource.listAccounts(forceReload);
		const kora = this.koraSource.listAccounts();
		this.lastWarnings = [...openClaw.warnings, ...kora.warnings];
		return [...openClaw.accounts, ...kora.accounts].sort((left, right) => {
			if (left.account.provider !== right.account.provider) {
				return left.account.provider.localeCompare(right.account.provider);
			}
			if (left.account.source !== right.account.source) {
				return left.account.source.localeCompare(right.account.source);
			}
			return left.account.accountId.localeCompare(right.account.accountId);
		});
	}
}
