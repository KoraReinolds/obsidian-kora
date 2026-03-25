/**
 * @module modules/personal-admin/archive/archive-desktop-import-service
 * @description Импортирует архив Telegram Desktop (`result.json`) в локальный SQLite-архив.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ArchiveDesktopImportResult } from '../../../../../packages/contracts/src/telegram.js';
import { ArchiveRepository } from './archive-repository.js';
import type {
	ArchiveChatRecord,
	ArchiveMessageRecord,
	ArchiveParticipantRecord,
} from './archive-types.js';

interface TelegramDesktopExport {
	name?: string;
	type?: string;
	id?: number | string;
	messages?: TelegramDesktopMessage[];
}

interface TelegramDesktopMessage {
	id: number;
	type?: string;
	date?: string;
	edited?: string;
	from?: string;
	from_id?: string;
	reply_to_message_id?: number;
	reply_to_peer_id?: string;
	forwarded_from?: string;
	forwarded_from_id?: string;
	saved_from?: string;
	text?: string | Array<string | Record<string, unknown>>;
	text_entities?: Array<Record<string, unknown>>;
	reactions?: Array<Record<string, unknown>>;
	action?: string;
	actor?: string;
	actor_id?: string;
	file?: string;
	file_name?: string;
	file_size?: number;
	photo?: string;
	photo_file_size?: number;
	thumbnail?: string;
	thumbnail_file_size?: number;
	media_type?: string;
	mime_type?: string;
	sticker_emoji?: string;
	width?: number;
	height?: number;
	duration_seconds?: number;
	poll?: Record<string, unknown>;
	via_bot?: string;
	inline_bot_buttons?: Array<Record<string, unknown>>;
	boosts?: Array<Record<string, unknown>>;
	members?: Array<Record<string, unknown>>;
	inviter?: string;
	media_spoiler?: boolean;
}

/**
 * @description Сервис импорта архивов Telegram Desktop.
 */
export class ArchiveDesktopImportService {
	constructor(private readonly repository: ArchiveRepository) {}

	/**
	 * @description Импортирует один export-каталог Telegram Desktop в SQLite.
	 * @param {string} folderPath - Путь к папке экспорта.
	 * @returns {ArchiveDesktopImportResult} Итог импорта.
	 */
	importFolder(folderPath: string): ArchiveDesktopImportResult {
		const resolvedFolderPath = path.resolve(folderPath);
		const resultJsonPath = path.join(resolvedFolderPath, 'result.json');
		if (!fs.existsSync(resultJsonPath)) {
			throw new Error(`Файл result.json не найден: ${resultJsonPath}`);
		}

		const parsed = JSON.parse(
			fs.readFileSync(resultJsonPath, 'utf8')
		) as TelegramDesktopExport;
		return this.importExportData(
			parsed,
			path.basename(resolvedFolderPath),
			resolvedFolderPath
		);
	}

	/**
	 * @description Импортирует уже распарсенный export Telegram Desktop.
	 * @param {Record<string, unknown>} exportData - Содержимое `result.json`.
	 * @param {string} folderLabel - Подпись выбранной папки для UI и метаданных.
	 * @returns {ArchiveDesktopImportResult} Итог импорта.
	 */
	importParsedExport(
		exportData: Record<string, unknown>,
		folderLabel = 'telegram-desktop-export'
	): ArchiveDesktopImportResult {
		return this.importExportData(
			exportData as TelegramDesktopExport,
			folderLabel,
			folderLabel
		);
	}

	private importExportData(
		parsed: TelegramDesktopExport,
		folderLabel: string,
		folderPath: string
	): ArchiveDesktopImportResult {
		const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
		const chat = this.normalizeChat(parsed, folderLabel, folderPath);

		this.repository.upsertChat(chat);

		const counters = {
			inserted: 0,
			updated: 0,
			skipped: 0,
		};

		this.repository.transaction(() => {
			for (const rawMessage of messages) {
				const participant = this.normalizeParticipant(rawMessage);
				this.repository.upsertParticipant(participant);
				const result = this.repository.upsertMessage(
					this.normalizeMessage(chat.chatId, rawMessage, folderPath)
				);
				counters[result] += 1;
			}
		});

		const finishedAt = new Date().toISOString();
		this.repository.upsertChat({
			...chat,
			lastSyncedAt: finishedAt,
		});

		return {
			chatId: chat.chatId,
			title: chat.title,
			source: 'telegram-desktop-export',
			inserted: counters.inserted,
			updated: counters.updated,
			skipped: counters.skipped,
			totalProcessed: messages.length,
			messagesInExport: messages.length,
			exportedAt: finishedAt,
			folderPath,
			mode: 'desktop-export',
		};
	}

	private normalizeChat(
		exportData: TelegramDesktopExport,
		folderLabel: string,
		folderPath: string
	): ArchiveChatRecord {
		const chatId =
			exportData.id !== undefined && exportData.id !== null
				? String(exportData.id)
				: `desktop-export:${path.basename(folderLabel)}`;
		const exportType = exportData.type || 'unknown';
		return {
			chatId,
			title: exportData.name || path.basename(folderLabel),
			username: null,
			type:
				exportType === 'public_supergroup' ||
				exportType === 'private_supergroup'
					? 'group'
					: exportType === 'private_channel' || exportType === 'public_channel'
						? 'channel'
						: exportType === 'personal_chat'
							? 'chat'
							: 'unknown',
			lastSyncedAt: new Date().toISOString(),
			extraJson: JSON.stringify({
				source: 'telegram-desktop-export',
				exportType,
				folderPath,
				folderLabel,
			}),
		};
	}

