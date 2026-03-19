/**
 * @module features/telegram/archive/adapters/archive-bridge-adapter
 *
 * @description Адаптер существующего `ArchiveBridge` к feature-порту.
 */

import type { ArchiveBridge } from '../../../../telegram';
import type { ArchiveTransportPort } from '../ports/archive-transport-port';

/**
 * @description Создает feature-port на основе существующего bridge.
 * @param {ArchiveBridge} bridge - Transport bridge Obsidian плагина.
 * @returns {ArchiveTransportPort} Порт для archive feature.
 */
export function createArchiveBridgeAdapter(
	bridge: ArchiveBridge
): ArchiveTransportPort {
	return {
		getArchivedChats: bridge.getArchivedChats.bind(bridge),
		getArchivedMessages: bridge.getArchivedMessages.bind(bridge),
		syncArchive: bridge.syncArchive.bind(bridge),
	};
}
