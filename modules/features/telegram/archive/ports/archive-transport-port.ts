/**
 * @module features/telegram/archive/ports/archive-transport-port
 *
 * @description Feature-порт для экрана архива Telegram.
 * Реализуется существующим bridge-слоем через адаптер.
 */

import type {
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
}
