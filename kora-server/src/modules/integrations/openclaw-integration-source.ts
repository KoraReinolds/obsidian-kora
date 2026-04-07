/**
 * @module modules/integrations/openclaw-integration-source
 * @description Читает openclaw.json как read-only реестр Telegram bot accounts.
 * Маршрутизацию и bindings OpenClaw Kora не импортирует.
 */

import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import JSON5 from 'json5';
import type { IntegrationAccount } from '../../../../packages/contracts/src/telegram.js';
import {
	BOT_CAPABILITIES,
	type IntegrationSourceResult,
} from './integration-types.js';

interface OpenClawConfigSnapshot {
	path: string;
	mtimeMs: number | null;
	accounts: IntegrationSourceResult['accounts'];
	warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOpenClawConfigPath(): string {
	const home = process.env.OPENCLAW_HOME?.trim();
	const root = home && home.length > 0 ? home : join(homedir(), '.openclaw');
	return join(root, 'openclaw.json');
}

export class OpenClawIntegrationSource {
	private cachedSnapshot: OpenClawConfigSnapshot | null = null;

	listAccounts(forceReload = false): IntegrationSourceResult {
		const snapshot = this.loadSnapshot(forceReload);
		return {
			accounts: snapshot.accounts,
			warnings: snapshot.warnings,
		};
	}

	private loadSnapshot(forceReload: boolean): OpenClawConfigSnapshot {
		const filePath = getOpenClawConfigPath();
		const mtimeMs = existsSync(filePath) ? statSync(filePath).mtimeMs : null;
		if (
			!forceReload &&
			this.cachedSnapshot &&
			this.cachedSnapshot.path === filePath &&
			this.cachedSnapshot.mtimeMs === mtimeMs
		) {
			return this.cachedSnapshot;
		}

		const nextSnapshot = this.readSnapshot(filePath, mtimeMs);
		this.cachedSnapshot = nextSnapshot;
		return nextSnapshot;
	}

	private readSnapshot(
		filePath: string,
		mtimeMs: number | null
	): OpenClawConfigSnapshot {
		if (!existsSync(filePath)) {
			return {
				path: filePath,
				mtimeMs,
				accounts: [],
				warnings: [],
			};
		}

		try {
			const raw = readFileSync(filePath, 'utf8');
			const parsed = JSON5.parse(raw) as unknown;
			return {
				path: filePath,
				mtimeMs,
				...this.extractAccounts(parsed, filePath),
			};
		} catch (error) {
			return {
				path: filePath,
				mtimeMs,
				accounts: [],
				warnings: [
					`Не удалось прочитать openclaw.json: ${(error as Error).message}`,
				],
			};
		}
	}

	private extractAccounts(
		config: unknown,
		configPath: string
	): IntegrationSourceResult {
		const warnings: string[] = [];
		const channels =
			isRecord(config) && isRecord(config.channels) ? config.channels : null;
		const telegram =
			channels && isRecord(channels.telegram) ? channels.telegram : null;

		if (!telegram || telegram.enabled === false) {
			return { accounts: [], warnings };
		}

		const accounts: IntegrationSourceResult['accounts'] = [];
		const defaultAccountId =
			typeof telegram.defaultAccount === 'string' &&
			telegram.defaultAccount.trim()
				? telegram.defaultAccount.trim()
				: null;
		const accountEntries =
			isRecord(telegram.accounts) && Object.keys(telegram.accounts).length > 0
				? Object.entries(telegram.accounts)
				: [];

		if (accountEntries.length > 0) {
			for (const [accountId, candidate] of accountEntries) {
				if (!isRecord(candidate) || candidate.enabled === false) {
					continue;
				}
				const token = this.resolveBotToken({
					candidate,
					channelConfig: telegram,
					configPath,
					allowEnvFallback: accountId === (defaultAccountId || 'default'),
				});
				if (!token) {
					warnings.push(
						`OpenClaw Telegram account "${accountId}" пропущен: bot token не найден.`
					);
					continue;
				}
				accounts.push({
					account: this.buildAccount({
						accountId,
						title: this.resolveTitle(candidate, telegram, accountId),
						isDefault:
							(defaultAccountId && accountId === defaultAccountId) ||
							(!defaultAccountId && accountId === 'default'),
					}),
					config: {
						mode: 'bot',
						botToken: token,
					},
				});
			}
		} else {
			const token = this.resolveBotToken({
				candidate: telegram,
				channelConfig: telegram,
				configPath,
				allowEnvFallback: true,
			});
			if (token) {
				accounts.push({
					account: this.buildAccount({
						accountId: defaultAccountId || 'default',
						title: this.resolveTitle(telegram, telegram, 'default'),
						isDefault: true,
					}),
					config: {
						mode: 'bot',
						botToken: token,
					},
				});
			}
		}

		return { accounts, warnings };
	}

	private resolveTitle(
		candidate: Record<string, unknown>,
		channelConfig: Record<string, unknown>,
		accountId: string
	): string {
		const titleCandidate = [
			candidate.title,
			candidate.name,
			channelConfig.title,
		].find(value => typeof value === 'string' && value.trim()) as
			| string
			| undefined;
		return titleCandidate?.trim() || `Telegram ${accountId}`;
	}

	private buildAccount(params: {
		accountId: string;
		title: string;
		isDefault: boolean;
	}): IntegrationAccount {
		return {
			id: `openclaw:telegram:${params.accountId}`,
			provider: 'telegram',
			source: 'openclaw',
			transport: 'bot',
			accountId: params.accountId,
			title: params.title,
			enabled: true,
			isDefault: params.isDefault,
			capabilities: BOT_CAPABILITIES,
		};
	}

	private resolveBotToken(params: {
		candidate: Record<string, unknown>;
		channelConfig: Record<string, unknown>;
		configPath: string;
		allowEnvFallback: boolean;
	}): string | null {
		const direct = this.normalizeToken(params.candidate.botToken);
		if (direct) {
			return direct;
		}

		const tokenFileValue =
			typeof params.candidate.tokenFile === 'string'
				? params.candidate.tokenFile
				: typeof params.channelConfig.tokenFile === 'string'
					? params.channelConfig.tokenFile
					: null;
		const fromFile = this.readTokenFile(tokenFileValue, params.configPath);
		if (fromFile) {
			return fromFile;
		}

		const fallback = this.normalizeToken(params.channelConfig.botToken);
		if (fallback) {
			return fallback;
		}

		if (params.allowEnvFallback) {
			return this.normalizeToken(process.env.TELEGRAM_BOT_TOKEN) || null;
		}

		return null;
	}

	private normalizeToken(value: unknown): string | null {
		if (typeof value !== 'string') {
			return null;
		}
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	private readTokenFile(
		tokenFileValue: string | null,
		configPath: string
	): string | null {
		if (!tokenFileValue) {
			return null;
		}
		const resolvedPath = isAbsolute(tokenFileValue)
			? tokenFileValue
			: resolve(dirname(configPath), tokenFileValue);
		if (!existsSync(resolvedPath)) {
			return null;
		}
		const stat = lstatSync(resolvedPath);
		if (!stat.isFile() || stat.isSymbolicLink()) {
			return null;
		}
		return this.normalizeToken(readFileSync(resolvedPath, 'utf8'));
	}
}
