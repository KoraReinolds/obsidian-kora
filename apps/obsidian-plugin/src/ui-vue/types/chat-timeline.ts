/**
 * @module ui-vue/types/chat-timeline
 * @description Общие типы chat timeline для переиспользования одной и той же
 * ленты сообщений в нескольких feature. Архив Telegram и AI-чат должны
 * приводить свои доменные модели к этому нейтральному представлению, чтобы
 * улучшения рендера, media и reply-preview приезжали сразу в оба экрана.
 */

import type { Component } from 'vue';

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
 * Поля уже сериализованы в удобные строки, чтобы renderer не дублировал форматирование.
 */
export interface ChatTimelineEternalTracePayload {
	traceId: string;
	model: string;
	status: 'success' | 'error';
	inputText: string;
	promptText: string;
	rawResponse: string;
	parsedResponsePretty: string;
	recalledArtifactsPretty: string;
	promptFragmentsPretty: string;
	timingsPretty: string;
	errorText?: string | null;
	startedAt?: string;
	finishedAt?: string;
}

/**
 * @description Совместимость со старым инлайн-инспектором. Новый turn-debug
 * renderer больше не использует `expanded`, но тип оставляем, чтобы старый
 * компонент продолжал компилироваться до полной очистки кода.
 */
export type ChatTimelineEternalInspectorPayload =
	ChatTimelineEternalTracePayload & {
		expanded?: boolean;
	};

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
	author?: string;
	initials?: string;
	meta?: string;
	text?: string;
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
		trace?: ChatTimelineEternalTracePayload | null;
	};
}

export type ChatTimelineItem = ChatTimelineMessageItem | ChatTimelineCustomItem;
