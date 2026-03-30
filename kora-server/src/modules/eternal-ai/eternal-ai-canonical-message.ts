/**
 * @module modules/eternal-ai/eternal-ai-canonical-message
 * @description Общая canonicalization-логика Eternal AI сообщений. Нужна и для
 * новых записей, и для миграции старой истории, чтобы не расходились правила
 * сборки `CanonicalChatMessage` между runtime-write path и backfill path.
 */

import {
	type CanonicalChatHiddenPayload,
	type CanonicalChatMedia,
	type CanonicalChatMessage,
	type CanonicalChatMessagePart,
} from '../../../../packages/contracts/src/canonical-chat-message.js';
import type { EternalAiMessageRecord } from '../../../../packages/contracts/src/eternal-ai.js';
import { parseAssistantResponse } from '../../../../packages/kora-core/src/runtime/model/response-parser.js';
import type { ParsedAssistantResponse } from '../../../../packages/kora-core/src/runtime/model/types.js';

/**
 * @description Унифицированный sender для сообщений Eternal AI.
 * @param {EternalAiMessageRecord['role']} role - Роль сообщения в локальной истории
 * @returns {CanonicalChatMessage['sender']}
 */
export function buildEternalCanonicalSender(
	role: EternalAiMessageRecord['role']
): CanonicalChatMessage['sender'] {
	if (role === 'assistant') {
		return {
			kind: 'assistant',
			displayName: 'Assistant',
			initials: 'AI',
		};
	}
	if (role === 'system') {
		return {
			kind: 'system',
			displayName: 'System',
			initials: 'SY',
		};
	}
	return {
		kind: 'user',
		displayName: 'You',
		initials: 'YO',
		isSelf: true,
	};
}

/**
 * @description Базовая speech-часть для plain text сообщений без richer структуры.
 * @param {string} text - Текст сообщения
 * @returns {CanonicalChatMessagePart[]}
 */
export function buildEternalSpeechParts(
	text: string
): CanonicalChatMessagePart[] {
	const normalized = text.trim();
	return normalized
		? [
				{
					kind: 'speech',
					text: normalized,
				},
			]
		: [];
}

/**
 * @description Переносит текущие attachment JSON-объекты Eternal в transport-neutral
 * canonical media shape.
 * @param {Array<Record<string, unknown>> | null | undefined} attachments - Вложения из SQLite
 * @returns {CanonicalChatMedia[] | null}
 */
export function mapEternalAttachmentsToCanonicalMedia(
	attachments?: Array<Record<string, unknown>> | null
): CanonicalChatMedia[] | null {
	if (!attachments?.length) {
		return null;
	}
	return attachments.map((attachment, index) => ({
		id:
			typeof attachment.id === 'string'
				? attachment.id
				: `attachment-${index + 1}`,
		kind: String(attachment.kind || 'file'),
		name: String(attachment.name || attachment.fileName || 'Вложение'),
		description:
			typeof attachment.description === 'string'
				? attachment.description
				: undefined,
		previewSrc:
			typeof attachment.previewSrc === 'string' ? attachment.previewSrc : null,
		isGenerating: Boolean(attachment.isGenerating),
		isImage: Boolean(attachment.isImage),
		isVideo: Boolean(attachment.isVideo),
		size: typeof attachment.size === 'number' ? Number(attachment.size) : null,
		mimeType:
			typeof attachment.mimeType === 'string' ? attachment.mimeType : null,
		sourceUrl:
			typeof attachment.sourceUrl === 'string'
				? attachment.sourceUrl
				: typeof attachment.previewSrc === 'string'
					? attachment.previewSrc
					: null,
	}));
}

/**
 * @description Собирает hidden payload из parser-а. Это серверный semantic слой,
 * который не обязан целиком уходить в Telegram.
 * @param {ParsedAssistantResponse} parsedResponse - Результат runtime parser-а
 * @returns {CanonicalChatHiddenPayload | null}
 */
