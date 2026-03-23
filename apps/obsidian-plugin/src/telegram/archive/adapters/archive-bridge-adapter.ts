/**
 * @module telegram/archive/adapters/archive-bridge-adapter
 *
 * @description Adapter that maps existing `ArchiveBridge` into the archive screen transport port.
 */

import type { ArchiveBridge } from '../../transport';
import type { ArchiveTransportPort } from '../ports/archive-transport-port';

/**
 * @description Создаёт порт фичи архива на основе существующего моста.
 * @param {ArchiveBridge} bridge - Transport bridge from the Obsidian plugin.
 * @returns {ArchiveTransportPort} Port for the archive screen feature.
 */
export function createArchiveBridgeAdapter(
	bridge: ArchiveBridge
): ArchiveTransportPort {
	return {
		getArchivedChats: bridge.getArchivedChats.bind(bridge),
		getArchivedMessages: bridge.getArchivedMessages.bind(bridge),
		syncArchive: bridge.syncArchive.bind(bridge),
		backfillArchive: bridge.backfillArchive.bind(bridge),
		deleteArchiveChat: bridge.deleteArchivedChat.bind(bridge),
	};
}
