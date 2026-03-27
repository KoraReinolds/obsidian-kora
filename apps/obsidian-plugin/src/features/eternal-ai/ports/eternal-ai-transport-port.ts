/**
 * @module features/eternal-ai/ports/eternal-ai-transport-port
 * @description Контракт транспорта для экрана Eternal AI.
 */

import type {
	EternalAiConversationSummary,
	EternalAiCreativeEffectItem,
	EternalAiCreativePollResponse,
	EternalAiHealthResponse,
	EternalAiMessageRecord,
	SendEternalAiMessageRequest,
	SendEternalAiMessageResponse,
	StartCustomGenerationRequest,
	StartCustomGenerationResponse,
	StartCreativeEffectRequest,
	StartCreativeEffectResponse,
} from '../../../../../../packages/contracts/src/eternal-ai';

export interface EternalAiTransportPort {
	getHealth(): Promise<EternalAiHealthResponse>;
	listConversations(): Promise<EternalAiConversationSummary[]>;
	listMessages(conversationId: string): Promise<EternalAiMessageRecord[]>;
	deleteMessage(
		conversationId: string,
		messageId: string
	): Promise<{ deleted: boolean }>;
	sendMessage(
		request: SendEternalAiMessageRequest
	): Promise<SendEternalAiMessageResponse>;
	deleteConversation(conversationId: string): Promise<{ deleted: boolean }>;
	listCreativeEffects(): Promise<EternalAiCreativeEffectItem[]>;
	startCreativeEffect(
		request: StartCreativeEffectRequest
	): Promise<StartCreativeEffectResponse>;
	startCustomGeneration(
		request: StartCustomGenerationRequest
	): Promise<StartCustomGenerationResponse>;
	pollCreativeEffect(requestId: string): Promise<EternalAiCreativePollResponse>;
}