export function buildEternalHiddenPayloadFromParsedResponse(
	parsedResponse: ParsedAssistantResponse
): CanonicalChatHiddenPayload | null {
	const hidden: CanonicalChatHiddenPayload = {
		privateThoughts: parsedResponse.privateThoughts,
		environmentPatch: parsedResponse.environmentPatch || null,
		memoryCandidates: parsedResponse.memoryCandidates,
		rawModelOutput: parsedResponse.rawText,
		parser: {
			format: parsedResponse.usedStructuredBlocks ? 'tagged' : 'plain',
			usedStructuredBlocks: parsedResponse.usedStructuredBlocks,
		},
	};
	const hasHidden = Boolean(
		hidden.privateThoughts?.length ||
		hidden.environmentPatch ||
		hidden.memoryCandidates?.length ||
		hidden.rawModelOutput ||
		hidden.parser
	);
	return hasHidden ? hidden : null;
}

/**
 * @description Единая сборка canonical message для Eternal. Если richer parts не
 * переданы, plain text автоматически считается `speech`.
 * @param params - Поля локального сообщения и optional semantic extras
 * @returns {CanonicalChatMessage}
 */
export function buildEternalCanonicalMessage(params: {
	messageId: string;
	conversationId: string;
	role: EternalAiMessageRecord['role'];
	createdAt: string;
	text: string;
	attachments?: Array<Record<string, unknown>> | null;
	parts?: CanonicalChatMessagePart[];
	hidden?: CanonicalChatHiddenPayload | null;
}): CanonicalChatMessage {
	const normalizedParts =
		params.parts?.filter(part => part.text.trim().length > 0) || [];
	const parts = normalizedParts.length
		? normalizedParts
		: buildEternalSpeechParts(params.text);
	return {
		id: params.messageId,
		chatId: params.conversationId,
		sender: buildEternalCanonicalSender(params.role),
		timestampUtc: params.createdAt,
		parts,
		media: mapEternalAttachmentsToCanonicalMedia(params.attachments),
		hidden: params.hidden || null,
		metadata: {
			role: params.role,
			source: 'eternal_ai',
		},
	};
}

function getStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function getObjectRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

/**
 * @description Семантически восстанавливает parser output старого assistant-сообщения.
 * Сначала используем лучший raw источник (`trace.raw_response`, `parsedResponse.rawText`),
 * затем домешиваем legacy metadata вроде `memoryCandidates` и `environmentPatch`.
 * @param params - Текущее сообщение и optional raw trace response
 * @returns {ParsedAssistantResponse}
 */
export function reconstructAssistantParsedResponse(params: {
	contentText: string;
	metadata?: Record<string, unknown> | null;
	traceRawResponse?: string | null;
}): ParsedAssistantResponse {
	const legacyParsed = getObjectRecord(params.metadata?.parsedResponse);
	const rawCandidate =
		(typeof params.traceRawResponse === 'string' &&
		params.traceRawResponse.trim().length > 0
			? params.traceRawResponse
			: typeof legacyParsed?.rawText === 'string' && legacyParsed.rawText.trim()
				? legacyParsed.rawText
				: params.contentText) || '';

	const parsed = parseAssistantResponse(rawCandidate);
	const legacyActions = getStringArray(legacyParsed?.actions);
	const legacyMemoryCandidates = getStringArray(legacyParsed?.memoryCandidates);
	const legacyEnvironmentPatch = getObjectRecord(
		legacyParsed?.environmentPatch
	);
	const legacyAssistantText =
		typeof legacyParsed?.assistantText === 'string'
			? legacyParsed.assistantText
			: '';
	const usedStructuredBlocks =
		parsed.usedStructuredBlocks || Boolean(legacyParsed?.usedStructuredBlocks);

	const parts =
		parsed.parts.length > 0
			? parsed.parts
			: [
					...legacyActions.map(
						action =>
							({
								kind: 'action',
								text: action,
							}) satisfies CanonicalChatMessagePart
					),
					...buildEternalSpeechParts(
						legacyAssistantText || params.contentText || parsed.assistantText
					),
				];

	return {
		...parsed,
		rawText: parsed.rawText || rawCandidate.trim(),
		assistantText:
			parsed.assistantText || legacyAssistantText || params.contentText.trim(),
		parts,
		actions: parsed.actions.length > 0 ? parsed.actions : legacyActions,
		environmentPatch:
			parsed.environmentPatch || legacyEnvironmentPatch || undefined,
		memoryCandidates:
			parsed.memoryCandidates.length > 0
				? parsed.memoryCandidates
				: legacyMemoryCandidates,
		usedStructuredBlocks,
	};
}
