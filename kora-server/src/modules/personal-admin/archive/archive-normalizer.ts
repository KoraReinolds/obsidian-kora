/**
 * @module modules/personal-admin/archive/archive-normalizer
 *
 * @description Преобразует объекты GramJS в стабильные записи архива, пригодные
 * для SQLite. Нормализатор убирает из хранилища «сырые» особенности Telegram и
 * делает последующую AI-обработку предсказуемой за счёт единообразной формы данных.
 */

import { createHash } from 'node:crypto';
import type {
	ArchiveChatRecord,
	ArchiveMessageRecord,
	ArchiveParticipantRecord,
} from './archive-types.js';

/**
 * @description Нормализует диалоги и сообщения Telegram в записи архива.
 */
export class ArchiveNormalizer {
	/**
	 * @description Создаёт каноническую запись чата архива из peer и опциональных
	 * метаданных диалога, найденных при синке.
	 * @param {string} peer - Запрошенный идентификатор peer (username, id и т.д.).
	 * @param {any} dialog - Опциональные метаданные диалога от Telegram.
	 * @returns {ArchiveChatRecord} Строка чата, готовая для SQLite.
	 */
	normalizeChat(peer: string, dialog?: any): ArchiveChatRecord {
		const chatId = this.resolveChatId(peer, dialog);

		return {
			chatId,
			title: dialog?.title || dialog?.name || dialog?.entity?.title || peer,
			username: dialog?.username || dialog?.entity?.username || null,
			type: dialog?.isChannel
				? 'channel'
				: dialog?.isGroup
					? 'group'
					: dialog?.isUser
						? 'chat'
						: 'unknown',
			lastSyncedAt: new Date().toISOString(),
			extraJson: this.stringifyJson({
				peer,
				participantsCount:
					dialog?.participantsCount ??
					dialog?.entity?.participantsCount ??
					null,
				accessHash:
					dialog?.accessHash?.toString?.() ||
					dialog?.entity?.accessHash?.toString?.() ||
					null,
			}),
		};
	}

	/**
	 * @description Извлекает облегчённые метаданные отправителя из сообщения Telegram.
	 * @param {any} message - Сырое сообщение GramJS.
	 * @returns {ArchiveParticipantRecord | null} Строка участника или null, если отправителя нет.
	 */
	normalizeParticipant(message: any): ArchiveParticipantRecord | null {
		const senderId = this.resolveSenderId(message);
		if (!senderId) {
			return null;
		}

		return {
			participantId: senderId,
			username: message?.sender?.username || null,
			displayName:
				message?.sender?.firstName ||
				message?.postAuthor ||
				message?.sender?.title ||
				null,
			isBot: Boolean(message?.sender?.bot),
			extraJson: this.stringifyJson({
				lastKnownLastName: message?.sender?.lastName || null,
				postAuthor: message?.postAuthor || null,
			}),
		};
	}

	/**
	 * @description Преобразует одно сообщение Telegram в каноническую строку архива.
	 * Нормализация текста намеренно консервативна: сырой текст сохраняется,
	 * а AI-слои могут опираться на `textNormalized` для чанкинга.
	 * @param {string} chatId - Стабильный id чата в архиве.
	 * @param {any} message - Сырое сообщение GramJS.
	 * @returns {ArchiveMessageRecord} Строка сообщения, готовая для SQLite.
	 */
	normalizeMessage(chatId: string, message: any): ArchiveMessageRecord {
		const textRaw =
			typeof message?.message === 'string' ? message.message : null;
		const textNormalized = this.normalizeText(textRaw);
		const timestampUtc = new Date(message.date * 1000).toISOString();
		const editTimestampUtc = message.editDate
			? new Date(message.editDate * 1000).toISOString()
			: null;
		const replyToMessageId =
			message?.replyTo?.replyToMsgId ?? message?.replyTo?.replyToTopId ?? null;
		const threadId =
			message?.replyTo?.replyToTopId?.toString?.() ||
			message?.replyTo?.forumTopic?.toString?.() ||
			message?.groupedId?.toString?.() ||
			null;
		const senderId = this.resolveSenderId(message);

		const record: ArchiveMessageRecord = {
			messagePk: `telegram:${chatId}:${message.id}`,
			chatId,
			messageId: Number(message.id),
			source: 'gramjs',
			messageType: message?.className || 'message',
			senderId,
			senderName: message?.sender?.username || null,
			senderDisplayName:
				message?.sender?.firstName ||
				message?.sender?.title ||
				message?.postAuthor ||
				null,
			timestampUtc,
			editTimestampUtc,
			replyToMessageId,
			threadId,
			textRaw,
			textNormalized,
			reactionsJson: this.stringifyJson(message?.reactions ?? null),
			entitiesJson: this.stringifyJson(message?.entities ?? null),
			forwardJson: this.stringifyJson({
				fwdFrom: message?.fwdFrom ?? null,
				postAuthor: message?.postAuthor ?? null,
				views: message?.views ?? null,
				forwards: message?.forwards ?? null,
			}),
			serviceJson: this.stringifyJson({
				action: message?.action ?? null,
				post: Boolean(message?.post),
				pinned: Boolean(message?.pinned),
				silent: Boolean(message?.silent),
			}),
			mediaJson: this.stringifyJson(message?.media ?? null),
			metadataJson: this.stringifyJson({
				out: Boolean(message?.out),
				mentioned: Boolean(message?.mentioned),
				mediaUnread: Boolean(message?.mediaUnread),
				fromScheduled: Boolean(message?.fromScheduled),
				legacy: Boolean(message?.legacy),
				groupedId: message?.groupedId?.toString?.() || null,
				viaBotId: message?.viaBotId?.toString?.() || null,
			}),
			contentHash: this.hashContent({
				messageId: message.id,
				source: 'gramjs',
				messageType: message?.className || 'message',
				textNormalized,
				editTimestampUtc,
				replyToMessageId,
				threadId,
				reactions: message?.reactions ?? null,
			}),
		};

		return record;
	}

	/**
	 * @description Определяет стабильный id чата архива для схемы SQLite и будущих
	 * производных наборов данных.
	 * @param {string} peer - Peer, переданный в синхронизацию.
	 * @param {any} dialog - Опциональные метаданные диалога.
	 * @returns {string} Стабильный идентификатор чата.
	 */
	resolveChatId(peer: string, dialog?: any): string {
		return (
			dialog?.id?.toString?.() ||
			dialog?.entity?.id?.toString?.() ||
			dialog?.username ||
			dialog?.entity?.username ||
			peer
		);
	}

	private resolveSenderId(message: any): string | null {
		return (
			message?.senderId?.toString?.() ||
			message?.fromId?.userId?.toString?.() ||
			message?.fromId?.channelId?.toString?.() ||
			message?.sender?.id?.toString?.() ||
			null
		);
	}

	private normalizeText(text: string | null): string | null {
		if (!text) {
			return null;
		}

		return text
			.replace(/\r\n/g, '\n')
			.replace(/[ \t]+\n/g, '\n')
			.trim();
	}

	private stringifyJson(value: unknown): string | null {
		if (value === null || typeof value === 'undefined') {
			return null;
		}

		return JSON.stringify(value);
	}

	private hashContent(value: unknown): string {
		return createHash('sha256').update(JSON.stringify(value)).digest('hex');
	}
}
