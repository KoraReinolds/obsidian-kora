/**
 * @module services/telegram-proxy
 * @description Собирает конфиг прокси для GramJS из env/runtime-настроек.
 */

import { URL } from 'node:url';
import type { ProxyInterface } from 'telegram/network/connection/TCPMTProxy';

export type TelegramProxyConfig = ProxyInterface;

function parseOptionalNumber(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSocksType(value: string | undefined): 4 | 5 | undefined {
	if (!value) {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	if (normalized === 'socks4' || normalized === '4') {
		return 4;
	}
	if (normalized === 'socks5' || normalized === '5') {
		return 5;
	}

	return undefined;
}

function buildSocksProxyFromEnv(): TelegramProxyConfig | undefined {
	const host = process.env.TELEGRAM_PROXY_HOST?.trim();
	const port = parseOptionalNumber(process.env.TELEGRAM_PROXY_PORT);
	const socksType = parseSocksType(process.env.TELEGRAM_PROXY_TYPE);

	if (!host || !port || !socksType) {
		return undefined;
	}

	return {
		ip: host,
		port,
		socksType,
		username: process.env.TELEGRAM_PROXY_USERNAME?.trim() || undefined,
		password: process.env.TELEGRAM_PROXY_PASSWORD?.trim() || undefined,
		timeout: parseOptionalNumber(process.env.TELEGRAM_PROXY_TIMEOUT),
	};
}

function buildMtProxyFromEnv(): TelegramProxyConfig | undefined {
	const host = process.env.TELEGRAM_MTPROXY_HOST?.trim();
	const port = parseOptionalNumber(process.env.TELEGRAM_MTPROXY_PORT);
	const secret = process.env.TELEGRAM_MTPROXY_SECRET?.trim();

	if (!host || !port || !secret) {
		return undefined;
	}

	return {
		ip: host,
		port,
		secret,
		MTProxy: true,
		timeout: parseOptionalNumber(process.env.TELEGRAM_MTPROXY_TIMEOUT),
	};
}

function buildLocalProxyFallback(
	rawProxyUrl: string | undefined
): TelegramProxyConfig | undefined {
	if (!rawProxyUrl) {
		return undefined;
	}

	try {
		const parsed = new URL(rawProxyUrl);
		const protocol = parsed.protocol.replace(':', '').toLowerCase();
		if (
			protocol !== 'socks5' &&
			protocol !== 'socks4' &&
			protocol !== 'http' &&
			protocol !== 'https'
		) {
			return undefined;
		}

		if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
			return undefined;
		}

		const port = Number(parsed.port);
		if (!Number.isFinite(port) || port <= 0) {
			return undefined;
		}

		// Для локальных mixed-port прокси-клиентов чаще всего SOCKS5 доступен на том же порту,
		// даже если в системный env записан http:// URL.
		return {
			ip: parsed.hostname === 'localhost' ? '127.0.0.1' : parsed.hostname,
			port,
			socksType: 5,
			username: parsed.username
				? decodeURIComponent(parsed.username)
				: undefined,
			password: parsed.password
				? decodeURIComponent(parsed.password)
				: undefined,
		};
	} catch {
		return undefined;
	}
}

/**
 * @description Возвращает прокси-конфиг для GramJS или `undefined`, если прокси не задан.
 * Приоритет:
 * 1. Явные `TELEGRAM_PROXY_*` для SOCKS4/5
 * 2. Явные `TELEGRAM_MTPROXY_*`
 * 3. Fallback из `HTTP_PROXY`/`HTTPS_PROXY` только для localhost-адресов
 */
export function getTelegramProxyConfig(): TelegramProxyConfig | undefined {
	return (
		buildSocksProxyFromEnv() ||
		buildMtProxyFromEnv() ||
		buildLocalProxyFallback(process.env.HTTPS_PROXY) ||
		buildLocalProxyFallback(process.env.HTTP_PROXY)
	);
}
