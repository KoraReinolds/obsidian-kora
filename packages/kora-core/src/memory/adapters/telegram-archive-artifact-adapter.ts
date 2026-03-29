/**
 * @module memory/adapters/telegram-archive-artifact-adapter
 * @anchor <memory_artifact_pipeline>
 * @description Адаптер Telegram archive к общему memory-слою. В MVP он умеет
 * нормализовать сообщения в `SourceUnit` и собирать из них dialogue window artifacts
 * по размеру окна и временному разрыву между сообщениями.
 */

import type { ArchiveMessage } from '../../../../contracts/src/telegram.js';
import { buildArtifact } from '../model/artifact-pipeline.js';
import type { Artifact, SourceUnit } from '../model/types.js';

export interface BuildSourceUnitsFromArchiveMessagesOptions {
	chatId: string;
}

export interface BuildDialogueArtifactsFromArchiveMessagesOptions {
	chatId: string;
	chatTitle?: string;
	scopeId?: string;
	windowSize?: number;
	gapMinutes?: number;
	includeServiceMessages?: boolean;
	includeReplies?: boolean;
	includeMediaOnlyMessages?: boolean;
}

function getAuthorLabel(message: ArchiveMessage): string {
	return (
		message.senderDisplayName ||
		message.senderName ||
		message.senderId ||
		'Unknown'
	);
}

function getForwardContext(message: ArchiveMessage): string | null {
	const forwardedFrom = (message.forward as { forwardedFrom?: string } | null)
		?.forwardedFrom;
	return forwardedFrom ? `Forwarded from ${forwardedFrom}` : null;
}

function getMediaItems(
	message: ArchiveMessage
): Array<Record<string, unknown>> {
	const media = message.media as
		| { attachments?: Array<Record<string, unknown>> }
		| null
		| undefined;
	return Array.isArray(media?.attachments) ? media.attachments || [] : [];
}

function getMediaDescriptions(message: ArchiveMessage): string[] {
	return getMediaItems(message)
		.map(item =>
			String(item.fileName || item.relativePath || item.kind || '').trim()
		)
		.filter(Boolean);
}

function shouldIncludeMessage(
	message: ArchiveMessage,
	options: BuildDialogueArtifactsFromArchiveMessagesOptions
): boolean {
	const isService =
		message.messageType === 'service' || Boolean(message.service);
	const hasText = Boolean(message.textNormalized || message.textRaw);
	const hasMedia = getMediaItems(message).length > 0;
	const hasReply = Boolean(message.replyToMessageId);

	if (options.includeServiceMessages === false && isService) {
		return false;
	}
	if (options.includeReplies === false && hasReply) {
		return false;
	}
	if (options.includeMediaOnlyMessages === false && hasMedia && !hasText) {
		return false;
	}
	return true;
}

/**
 * @description Нормализует архивные сообщения Telegram в `SourceUnit[]`.
 * @param {ArchiveMessage[]} messages - Сообщения из локального архива.
 * @param {BuildSourceUnitsFromArchiveMessagesOptions} options - Контекст чата.
 * @returns {SourceUnit[]}
 */
export function buildSourceUnitsFromArchiveMessages(
	messages: ArchiveMessage[],
	options: BuildSourceUnitsFromArchiveMessagesOptions
): SourceUnit[] {
	return messages.map(message => {
		const author = getAuthorLabel(message);
		const text = (message.textNormalized || message.textRaw || '').trim();
		const notes = [
			message.replyToMessageId ? `Reply to #${message.replyToMessageId}` : null,
			getForwardContext(message),
		].filter(Boolean) as string[];
		const mediaDescriptions = getMediaDescriptions(message);
		if (mediaDescriptions.length > 0) {
			notes.push(`Media: ${mediaDescriptions.join(', ')}`);
		}

		const body = [author, ...notes, text || 'No text']
			.filter(Boolean)
			.join('\n');
		const unitType: SourceUnit['unitType'] =
			message.messageType === 'service' || Boolean(message.service)
				? 'event'
				: 'message';

		return {
			id: message.messagePk,
			sourceType: 'telegram_chat',
			sourceId: options.chatId,
			unitType,
			text: body,
			author,
			timestamp: message.timestampUtc,
			contextPath: [options.chatId],
			metadata: {
				messageId: message.messageId,
				replyToMessageId: message.replyToMessageId,
				messageType: message.messageType,
				messagePk: message.messagePk,
				senderId: message.senderId,
				forwardedFrom:
					(message.forward as { forwardedFrom?: string } | null)
						?.forwardedFrom || null,
				hasMedia: mediaDescriptions.length > 0,
				textRaw: message.textRaw || null,
				textNormalized: message.textNormalized || null,
				notes,
				contentHash: message.contentHash,
			},
		};
	});
}

