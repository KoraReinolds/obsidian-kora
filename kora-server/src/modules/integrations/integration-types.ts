/**
 * @module modules/integrations/integration-types
 * @description Общие типы read-only registry интеграций Telegram. Публичный
 * safe shape отделён от runtime-конфига с секретами.
 */

import type { IntegrationAccount } from '../../../../packages/contracts/src/telegram.js';
import type { TelegramConfig } from '../../strategies/TelegramClientStrategy.js';

export interface RuntimeIntegrationAccount {
	account: IntegrationAccount;
	config: TelegramConfig;
}

export interface IntegrationSourceResult {
	accounts: RuntimeIntegrationAccount[];
	warnings: string[];
}

export const BOT_CAPABILITIES: IntegrationAccount['capabilities'] = {
	sendText: true,
	editText: true,
	sendFiles: true,
	readHistory: false,
};

export const USERBOT_CAPABILITIES: IntegrationAccount['capabilities'] = {
	sendText: true,
	editText: true,
	sendFiles: true,
	readHistory: true,
};
