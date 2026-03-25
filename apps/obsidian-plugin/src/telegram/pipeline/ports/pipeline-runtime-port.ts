/**
 * @module telegram/pipeline/ports/pipeline-runtime-port
 *
 * @description Локальный контракт для minimal pipeline runtime в плагине.
 * Порт объединяет archive и vector transport, чтобы UI мог управлять slice-обработкой
 * без зависимости от серверной реализации pipeline.
 */

import type {
	ArchiveChat,
	ArchiveMessagesResponse,
	GetArchivedMessagesRequest,
} from '../../../../../../packages/contracts/src/telegram';

/**
 * @description Пакет для vectorize-запроса, который отправляется в vector bridge.
 */
export interface PipelineVectorizeRequest {
	id: string;
	contentType: 'telegram_post' | 'telegram_comment' | 'obsidian_note';
	title?: string;
	content: string;
	metadata?: Record<string, unknown>;
}

/**
 * @description Краткий статус vector backend для UI runtime.
 */
export interface PipelineVectorHealthResponse {
	status: 'healthy' | 'unhealthy' | 'unavailable' | 'error';
	backend?: 'sqlite';
	databasePath?: string;
	embeddingModel?: string;
	embeddingBaseUrl?: string;
	error?: string;
	stats?: {
		totalPoints: number;
		vectorSize: number;
		contentTypeBreakdown: Record<string, number>;
		status: string;
		backend?: 'sqlite';
		databasePath?: string;
	};
}

/**
 * @description Порт transport-слоя для minimal pipeline runtime.
 */
export interface PipelineRuntimeTransportPort {
	getArchivedChats(limit?: number): Promise<ArchiveChat[]>;
	getArchivedMessages(
		request: GetArchivedMessagesRequest
	): Promise<ArchiveMessagesResponse>;
	getVectorHealthDetails(): Promise<PipelineVectorHealthResponse>;
	batchVectorize(contents: PipelineVectorizeRequest[]): Promise<unknown>;
	vectorizeContent(request: PipelineVectorizeRequest): Promise<unknown>;
}
