/**
 * @module modules/integrations/kora-telegram-integration-source
 * @description Публикует локальные Telegram-аккаунты, настроенные в runtime
 * конфиге Kora server.
 */

import type { IntegrationAccount } from '../../../../packages/contracts/src/telegram.js';
import { getConfig } from '../../services/config-service.js';
import {
	BOT_CAPABILITIES,
	type IntegrationSourceResult,
	USERBOT_CAPABILITIES,
} from './integration-types.js';

export class KoraTelegramIntegrationSource {
	listAccounts(): IntegrationSourceResult {
		const config = getConfig();
		const accounts: IntegrationSourceResult['accounts'] = [];

		const hasBot = Boolean(config.botToken);
		const hasUserbot = Boolean(
			config.apiId && config.apiHash && config.stringSession
		);

		if (hasBot) {
			accounts.push({
				account: this.buildAccount({
					accountId: 'bot',
					title: 'Kora Bot',
					transport: 'bot',
					isDefault: config.mode === 'bot' || !hasUserbot,
					capabilities: BOT_CAPABILITIES,
				}),
				config: {
					mode: 'bot',
					botToken: config.botToken,
				},
			});
		}

		if (hasUserbot) {
			accounts.push({
				account: this.buildAccount({
					accountId: 'userbot',
					title: 'Kora Userbot',
					transport: 'userbot',
					isDefault: config.mode === 'userbot' || !hasBot,
					capabilities: USERBOT_CAPABILITIES,
				}),
				config: {
					mode: 'userbot',
					apiId: config.apiId,
					apiHash: config.apiHash,
					stringSession: config.stringSession,
					proxy: config.telegramProxy,
				},
			});
		}

		return {
			accounts,
			warnings: [],
		};
	}

	private buildAccount(params: {
		accountId: string;
		title: string;
		transport: IntegrationAccount['transport'];
		isDefault: boolean;
		capabilities: IntegrationAccount['capabilities'];
	}): IntegrationAccount {
		return {
			id: `kora:telegram:${params.accountId}`,
			provider: 'telegram',
			source: 'kora',
			transport: params.transport,
			accountId: params.accountId,
			title: params.title,
			enabled: true,
			isDefault: params.isDefault,
			capabilities: params.capabilities,
		};
	}
}
