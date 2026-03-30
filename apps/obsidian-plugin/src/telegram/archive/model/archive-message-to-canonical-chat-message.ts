/**
 * @module telegram/archive/model/archive-message-to-canonical-chat-message
 * @description Adapter сырых архивных сообщений Telegram в канонический tg-first
 * формат чата. Archive остаётся источником wire DTO, но UI и future sync слой
 * работают уже поверх `CanonicalChatMessage`.
 */

import type {
	CanonicalChatMessage,
	CanonicalChatMedia,
	CanonicalChatReplyPreview,
} from '../../../../../../packages/contracts/src/canonical-chat-message';
import type { ArchiveMessage } from '../../../../../../packages/contracts/src/telegram';

export function getArchiveMessageAuthorLabel(message: ArchiveMessage): string {
	return (
		message.senderDisplayName ||
		message.senderName ||
		message.senderId ||
		'Unknown'
	);
}

export function getArchiveMessageInitials(message: ArchiveMessage): string {
	const label = getArchiveMessageAuthorLabel(message)
		.replace(/\s+/g, ' ')
		.trim();
	if (!label) return '?';
	const parts = label.split(' ').filter(Boolean);
	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}
	return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

export function getArchiveMessageMediaItems(
	message: ArchiveMessage
): Array<Record<string, unknown>> {
	const media = message.media as
		| { attachments?: Array<Record<string, unknown>> }
		| null
		| undefined;
	const attachments = media?.attachments;
	return Array.isArray(attachments) ? attachments : [];
}

function isArchiveImageAttachment(
	attachment: Record<string, unknown>
): boolean {
	const relativePath = String(attachment.relativePath || '');
	const mimeType = String(attachment.mimeType || '');
	return (
		mimeType.startsWith('image/') ||
		/\.(png|jpe?g|gif|webp)$/i.test(relativePath)
	);
}

function buildArchiveReplyPreview(
	message: ArchiveMessage,
	messagesById: Map<number, ArchiveMessage>
): CanonicalChatReplyPreview | null {
	if (!message.replyToMessageId) {
		return null;
	}
	const reply = messagesById.get(message.replyToMessageId);
	if (!reply) {
		return {
			label: `#${message.replyToMessageId}`,
			text: 'Сообщение вне текущего окна',
			targetId: String(message.replyToMessageId),
		};
	}
	return {
		label: getArchiveMessageAuthorLabel(reply),
		text:
			reply.textNormalized ||
			reply.textRaw ||
			(getArchiveMessageMediaItems(reply).length
				? 'Вложение'
				: 'Сообщение без текста'),
		targetId: String(reply.messageId),
	};
}

function mapArchiveMedia(
	message: ArchiveMessage,
	resolveAttachmentSrc?: (absolutePath: string) => string | null
): CanonicalChatMedia[] {
	return getArchiveMessageMediaItems(message).map((attachment, index) => {
		const absolutePath = String(attachment.absolutePath || '');
		const previewSrc =
			absolutePath && resolveAttachmentSrc
				? resolveAttachmentSrc(absolutePath)
				: absolutePath
					? `file:///${absolutePath.replace(/\\/g, '/')}`
					: null;
		return {
			id: `${message.messagePk}-attachment-${index}`,
			kind: String(attachment.kind || 'file'),
			name: String(
				attachment.fileName ||
					attachment.relativePath ||
					attachment.kind ||
					'Вложение'
			),
			description: '',
			previewSrc,
			isImage: isArchiveImageAttachment(attachment),
			size:
				typeof attachment.size === 'number' ? Number(attachment.size) : null,
			mimeType: attachment.mimeType ? String(attachment.mimeType) : null,
		} satisfies CanonicalChatMedia;
	});
}

/**
 * @description Преобразует одно архивное сообщение в канонический tg-first
 * формат без потери reply/media/forward/reactions.
 * @param {ArchiveMessage} message - Сообщение из SQLite-архива
 * @param {{ messagesById: Map<number, ArchiveMessage>; resolveAttachmentSrc?: ((absolutePath: string) => string | null) }} options - Контекст текущего окна
 * @returns {CanonicalChatMessage}
 */
export function archiveMessageToCanonicalChatMessage(
	message: ArchiveMessage,
	options: {
		messagesById: Map<number, ArchiveMessage>;
		resolveAttachmentSrc?: (absolutePath: string) => string | null;
	}
): CanonicalChatMessage {
	const reactions = (
		Array.isArray(message.reactions) ? message.reactions : []
	) as Array<Record<string, unknown>>;
	return {
		id: String(message.messageId),
		chatId: message.chatId,
		sender: {
			kind: 'other',
			id: message.senderId || null,
			name: message.senderName || null,
			displayName: getArchiveMessageAuthorLabel(message),
			initials: getArchiveMessageInitials(message),
			isSelf: false,
		},
		timestampUtc: message.timestampUtc,
		editTimestampUtc: message.editTimestampUtc || null,
		replyToMessageId: message.replyToMessageId
			? String(message.replyToMessageId)
			: null,
		replyPreview: buildArchiveReplyPreview(message, options.messagesById),
		threadId: message.threadId || null,
		parts: [
			{
				kind: 'speech',
				text: message.textNormalized || message.textRaw || '',
			},
		],
		reactions: reactions.map((reaction, index) => ({
			id: `${message.messagePk}-reaction-${index}`,
			label: String(reaction.emoji || reaction.type || 'reaction'),
			count: typeof reaction.count === 'number' ? Number(reaction.count) : null,
		})),
		forward: (message.forward as { forwardedFrom?: string } | null)
			?.forwardedFrom
			? {
					fromTitle: String(
						(message.forward as { forwardedFrom?: string }).forwardedFrom
					),
				}
			: null,
		service:
			message.messageType === 'service' || Boolean(message.service)
				? {
						type: message.messageType || 'service',
						text: message.textNormalized || message.textRaw || null,
					}
				: null,
		media: mapArchiveMedia(message, options.resolveAttachmentSrc),
		entities:
			message.entities &&
			typeof message.entities === 'object' &&
			Array.isArray((message.entities as { items?: unknown }).items)
				? (message.entities as { items: Array<Record<string, unknown>> }).items
						.map(entity => ({
							type: String(entity.type || 'entity'),
							offset: typeof entity.offset === 'number' ? entity.offset : 0,
							length: typeof entity.length === 'number' ? entity.length : 0,
							url: typeof entity.url === 'string' ? entity.url : undefined,
							language:
								typeof entity.language === 'string'
									? entity.language
									: undefined,
							customEmojiId:
								typeof entity.customEmojiId === 'string'
									? entity.customEmojiId
									: undefined,
						}))
						.filter(entity => entity.length > 0)
				: null,
		metadata: {
			source: message.source || null,
			messagePk: message.messagePk,
			messageType: message.messageType || null,
			contentHash: message.contentHash,
			archiveMetadata: message.metadata || null,
		},
	};
}
