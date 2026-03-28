/**
 * @module modules/eternal-ai/resolve-openclaw-chat-completion
 * @description Сопоставляет строку модели чата (`ref` вида `zai/glm-5` или legacy id без `/`)
 * с транспортом: Eternal x-api-key или OpenAI-compatible Bearer по `openclaw.json`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import JSON5 from 'json5';
import { isEternalStyleOpenClawProviderId } from '../../../../packages/contracts/src/openclaw-chat-builtins.js';

export type ResolvedChatCompletionTransport =
	| {
			kind: 'eternal_x_api_key';
			baseUrl: string;
			apiKey: string;
			upstreamModelId: string;
	  }
	| {
			kind: 'openai_bearer';
			baseUrl: string;
			apiKey: string;
			upstreamModelId: string;
	  };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNested(obj: unknown, path: readonly string[]): unknown {
	let cur: unknown = obj;
	for (const key of path) {
		if (!isRecord(cur)) {
			return undefined;
		}
		cur = cur[key];
	}
	return cur;
}

function getOpenClawConfigPath(): string {
	const home = process.env.OPENCLAW_HOME?.trim();
	const root = home && home.length > 0 ? home : join(homedir(), '.openclaw');
	return join(root, 'openclaw.json');
}

/**
 * @description Объединяет `process.env` и блок `env` из openclaw для подстановки `${VAR}`.
 * @param {unknown} config - распарсенный openclaw.json
 * @returns {Record<string, string>}
 */
function buildSubstitutionEnv(config: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === 'string') {
			out[k] = v;
		}
	}
	const ocEnv = getNested(config, ['env']);
	if (isRecord(ocEnv)) {
		for (const [k, v] of Object.entries(ocEnv)) {
			if (typeof v === 'string') {
				out[k] = v;
			}
		}
	}
	return out;
}

/**
 * @description Подставляет `${VAR}` в строке конфига.
 * @param {string} template - шаблон
 * @param {Record<string, string>} env - карта значений
 * @returns {string}
 */
function substituteEnvVars(
	template: string,
	env: Record<string, string>
): string {
	return template.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
		const key = name.trim();
		return env[key] ?? '';
	});
}

/**
 * @description Загружает и парсит openclaw.json или возвращает null.
 * @returns {unknown | null}
 */
function tryLoadOpenClawConfig(): unknown | null {
	const path = getOpenClawConfigPath();
	if (!existsSync(path)) {
		return null;
	}
	try {
		const raw = readFileSync(path, 'utf8');
		return JSON5.parse(raw) as unknown;
	} catch {
		return null;
	}
}

/**
 * @description Определяет URL и ключ для chat/completions.
 * @param {string} modelRef - legacy id без `/` или `provider/modelId`
 * @param {{ baseUrl: string; apiKey: string }} eternalCfg - Eternal из Kora config
 * @returns {ResolvedChatCompletionTransport}
 * @throws {Error} если ref с `/` не удаётся разрешить
 */
export function resolveChatCompletionTransport(
	modelRef: string,
	eternalCfg: { baseUrl: string; apiKey: string }
): ResolvedChatCompletionTransport {
	const trimmed = modelRef.trim();
	const eternalBase = (
		eternalCfg.baseUrl || 'https://open.eternalai.org/v1'
	).replace(/\/$/, '');

	if (!trimmed.includes('/')) {
		return {
			kind: 'eternal_x_api_key',
			baseUrl: eternalBase,
			apiKey: eternalCfg.apiKey,
			upstreamModelId: trimmed,
		};
	}

	const slash = trimmed.indexOf('/');
	const providerId = trimmed.slice(0, slash);
	const upstreamModelId = trimmed.slice(slash + 1).trim();
	if (!providerId || !upstreamModelId) {
		throw new Error(`Некорректный ref модели: «${modelRef}».`);
	}

	if (isEternalStyleOpenClawProviderId(providerId)) {
		return {
			kind: 'eternal_x_api_key',
			baseUrl: eternalBase,
			apiKey: eternalCfg.apiKey,
			upstreamModelId,
		};
	}

	const config = tryLoadOpenClawConfig();
	if (!config) {
		throw new Error(
			`Для модели «${trimmed}» нужен файл openclaw.json (${getOpenClawConfigPath()}).`
		);
	}

	const env = buildSubstitutionEnv(config);
	const providersRaw = getNested(config, ['models', 'providers']);
	const pCfg =
		isRecord(providersRaw) && isRecord(providersRaw[providerId])
			? providersRaw[providerId]
			: undefined;

	if (!isRecord(pCfg)) {
		throw new Error(
			`Провайдер «${providerId}» не найден в models.providers в openclaw.json.`
		);
	}

	const baseUrl = String(pCfg.baseUrl ?? '')
		.trim()
		.replace(/\/$/, '');
	const api = String(pCfg.api ?? 'openai-completions');
	if (!baseUrl) {
		throw new Error(
			`Провайдер «${providerId}»: в models.providers задайте непустой baseUrl в openclaw.json.`
		);
	}
	if (api !== 'openai-completions') {
		throw new Error(
			`Провайдер «${providerId}»: api «${api}» не поддерживается Kora (нужен openai-completions).`
		);
	}
	const apiKey = substituteEnvVars(String(pCfg.apiKey ?? ''), env).trim();
	if (!apiKey) {
		throw new Error(
			`Провайдер «${providerId}»: пустой apiKey после подстановки env в openclaw.json.`
		);
	}
	return {
		kind: 'openai_bearer',
		baseUrl,
		apiKey,
		upstreamModelId,
	};
}
