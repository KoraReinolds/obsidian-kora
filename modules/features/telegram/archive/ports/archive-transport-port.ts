/**
 * @module features/telegram/archive/ports/archive-transport-port
 *
 * @description Feature-порт для экрана архива Telegram.
 * Реализуется существующим bridge-слоем через адаптер.
 */

import type {
	ArchiveBackfillRequest,
	ArchiveBackfillResult,
	ArchiveChat,
	ArchiveMessagesResponse,
	ArchiveSyncRequest,
	ArchiveSyncResult,
	GetArchivedMessagesRequest,
} from '../../../../../telegram-types';

/**
 * @description Контракт transport-операций, необходимых archive feature.
 */
export interface ArchiveTransportPort {
	getArchivedChats(limit?: number): Promise<ArchiveChat[]>;
	getArchivedMessages(
		request: GetArchivedMessagesRequest
	): Promise<ArchiveMessagesResponse>;
	syncArchive(request: ArchiveSyncRequest): Promise<ArchiveSyncResult>;
	backfillArchive(
		request: ArchiveBackfillRequest
	): Promise<ArchiveBackfillResult>;
	/**
	 * @description Удаляет чат и связанные сообщения из локального архива.
	 * @param {string} chatId - Идентификатор чата.
	 * @returns {Promise<{ deleted: boolean }>} Удалена ли строка чата (false, если чата не было в БД).
	 */
	deleteArchiveChat(chatId: string): Promise<{ deleted: boolean }>;
}
