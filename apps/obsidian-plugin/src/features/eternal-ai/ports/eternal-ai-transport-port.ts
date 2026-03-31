/**
 * @module features/eternal-ai/ports/eternal-ai-transport-port
 * @description Контракт транспорта для экрана Eternal AI.
 */

import type {
	CreateEternalAiArtifactRequest,
	DeleteEternalAiTurnResponse,
	EternalAiArtifactRecord,
	EternalAiConversationSummary,
	EternalAiCreativeEffectItem,
	EternalAiCreativePollResponse,
	EternalAiHealthResponse,
	EternalAiS4SafetyCheckRequest,
	EternalAiS4SafetyCheckResponse,
	EternalAiTurnRecord,
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
	listTurns(conversationId: string): Promise<EternalAiTurnRecord[]>;
	listArtifacts(
		conversationId: string,
		filters?: {
			type?: string;
			context?: string;
			limit?: number;
		}
	): Promise<EternalAiArtifactRecord[]>;
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
	deleteTurn(
		conversationId: string,
		turnId: string
	): Promise<DeleteEternalAiTurnResponse>;
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
