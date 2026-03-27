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
}
