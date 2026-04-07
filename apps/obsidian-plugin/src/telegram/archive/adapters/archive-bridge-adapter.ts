/**
 * @module telegram/archive/adapters/archive-bridge-adapter
 *
 * @description Adapter that maps existing `ArchiveBridge` into the archive screen transport port.
 */

import type {
	ArchiveBackfillRequest,
	ArchiveSyncRequest,
} from '../../../../../../packages/contracts/src/telegram';
import type { ArchiveBridge } from '../../transport';
import type { ArchiveTransportPort } from '../ports/archive-transport-port';

interface ArchiveBridgeAdapterOptions {
	defaultIntegrationId?: string;
}

/**
 * @description Создаёт порт фичи архива на основе существующего моста.
 * @param {ArchiveBridge} bridge - Transport bridge from the Obsidian plugin.
 * @param {ArchiveBridgeAdapterOptions} [options] - Необязательные defaults для archive-запросов.
 * @returns {ArchiveTransportPort} Port for the archive screen feature.
 */
export function createArchiveBridgeAdapter(
	bridge: ArchiveBridge,
	options: ArchiveBridgeAdapterOptions = {}
): ArchiveTransportPort {
	const resolveSyncRequest = (
		request: ArchiveSyncRequest
	): ArchiveSyncRequest => ({
		...request,
		integrationId:
			request.integrationId || options.defaultIntegrationId || undefined,
	});
	const resolveBackfillRequest = (
		request: ArchiveBackfillRequest
	): ArchiveBackfillRequest => ({
		...request,
		integrationId:
			request.integrationId || options.defaultIntegrationId || undefined,
	});

	return {
		getArchivedChats: bridge.getArchivedChats.bind(bridge),
		getArchivedMessages: bridge.getArchivedMessages.bind(bridge),
		importDesktopArchive: bridge.importDesktopArchive.bind(bridge),
		syncArchive: request => bridge.syncArchive(resolveSyncRequest(request)),
		backfillArchive: request =>
			bridge.backfillArchive(resolveBackfillRequest(request)),
		deleteArchiveChat: bridge.deleteArchivedChat.bind(bridge),
	};
}
