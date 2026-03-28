/**
 * @module features/eternal-ai/lib/load-openclaw-chat-models
 * @description Читает `openclaw.json` (JSON5) и строит список моделей для **текстового** чата
 * Kora: ключи `agents.defaults.models` (allowlist) плюс **все модели Eternal** из
 * `models.providers` (чтобы в дропдауне были и z.ai из allowlist, и каталог Eternal).
 * Если allowlist пуст — как раньше: полный обход `models.providers`. Визуальные эффекты
 * только Eternal API.
 */

import { existsSync, readFileSync } from 'fs';
import { parse as parseJson5 } from 'json5';
import { homedir } from 'os';
import { join } from 'path';
import {
	isEternalStyleOpenClawProviderId,
	isOpenClawProviderChatEligible,
} from '../../../../../../packages/contracts/src/openclaw-chat-builtins';

/** Одна опция в дропдауне чата. */
export interface OpenClawChatModelOption {
	/** id модели у upstream (после `/` в ref). */
	apiModelId: string;
	/** Подпись в UI. */
	label: string;
	/** Полный ref `provider/modelId` как в Open Claw. */
	openClawRef: string;
}

export interface LoadOpenClawChatModelsResult {
	options: OpenClawChatModelOption[];
	configPath: string | null;
	/** Рекомендуемый ref из `agents.defaults.model.primary`. */
	defaultOpenClawRef: string | null;
	error?: string;
}

function getOpenClawConfigPath(): string {
	const home = process.env.OPENCLAW_HOME?.trim();
	const root = home && home.length > 0 ? home : join(homedir(), '.openclaw');
	return join(root, 'openclaw.json');
}

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

function getAllowlistRefs(config: unknown): string[] | null {
	const models = getNested(config, ['agents', 'defaults', 'models']);
	if (!isRecord(models)) {
		return null;
	}
	return Object.keys(models);
}

function getModelAlias(config: unknown, ref: string): string | undefined {
	const entry = getNested(config, ['agents', 'defaults', 'models', ref]);
	if (!isRecord(entry)) {
		return undefined;
	}
	const alias = entry.alias;
	return typeof alias === 'string' ? alias : undefined;
}

function parsePrimaryRef(config: unknown): string | null {
	const primary = getNested(config, ['agents', 'defaults', 'model', 'primary']);
	if (typeof primary !== 'string' || !primary.includes('/')) {
		return null;
	}
	return primary.trim();
}

function refToApiModelId(ref: string): string {
	const slash = ref.indexOf('/');
	return slash >= 0 ? ref.slice(slash + 1) : ref;
}

/**
 * @description Можно ли для ref получить транспорт на Kora server (Eternal или запись в models.providers).
 * @param {string} ref - `provider/modelId`
 * @param {unknown} config - распарсенный openclaw
 * @returns {boolean}
 */
function isRefResolvable(ref: string, config: unknown): boolean {
	const slash = ref.indexOf('/');
	if (slash <= 0) {
		return false;
	}
	const providerId = ref.slice(0, slash);
	const modelId = ref.slice(slash + 1);
	if (!modelId.trim()) {
		return false;
	}
	if (isEternalStyleOpenClawProviderId(providerId)) {
		return true;
	}
	const providersRaw = getNested(config, ['models', 'providers']);
	if (
		isRecord(providersRaw) &&
		isRecord(providersRaw[providerId]) &&
		isOpenClawProviderChatEligible(providerId, providersRaw[providerId])
	) {
		return true;
	}
	return false;
}

/**
 * @description Добавляет в список опции из `models.providers` только для Eternal-провайдеров
 * (`eternal` / `eternal-ai` / `eternalai`), без дубликатов ref. Нужен при непустом allowlist:
 * иначе в UI остаётся только z.ai и пр., хотя Eternal уже описан в providers.
 * @param {unknown} config - корень openclaw.json
 * @param {unknown} providersRaw - `models.providers`
 * @param {Set<string>} seen - уже занятые ref
 * @param {OpenClawChatModelOption[]} options - куда дописать
 * @returns {void}
 */
