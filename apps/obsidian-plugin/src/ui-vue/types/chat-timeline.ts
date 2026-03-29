/**
 * @module ui-vue/types/chat-timeline
 * @description Общие типы chat timeline для переиспользования одной и той же
 * ленты сообщений в нескольких feature. Архив Telegram и AI-чат должны
 * приводить свои доменные модели к этому нейтральному представлению, чтобы
 * улучшения рендера, media и reply-preview приезжали сразу в оба экрана.
 */

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
 * @description Снимок turn trace для инлайн-отладки в ленте (Eternal AI и др.).
 * Родитель передаёт `expanded`; по клику эмитится переключение, composable обновляет набор.
 */
export interface ChatTimelineEternalInspectorPayload {
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
	expanded: boolean;
}

export interface ChatTimelineItem {
	id: string;
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
	/** Eternal AI: опциональный блок отладки под пузырём (вторая зона строки ленты). */
	timelineInspector?: ChatTimelineEternalInspectorPayload;
}
