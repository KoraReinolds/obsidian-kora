/**
 * @module telegram/archive/ports/archive-transport-port
 *
 * @description Контракт транспортного порта для экрана архива Telegram.
 */

import type {
	ArchiveBackfillRequest,
	ArchiveBackfillResult,
	ArchiveChat,
	ArchiveMessagesResponse,
	ArchiveSyncRequest,
	ArchiveSyncResult,
	GetArchivedMessagesRequest,
} from '../../../../packages/contracts/src/telegram';

/**
 * @description Набор операций транспорта, необходимых экрану архива.
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
	 * @description Удаляет чат и связанные с ним сообщения из локального архива.
	 * @param {string} chatId - Идентификатор чата в локальном архиве.
	 * @returns {Promise<{ deleted: boolean }>} Была ли строка чата и удалена ли она.
	 */
	deleteArchiveChat(chatId: string): Promise<{ deleted: boolean }>;
}
