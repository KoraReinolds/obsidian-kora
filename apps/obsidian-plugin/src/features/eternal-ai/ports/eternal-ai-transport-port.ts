/**
 * @module features/eternal-ai/ports/eternal-ai-transport-port
 * @description Контракт транспорта для экрана Eternal AI.
 */

import type {
	EternalAiConversationSummary,
	EternalAiHealthResponse,
	EternalAiMessageRecord,
	SendEternalAiMessageRequest,
	SendEternalAiMessageResponse,
} from '../../../../../../packages/contracts/src/eternal-ai';

export interface EternalAiTransportPort {
	getHealth(): Promise<EternalAiHealthResponse>;
	listConversations(): Promise<EternalAiConversationSummary[]>;
	listMessages(conversationId: string): Promise<EternalAiMessageRecord[]>;
	sendMessage(
		request: SendEternalAiMessageRequest
	): Promise<SendEternalAiMessageResponse>;
	deleteConversation(conversationId: string): Promise<{ deleted: boolean }>;
}
