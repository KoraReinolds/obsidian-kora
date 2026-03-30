/**
 * @module ui-vue/mappers/canonical-chat-message
 * @description Общий mapper из канонического tg-first сообщения в `ChatTimeline`.
 * Все feature должны приходить сюда после своего domain-level adapter-а, чтобы
 * reply/media/forward/reactions рендерились одинаково в archive и Eternal.
 */

import {
	renderCanonicalChatMessageToText,
	type CanonicalChatForwardInfo,
	type CanonicalChatMedia,
	type CanonicalChatMessage,
} from '../../../../../packages/contracts/src/canonical-chat-message';
import type {
	ChatTimelineAttachment,
	ChatTimelineMessageItem,
	ChatTimelineReaction,
	ChatTimelineReplyPreview,
} from '../types';

export interface CanonicalChatMessageToTimelineOptions {
	anchorId?: string;
	role?: ChatTimelineMessageItem['role'];
	align?: ChatTimelineMessageItem['align'];
	bubbleChrome?: ChatTimelineMessageItem['bubbleChrome'];
	/** Пустые строки скрывают имя/инициалы в пузыре (мессенджер Eternal AI). */
	author?: string;
	initials?: string;
	meta?: string;
	replyPreview?: ChatTimelineReplyPreview | null;
	badges?: string[];
	accent?: ChatTimelineMessageItem['accent'];
	rawPayload?: unknown;
}

function buildInitials(label: string): string {
	const normalized = label.replace(/\s+/g, ' ').trim();
	if (!normalized) {
		return '?';
	}
	const parts = normalized.split(' ').filter(Boolean);
	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}
	return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function resolveRole(
	message: CanonicalChatMessage
): ChatTimelineMessageItem['role'] {
	if (message.sender.kind === 'user') {
		return 'user';
	}
	if (message.sender.kind === 'assistant') {
		return 'assistant';
	}
	if (message.sender.kind === 'system' || message.sender.kind === 'service') {
		return 'system';
	}
	return 'other';
}

function resolveAlign(
	message: CanonicalChatMessage
): ChatTimelineMessageItem['align'] {
	if (message.sender.kind === 'user' && message.sender.isSelf !== false) {
		return 'end';
	}
	if (message.sender.kind === 'system' || message.sender.kind === 'service') {
		return 'center';
	}
	return 'start';
}

function resolveAuthor(message: CanonicalChatMessage): string {
	if (message.sender.displayName?.trim()) {
		return message.sender.displayName.trim();
	}
	if (message.sender.name?.trim()) {
		return message.sender.name.trim();
	}
	if (message.sender.kind === 'assistant') {
		return 'Assistant';
	}
	if (message.sender.kind === 'system') {
		return 'System';
	}
	if (message.sender.kind === 'service') {
		return 'Service';
	}
	if (message.sender.kind === 'user') {
		return 'You';
	}
	return 'Unknown';
}

function resolveInitials(
	message: CanonicalChatMessage,
	author: string
): string {
	if (message.sender.initials?.trim()) {
		return message.sender.initials.trim();
	}
	return buildInitials(author);
}

function resolveForwardedLabel(
	forward: CanonicalChatForwardInfo | null | undefined
): string | null {
	const label =
		forward?.fromTitle || forward?.fromName || forward?.fromId || null;
	return label ? `Переслано из ${label}` : null;
}

function mapMediaToAttachments(
	media: CanonicalChatMedia[] | null | undefined
): ChatTimelineAttachment[] | undefined {
	if (!media?.length) {
		return undefined;
	}
	return media.map(item => ({
		id: item.id,
		kind: item.kind,
		name: item.name,
		description: item.description,
		previewSrc: item.previewSrc ?? item.sourceUrl ?? null,
		isGenerating: item.isGenerating,
		isImage: item.isImage,
		isVideo: item.isVideo,
		size: item.size ?? null,
		mimeType: item.mimeType ?? null,
	}));
}

function mapReactions(
	message: CanonicalChatMessage
): ChatTimelineReaction[] | undefined {
	if (!message.reactions?.length) {
		return undefined;
	}
	return message.reactions.map(reaction => ({
		id: reaction.id,
		label: reaction.label,
		count: reaction.count ?? null,
	}));
}

/**
 * @description Универсальная проекция канонического tg-first сообщения в bubble
 * UI. Feature может переопределить только display-level поля, не меняя общую
 * логику reply/media/forward/reactions.
 * @param {CanonicalChatMessage} message - Каноническое сообщение
 * @param {CanonicalChatMessageToTimelineOptions} [options] - display overrides
 * @returns {ChatTimelineMessageItem}
 */
export function canonicalChatMessageToTimelineMessage(
	message: CanonicalChatMessage,
	options: CanonicalChatMessageToTimelineOptions = {}
): ChatTimelineMessageItem {
	const author =
		options.author !== undefined ? options.author : resolveAuthor(message);
	const initials =
		options.initials !== undefined
			? options.initials
			: resolveInitials(message, author);
	return {
		id: message.id,
		rawPayload: options.rawPayload ?? message,
		kind: 'message',
		anchorId: options.anchorId,
		role: options.role ?? resolveRole(message),
		align: options.align ?? resolveAlign(message),
		bubbleChrome: options.bubbleChrome,
		author,
		initials,
		meta: options.meta,
		text: renderCanonicalChatMessageToText(message),
		parts: message.parts,
		replyPreview: options.replyPreview ?? message.replyPreview ?? null,
		forwardedLabel: resolveForwardedLabel(message.forward),
		attachments: mapMediaToAttachments(message.media),
		reactions: mapReactions(message),
		badges: options.badges,
		accent: options.accent,
	};
}
