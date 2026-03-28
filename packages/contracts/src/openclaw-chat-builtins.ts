/**
 * @module packages/contracts/openclaw-chat-builtins
 * @description Классификация провайдеров Open Claw для текстового чата Kora.
 * URL и ключи задаются только в `openclaw.json` → `models.providers` (без встроенных fallback).
 */

/**
 * @description Провайдеры, для которых чат идёт на Eternal (x-api-key из конфига Kora).
 * @param {string} providerId - префикс ref до `/`
 * @returns {boolean}
 */
export function isEternalStyleOpenClawProviderId(providerId: string): boolean {
	const id = providerId.toLowerCase();
	return id === 'eternal' || id === 'eternal-ai' || id === 'eternalai';
}

/**
 * @description Провайдер из `models.providers` считается пригодным для чата Kora, если
 * указан openai-completions (или api не задан при непустом baseUrl) либо это Eternal.
 * @param {string} providerId - ключ провайдера
 * @param {unknown} cfg - объект конфига
 * @returns {boolean}
 */
export function isOpenClawProviderChatEligible(
	providerId: string,
	cfg: unknown
): boolean {
	if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
		return false;
	}
	const c = cfg as Record<string, unknown>;
	if (isEternalStyleOpenClawProviderId(providerId)) {
		return true;
	}
	const baseUrl = String(c.baseUrl ?? '').trim();
	if (!baseUrl) {
		return false;
	}
	const api = String(c.api ?? 'openai-completions');
	return api === 'openai-completions';
}