	private normalizeParticipant(
		message: TelegramDesktopMessage
	): ArchiveParticipantRecord | null {
		const participantId = message.from_id || message.actor_id || null;
		const displayName = message.from || message.actor || null;
		if (!participantId && !displayName) {
			return null;
		}

		return {
			participantId: participantId || `desktop-name:${displayName}`,
			username: null,
			displayName,
			isBot: false,
			extraJson: JSON.stringify({
				source: 'telegram-desktop-export',
			}),
		};
	}

	private normalizeMessage(
		chatId: string,
		message: TelegramDesktopMessage,
		folderPath: string
	): ArchiveMessageRecord {
		const textRaw = this.extractTextRaw(message.text);
		const textNormalized = this.normalizeText(textRaw);
		const attachments = this.collectAttachments(message, folderPath);
		const links = this.collectLinks(message.text_entities);
		const senderId = message.from_id || message.actor_id || null;
		const senderDisplayName = message.from || message.actor || null;
		const messageType = message.type || 'message';
		const metadata = {
			source: 'telegram-desktop-export',
			dateUnixtime:
				(message as unknown as { date_unixtime?: string }).date_unixtime ??
				null,
			editedUnixtime:
				(message as unknown as { edited_unixtime?: string }).edited_unixtime ??
				null,
			replyToPeerId: message.reply_to_peer_id ?? null,
			savedFrom: message.saved_from ?? null,
			viaBot: message.via_bot ?? null,
			inlineBotButtons: message.inline_bot_buttons ?? null,
			boosts: message.boosts ?? null,
			members: message.members ?? null,
			inviter: message.inviter ?? null,
			links,
			poll: message.poll ?? null,
			textStructure:
				Array.isArray(message.text) && message.text.length > 0
					? message.text
					: null,
		};

		return {
			messagePk: `telegram:${chatId}:${message.id}`,
			chatId,
			messageId: Number(message.id),
			source: 'telegram-desktop-export',
			messageType,
			senderId,
			senderName: null,
			senderDisplayName,
			timestampUtc: new Date(message.date || Date.now()).toISOString(),
			editTimestampUtc: message.edited
				? new Date(message.edited).toISOString()
				: null,
			replyToMessageId: message.reply_to_message_id ?? null,
			threadId:
				message.reply_to_peer_id ||
				(message.reply_to_message_id
					? `reply:${message.reply_to_message_id}`
					: null),
			textRaw,
			textNormalized,
			reactionsJson: this.stringifyJson(message.reactions ?? null),
			entitiesJson: this.stringifyJson(message.text_entities ?? null),
			forwardJson: this.stringifyJson({
				forwardedFrom: message.forwarded_from ?? null,
				forwardedFromId: message.forwarded_from_id ?? null,
				savedFrom: message.saved_from ?? null,
			}),
			serviceJson: this.stringifyJson({
				action: message.action ?? null,
				actor: message.actor ?? null,
				actorId: message.actor_id ?? null,
				inviter: message.inviter ?? null,
			}),
			mediaJson: this.stringifyJson({
				mediaType: message.media_type ?? null,
				mimeType: message.mime_type ?? null,
				attachments,
				width: message.width ?? null,
				height: message.height ?? null,
				durationSeconds: message.duration_seconds ?? null,
				stickerEmoji: message.sticker_emoji ?? null,
				mediaSpoiler: message.media_spoiler ?? null,
			}),
			metadataJson: this.stringifyJson(metadata),
			contentHash: this.hashContent({
				source: 'telegram-desktop-export',
				messageType,
				textNormalized,
				replyToMessageId: message.reply_to_message_id ?? null,
				editTimestampUtc: message.edited ?? null,
				reactions: message.reactions ?? null,
				attachments,
				links,
				serviceAction: message.action ?? null,
				poll: message.poll ?? null,
			}),
		};
	}

	private collectAttachments(
		message: TelegramDesktopMessage,
		folderPath: string
	): Array<Record<string, unknown>> {
		const attachments: Array<Record<string, unknown>> = [];
		const pushAttachment = (
			kind: string,
			relativePath: string | undefined,
			size?: number,
			extra?: Record<string, unknown>
		): void => {
			if (!relativePath) return;
			const included =
				typeof relativePath === 'string' &&
				!relativePath.startsWith('(File not included');
			const hasRealBasePath = path.isAbsolute(folderPath);
			attachments.push({
				kind,
				relativePath,
				absolutePath:
					included && hasRealBasePath
						? path.join(folderPath, relativePath)
						: null,
				included,
				size: size ?? null,
				...extra,
			});
		};

		pushAttachment('photo', message.photo, message.photo_file_size);
		pushAttachment('file', message.file, message.file_size, {
			fileName: message.file_name ?? null,
			mimeType: message.mime_type ?? null,
			mediaType: message.media_type ?? null,
		});
		pushAttachment('thumbnail', message.thumbnail, message.thumbnail_file_size);
		return attachments;
	}

	private collectLinks(
		textEntities?: Array<Record<string, unknown>>
	): Array<Record<string, unknown>> {
		if (!Array.isArray(textEntities)) {
			return [];
		}
		return textEntities
			.filter(entity => typeof entity?.href === 'string')
			.map(entity => ({
				type: entity.type ?? 'text_link',
				text: entity.text ?? null,
				href: entity.href,
			}));
	}

	private extractTextRaw(text: TelegramDesktopMessage['text']): string | null {
		if (typeof text === 'string') {
			return text;
		}
		if (!Array.isArray(text)) {
			return null;
		}

		const result = text
			.map(part => {
				if (typeof part === 'string') {
					return part;
				}
				if (part && typeof part === 'object' && 'text' in part) {
					return typeof part.text === 'string' ? part.text : '';
				}
				return '';
			})
			.join('');

		return result || null;
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
