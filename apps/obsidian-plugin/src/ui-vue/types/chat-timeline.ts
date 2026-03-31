/**
 * @module ui-vue/types/chat-timeline
 * @description Общие типы chat timeline для переиспользования одной и той же
 * ленты сообщений в нескольких feature. Архив Telegram и AI-чат должны
 * приводить свои доменные модели к этому нейтральному представлению, чтобы
 * улучшения рендера, media и reply-preview приезжали сразу в оба экрана.
 */

import type { Component } from 'vue';
import type { CanonicalChatMessagePart } from '../../../../../packages/contracts/src/canonical-chat-message';

export interface ChatTimelineReplyPreview {
	label: string;
	text: string;
	targetId?: string | null;
}

export interface ChatTimelineAttachment {
	id: string;
	kind: string;
	name: string;
	description?: string;
	previewSrc?: string | null;
	/** Медиа ещё генерируется (Eternal AI poll). */
	isGenerating?: boolean;
	isImage?: boolean;
	isVideo?: boolean;
	size?: number | null;
	mimeType?: string | null;
}

export interface ChatTimelineReaction {
	id: string;
	label: string;
	count?: number | null;
}

export interface ChatTimelineAccent {
	avatarBg?: string;
	avatarText?: string;
	bubbleBg?: string;
	bubbleBorder?: string;
}

/**
 * @description Снимок turn trace для полноэкранного debug-рендера одного turn.
 * Хранит плоские этапы runtime-пайплайна, а UI уже группирует их в Sources,
 * Prompt, Model Output, Parse и Diagnostics без дублирования пользовательских bubble.
 */
export interface ChatTimelineEternalArtifactEntry {
	id: string;
	type: string;
	context: string;
	sourceLabel: string;
	scopeLabel: string;
	text: string;
	score?: number | null;
}

/**
 * @description Один фрагмент, из которого собирается `assembledPrompt`.
 * Метаданные layer/source/priority нужны для explainability UI при раскрытии.
 */
export interface ChatTimelineEternalPromptFragmentEntry {
	id: string;
	layer: string;
	priority: number;
	source: string;
	text: string;
}

/**
 * @description Структурированная часть runtime extraction. Сюда попадает только
 * добавочная информация поверх обычного bubble: actions, memory candidates,
 * patch окружения и признак structured blocks.
 */
export interface ChatTimelineEternalRuntimeExtractionEntry {
	actions: string[];
	memoryCandidates: string[];
	environmentPatchPretty: string;
	usedStructuredBlocks: boolean;
}

export interface ChatTimelineEternalTracePayload {
	traceId: string;
	model: string;
	status: 'success' | 'error';
	promptText: string;
	rawResponse: string;
	runtimeExtraction: ChatTimelineEternalRuntimeExtractionEntry | null;
	recalledArtifacts: ChatTimelineEternalArtifactEntry[];
	promptFragments: ChatTimelineEternalPromptFragmentEntry[];
	timingsMs: Record<string, number>;
	errorText?: string | null;
	startedAt?: string;
	finishedAt?: string;
}

/**
 * @description Базовая часть любого элемента ленты. `rawPayload` используется
 * в raw-режиме, когда нужно показать JSON доменной модели, а не только нормализованный item.
 */
export interface ChatTimelineBaseItem {
	id: string;
	rawPayload?: unknown;
}

export interface ChatTimelineMessageItem extends ChatTimelineBaseItem {
	kind?: 'message';
	anchorId?: string;
	role?: 'user' | 'assistant' | 'system' | 'other';
	align?: 'start' | 'end' | 'center';
	/** Eternal AI: компактный чат без аватара, время в строке или внизу справа. */
	bubbleChrome?: 'default' | 'messenger';
	author?: string;
	initials?: string;
	meta?: string;
	text?: string;
	parts?: CanonicalChatMessagePart[];
	replyPreview?: ChatTimelineReplyPreview | null;
	forwardedLabel?: string | null;
	attachments?: ChatTimelineAttachment[];
	reactions?: ChatTimelineReaction[];
	badges?: string[];
	accent?: ChatTimelineAccent;
}

/**
 * @description Универсальный элемент с кастомным renderer-компонентом. Лента
 * остаётся только контейнером и скроллом, а фича подменяет представление turn.
 */
export interface ChatTimelineCustomItem extends ChatTimelineBaseItem {
	kind: 'custom';
	renderer: Component;
	rendererProps?: Record<string, unknown>;
}

/**
 * @description Один turn Eternal AI в обычном режиме: user/assistant рендерятся
 * как цельный блок, чтобы режим conversation не выглядел как «bubble + debug хвост».
 */
export interface ChatTimelineEternalConversationTurnItem extends ChatTimelineCustomItem {
	rendererProps: {
		turnId: string;
		userMessage?: ChatTimelineMessageItem | null;
		assistantMessage?: ChatTimelineMessageItem | null;
		trace?: ChatTimelineEternalTracePayload | null;
	};
}

/**
 * @description Один turn Eternal AI в debug-режиме: friendly output, raw trace
 * и все промежуточные данные живут в одном renderer-блоке.
 */
export interface ChatTimelineEternalDebugTurnItem extends ChatTimelineCustomItem {
	rendererProps: {
		turnId: string;
		userMessage?: ChatTimelineMessageItem | null;
		assistantMessage?: ChatTimelineMessageItem | null;
		turnStatus?: 'complete' | 'error' | 'pending' | null;
		trace?: ChatTimelineEternalTracePayload | null;
	};
}

export type ChatTimelineItem = ChatTimelineMessageItem | ChatTimelineCustomItem;