function buildWindowTitle(
	chatTitle: string | undefined,
	index: number,
	units: SourceUnit[]
): string {
	const title = chatTitle || units[0]?.sourceId || 'Telegram chat';
	const firstMessageId = units[0]?.metadata?.messageId;
	const lastMessageId = units[units.length - 1]?.metadata?.messageId;
	const range =
		typeof firstMessageId === 'number' && typeof lastMessageId === 'number'
			? `${firstMessageId}-${lastMessageId}`
			: `window-${index + 1}`;
	return `${title} · ${range}`;
}

function buildDialogueContentType(
	units: SourceUnit[]
): 'telegram_post' | 'telegram_comment' {
	return units.some(unit => typeof unit.metadata?.replyToMessageId === 'number')
		? 'telegram_comment'
		: 'telegram_post';
}

/**
 * @description Собирает из архивных сообщений dialogue window artifacts общего формата.
 * @param {ArchiveMessage[]} messages - Сообщения чата.
 * @param {BuildDialogueArtifactsFromArchiveMessagesOptions} options - Параметры окна.
 * @returns {Artifact[]}
 */
export function buildDialogueArtifactsFromArchiveMessages(
	messages: ArchiveMessage[],
	options: BuildDialogueArtifactsFromArchiveMessagesOptions
): Artifact[] {
	const sourceUnits = buildSourceUnitsFromArchiveMessages(
		messages.filter(message => shouldIncludeMessage(message, options)),
		{
			chatId: options.chatId,
		}
	).sort((left, right) => {
		const leftTs = new Date(left.timestamp || 0).getTime();
		const rightTs = new Date(right.timestamp || 0).getTime();
		return leftTs - rightTs;
	});

	const windowSize = Math.max(1, Math.floor(options.windowSize || 6));
	const gapMs = Math.max(1, Math.floor(options.gapMinutes || 30)) * 60 * 1000;
	const windows: SourceUnit[][] = [];
	let currentWindow: SourceUnit[] = [];
	let lastTimestampMs = 0;

	for (const unit of sourceUnits) {
		const currentTimestampMs = new Date(unit.timestamp || 0).getTime();
		const exceedsGap =
			currentWindow.length > 0 && currentTimestampMs - lastTimestampMs > gapMs;
		const exceedsSize = currentWindow.length >= windowSize;
		if (currentWindow.length > 0 && (exceedsGap || exceedsSize)) {
			windows.push(currentWindow);
			currentWindow = [];
		}
		currentWindow.push(unit);
		lastTimestampMs = currentTimestampMs;
	}

	if (currentWindow.length > 0) {
		windows.push(currentWindow);
	}

	return windows.map((units, index) => {
		const startTimestamp = units[0]?.timestamp || new Date().toISOString();
		const endTimestamp =
			units[units.length - 1]?.timestamp || new Date().toISOString();
		const title = buildWindowTitle(options.chatTitle, index, units);
		const contentType = buildDialogueContentType(units);
		const text = units.map(unit => unit.text).join('\n\n');

		return buildArtifact({
			artifactType: 'dialogue_window',
			context: 'source',
			sourceType: 'telegram_chat',
			sourceId: options.chatId,
			scope: {
				kind: 'source',
				id: options.scopeId || options.chatId,
			},
			text,
			embeddingText: [title, text].filter(Boolean).join('\n\n'),
			sourceUnits: units,
			sourceRefs: units.map(
				unit => `${options.chatId}:${unit.metadata?.messageId || unit.id}`
			),
			metadata: {
				title,
				chatId: options.chatId,
				chatTitle: options.chatTitle || null,
				contentType,
				messageIds: units
					.map(unit => unit.metadata?.messageId)
					.filter((value): value is number => typeof value === 'number'),
				messagePks: units.map(unit => unit.id),
				sourceAuthors: [
					...new Set(units.map(unit => unit.author).filter(Boolean)),
				],
				startTimestampUtc: startTimestamp,
				endTimestampUtc: endTimestamp,
			},
			createdAt: startTimestamp,
			updatedAt: endTimestamp,
		});
	});
}
