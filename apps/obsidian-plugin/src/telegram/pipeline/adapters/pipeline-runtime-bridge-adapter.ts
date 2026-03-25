/**
 * @module telegram/pipeline/adapters/pipeline-runtime-bridge-adapter
 *
 * @description Адаптер, который склеивает существующие archive- и vector-bridges
 * в один transport для minimal pipeline runtime.
 */

import type { ArchiveBridge } from '../../transport';
import type { VectorBridge } from '../../../vector';
import type {
	PipelineRuntimeTransportPort,
	PipelineVectorizeRequest,
} from '../ports/pipeline-runtime-port';

/**
 * @description Создаёт transport-порт runtime на базе текущих мостов плагина.
 * @param {ArchiveBridge} archiveBridge - Мост к archive API.
 * @param {VectorBridge} vectorBridge - Мост к vector API.
 * @returns {PipelineRuntimeTransportPort} Локальный transport порт runtime.
 */
export function createPipelineRuntimeBridgeAdapter(
	archiveBridge: ArchiveBridge,
	vectorBridge: VectorBridge
): PipelineRuntimeTransportPort {
	return {
		getArchivedChats: archiveBridge.getArchivedChats.bind(archiveBridge),
		getArchivedMessages: archiveBridge.getArchivedMessages.bind(archiveBridge),
		getVectorHealthDetails:
			vectorBridge.getVectorHealthDetails.bind(vectorBridge),
		batchVectorize: (contents: PipelineVectorizeRequest[]) =>
			vectorBridge.batchVectorize(contents as any),
		vectorizeContent: (request: PipelineVectorizeRequest) =>
			vectorBridge.vectorizeContent(request as any),
	};
}
