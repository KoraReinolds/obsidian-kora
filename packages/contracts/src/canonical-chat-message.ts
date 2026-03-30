/**
 * @module packages/contracts/canonical-chat-message
 * @description Канонический tg-first формат chat-like сообщений для Kora.
 * Это не wire DTO конкретного транспорта и не UI shape, а общий source of truth
 * между runtime-ядром, Obsidian client и будущими Telegram adapters.
 */

export type CanonicalChatSenderKind =
	| 'user'
	| 'assistant'
	| 'system'
	| 'service'
	| 'other';

export type CanonicalChatPartKind = 'speech' | 'thought' | 'action';

export type CanonicalChatThoughtVisibility = 'plain' | 'spoiler';

/**
 * @description Отправитель канонического сообщения. Поля `displayName` и
 * `initials` позволяют UI рендерить bubble без feature-specific эвристик.
 */
export interface CanonicalChatSender {
	kind: CanonicalChatSenderKind;
	id?: string | null;
	name?: string | null;
	displayName?: string | null;
	initials?: string | null;
	isSelf?: boolean;
}

/**
 * @description Одна видимая часть сообщения. Через `parts[]` можно выразить
 * обычную речь, действия и мысли без потери Telegram-first семантики.
 */
export interface CanonicalChatMessagePart {
	kind: CanonicalChatPartKind;
	text: string;
	visibility?: CanonicalChatThoughtVisibility;
}

/**
 * @description Reply preview не обязателен для source of truth, но полезен в
 * кэше/адаптере, когда рядом уже загружено исходное сообщение и можно отдать
 * UI готовое краткое превью без повторного lookup.
 */
export interface CanonicalChatReplyPreview {
	label: string;
	text: string;
	targetId?: string | null;
}

/**
 * @description Нормализованная реакция. Достаточно общего `label`, чтобы одна
 * и та же структура работала и для emoji Telegram, и для локальных mock-данных.
 */
export interface CanonicalChatReaction {
	id: string;
	label: string;
	count?: number | null;
}

/**
 * @description Медиа/вложение сообщения в transport-neutral виде. Поля похожи
 * на Telegram archive и текущий bubble UI, чтобы adapter был почти прямым.
 */
export interface CanonicalChatMedia {
	id: string;
	kind: string;
	name: string;
	description?: string;
	previewSrc?: string | null;
	isGenerating?: boolean;
	isImage?: boolean;
	isVideo?: boolean;
	size?: number | null;
	mimeType?: string | null;
	sourceUrl?: string | null;
}

/**
 * @description Источник пересланного сообщения в форме, пригодной и для
 * Telegram UI-лейбла, и для будущего sync слоя.
 */
export interface CanonicalChatForwardInfo {
	fromId?: string | null;
	fromName?: string | null;
	fromTitle?: string | null;
}

/**
 * @description Сервисное событие вместо обычного текста. В tg-first модели это
 * остаётся сообщением, но UI или transport могут рендерить его особым образом.
 */
export interface CanonicalChatServiceInfo {
	type: string;
	text?: string | null;
}

/**
 * @description Текстовая entity без привязки к конкретному Telegram API-классу.
 * Этого достаточно для будущего formatter/export слоя.
 */
export interface CanonicalChatTextEntity {
	type: string;
	offset: number;
	length: number;
	url?: string;
	language?: string;
	customEmojiId?: string;
}

/**
 * @description Скрытая AI-часть канонического сообщения. Эти поля не обязаны
 * попадать в Telegram и могут отображаться только в Obsidian/debug.
 */
export interface CanonicalChatHiddenPayload {
	privateThoughts?: string[];
	environmentPatch?: Record<string, unknown> | null;
	memoryCandidates?: string[];
	rawModelOutput?: string | null;
	parser?: {
		format?: 'plain' | 'tagged' | 'xml' | 'json';
		usedStructuredBlocks?: boolean;
	} | null;
}

/**
 * @description Канонический tg-first объект сообщения. Он намеренно отделён
 * от wire DTO Telegram archive и от UI `ChatTimelineItem`, чтобы одно и то же
 * сообщение можно было синхронизировать в разные поверхности без потери смысла.
 */
export interface CanonicalChatMessage {
	id: string;
	chatId: string;
	sender: CanonicalChatSender;
	timestampUtc: string;
	editTimestampUtc?: string | null;
	replyToMessageId?: string | null;
	replyPreview?: CanonicalChatReplyPreview | null;
	threadId?: string | null;
	parts: CanonicalChatMessagePart[];
	reactions?: CanonicalChatReaction[] | null;
	forward?: CanonicalChatForwardInfo | null;
	service?: CanonicalChatServiceInfo | null;
	media?: CanonicalChatMedia[] | null;
	entities?: CanonicalChatTextEntity[] | null;
	hidden?: CanonicalChatHiddenPayload | null;
	metadata?: Record<string, unknown> | null;
}

/**
 * @description Преобразует `parts[]` в plain-text строку для превью, SQLite
 * `content_text` и других мест, где rich renderer недоступен.
 * @param {CanonicalChatMessagePart[]} parts - Видимые части канонического сообщения
 * @returns {string}
 */
export function renderCanonicalChatPartsToText(
	parts: CanonicalChatMessagePart[]
): string {
	return parts
		.map(part => {
			const text = part.text.trim();
			if (!text) {
				return '';
			}
			if (part.kind === 'action') {
				return `*${text}*`;
			}
			return text;
		})
		.filter(Boolean)
		.join('\n\n')
		.trim();
}

/**
 * @description Текстовая форма всего канонического сообщения без скрытой части.
 * Сервисные сообщения деградируют в `service.text`, если обычных `parts[]` нет.
 * @param {CanonicalChatMessage} message - Каноническое сообщение
 * @returns {string}
 */
export function renderCanonicalChatMessageToText(
	message: CanonicalChatMessage
): string {
	const partsText = renderCanonicalChatPartsToText(message.parts || []);
	if (partsText) {
		return partsText;
	}
	return message.service?.text?.trim() || '';
}