function appendEternalProviderModels(
	config: unknown,
	providersRaw: unknown,
	seen: Set<string>,
	options: OpenClawChatModelOption[]
): void {
	if (!isRecord(providersRaw)) {
		return;
	}
	for (const [providerId, cfg] of Object.entries(providersRaw)) {
		if (!isEternalStyleOpenClawProviderId(providerId) || !isRecord(cfg)) {
			continue;
		}
		if (!isOpenClawProviderChatEligible(providerId, cfg)) {
			continue;
		}
		const modelsField = cfg.models;
		if (!Array.isArray(modelsField)) {
			continue;
		}
		for (const row of modelsField) {
			if (!isRecord(row)) {
				continue;
			}
			const mid = row.id;
			if (typeof mid !== 'string' || !mid.trim()) {
				continue;
			}
			const ref = `${providerId}/${mid}`;
			if (seen.has(ref)) {
				continue;
			}
			seen.add(ref);
			const name = typeof row.name === 'string' ? row.name : '';
			const label = getModelAlias(config, ref) || name || ref;
			options.push({
				openClawRef: ref,
				apiModelId: mid,
				label,
			});
		}
	}
}

/**
 * @description Разбирает текст конфига Open Claw и возвращает опции моделей чата.
 * @param {string} raw - содержимое `openclaw.json` (JSON5)
 * @returns {Omit<LoadOpenClawChatModelsResult, 'configPath'>}
 */
export function parseOpenClawConfigForChatModels(
	raw: string
): Omit<LoadOpenClawChatModelsResult, 'configPath'> {
	let config: unknown;
	try {
		config = parseJson5(raw);
	} catch (e) {
		return {
			options: [],
			defaultOpenClawRef: null,
			error: `JSON5: ${(e as Error).message}`,
		};
	}

	const allowlist = getAllowlistRefs(config);
	const primaryRef = parsePrimaryRef(config);
	const providersRaw = getNested(config, ['models', 'providers']);
	const seen = new Set<string>();
	const options: OpenClawChatModelOption[] = [];

	if (allowlist && allowlist.length > 0) {
		for (const ref of allowlist) {
			if (!ref.includes('/')) {
				continue;
			}
			if (!isRefResolvable(ref, config)) {
				continue;
			}
			if (seen.has(ref)) {
				continue;
			}
			seen.add(ref);
			options.push({
				openClawRef: ref,
				apiModelId: refToApiModelId(ref),
				label: getModelAlias(config, ref) || ref,
			});
		}
		appendEternalProviderModels(config, providersRaw, seen, options);
	} else if (isRecord(providersRaw)) {
		for (const [providerId, cfg] of Object.entries(providersRaw)) {
			if (!isOpenClawProviderChatEligible(providerId, cfg) || !isRecord(cfg)) {
				continue;
			}
			const modelsField = cfg.models;
			if (!Array.isArray(modelsField)) {
				continue;
			}
			for (const row of modelsField) {
				if (!isRecord(row)) {
					continue;
				}
				const mid = row.id;
				if (typeof mid !== 'string' || !mid.trim()) {
					continue;
				}
				const ref = `${providerId}/${mid}`;
				if (seen.has(ref)) {
					continue;
				}
				seen.add(ref);
				const name = typeof row.name === 'string' ? row.name : '';
				const label = getModelAlias(config, ref) || name || ref;
				options.push({
					openClawRef: ref,
					apiModelId: mid,
					label,
				});
			}
		}
	} else {
		return {
			options: [],
			defaultOpenClawRef: null,
			error:
				'Задайте объект agents.defaults.models (allowlist ref) или models.providers в openclaw.json.',
		};
	}

	let defaultOpenClawRef: string | null = null;
	if (primaryRef && options.some(o => o.openClawRef === primaryRef)) {
		defaultOpenClawRef = primaryRef;
	} else if (options.length > 0) {
		defaultOpenClawRef = options[0].openClawRef;
	}

	return {
		options,
		defaultOpenClawRef,
	};
}

/**
 * @description Читает `openclaw.json` с диска.
 * @returns {LoadOpenClawChatModelsResult}
 */
export function loadOpenClawChatModelsFromDisk(): LoadOpenClawChatModelsResult {
	const configPath = getOpenClawConfigPath();
	if (!existsSync(configPath)) {
		return {
			options: [],
			configPath,
			defaultOpenClawRef: null,
			error: 'Файл openclaw.json не найден',
		};
	}
	try {
		const raw = readFileSync(configPath, 'utf8');
		const parsed = parseOpenClawConfigForChatModels(raw);
		return {
			...parsed,
			configPath,
		};
	} catch (e) {
		return {
			options: [],
			configPath,
			defaultOpenClawRef: null,
			error: (e as Error).message,
		};
	}
}
