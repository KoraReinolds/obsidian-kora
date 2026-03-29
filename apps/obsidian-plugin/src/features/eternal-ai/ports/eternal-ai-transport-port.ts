/**
 * @module features/eternal-ai/ports/eternal-ai-transport-port
 * @description Контракт транспорта для экрана Eternal AI.
 */

import type {
	CreateEternalAiArtifactRequest,
	EternalAiArtifactRecord,
	EternalAiConversationSummary,
	EternalAiCreativeEffectItem,
	EternalAiCreativePollResponse,
	EternalAiHealthResponse,
	EternalAiMessageRecord,
	EternalAiS4SafetyCheckRequest,
	EternalAiS4SafetyCheckResponse,
	EternalAiTurnTraceRecord,
	SendEternalAiMessageRequest,
	SendEternalAiMessageResponse,
	StartCustomGenerationRequest,
	StartCustomGenerationResponse,
	StartCreativeEffectRequest,
	StartCreativeEffectResponse,
	UpdateEternalAiArtifactRequest,
} from '../../../../../../packages/contracts/src/eternal-ai';

export interface EternalAiTransportPort {
	getHealth(): Promise<EternalAiHealthResponse>;
	listConversations(): Promise<EternalAiConversationSummary[]>;
	listMessages(conversationId: string): Promise<EternalAiMessageRecord[]>;
	listArtifacts(
		conversationId: string,
		filters?: {
			type?: string;
			context?: string;
			limit?: number;
		}
	): Promise<EternalAiArtifactRecord[]>;
	listTurnTraces(
		conversationId: string,
		limit?: number
	): Promise<EternalAiTurnTraceRecord[]>;
	createSeedArtifact(
		request: CreateEternalAiArtifactRequest
	): Promise<EternalAiArtifactRecord>;
	updateArtifact(
		request: UpdateEternalAiArtifactRequest
	): Promise<EternalAiArtifactRecord>;
	deleteArtifact(
		conversationId: string,
		artifactId: string
	): Promise<{ deleted: boolean }>;
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
	safetyCheckS4(
		request: EternalAiS4SafetyCheckRequest
	): Promise<EternalAiS4SafetyCheckResponse>;
}
