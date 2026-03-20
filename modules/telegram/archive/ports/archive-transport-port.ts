/**
 * @module telegram/archive/ports/archive-transport-port
 *
 * @description Transport port contract for the Telegram archive screen feature.
 */

import type {
	ArchiveBackfillRequest,
	ArchiveBackfillResult,
	ArchiveChat,
	ArchiveMessagesResponse,
	ArchiveSyncRequest,
	ArchiveSyncResult,
	GetArchivedMessagesRequest,
} from '../../../../telegram-types';

/**
 * @description Contract of transport operations required by archive screen feature.
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
	 * @description Deletes a chat and its related messages from local archive.
	 * @param {string} chatId - Chat identifier in local archive.
	 * @returns {Promise<{ deleted: boolean }>} Whether the chat row existed and was deleted.
	 */
	deleteArchiveChat(chatId: string): Promise<{ deleted: boolean }>;
}
