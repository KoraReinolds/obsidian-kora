/**
 * @module features/eternal-ai/transport/eternal-ai-bridge
 * @description HTTP-клиент Obsidian для Eternal AI модуля внутри Kora server.
 */

import {
	BaseHttpClient,
	type HttpClientConfig,
} from '../../../telegram/core/base-http-client';
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

interface EternalAiConversationsResponse {
	success: boolean;
	conversations?: EternalAiConversationSummary[];
	error?: string;
}

interface EternalAiMessagesResponse {
	success: boolean;
	messages?: EternalAiMessageRecord[];
	error?: string;
}

interface EternalAiArtifactsResponse {
	success: boolean;
	artifacts?: EternalAiArtifactRecord[];
	error?: string;
}

interface EternalAiArtifactMutationResponse {
	success: boolean;
	artifact?: EternalAiArtifactRecord;
	deleted?: boolean;
	error?: string;
}

interface EternalAiTurnTracesResponse {
	success: boolean;
	traces?: EternalAiTurnTraceRecord[];
	error?: string;
}

interface EternalAiSendResponse extends SendEternalAiMessageResponse {
	success: boolean;
	error?: string;
}

interface EternalAiDeleteResponse {
	success: boolean;
	deleted?: boolean;
	error?: string;
}

interface EternalAiCreativeEffectsResponse {
	success: boolean;
	effects?: EternalAiCreativeEffectItem[];
	error?: string;
}

interface EternalAiCreativeGenerateResponse extends StartCreativeEffectResponse {
	success: boolean;
	error?: string;
}

interface EternalAiCreativePollApiResponse {
	success: boolean;
	poll?: EternalAiCreativePollResponse;
	error?: string;
}

interface EternalAiCustomGenerateResponse extends StartCustomGenerationResponse {
	success: boolean;
	error?: string;
}

interface EternalAiS4SafetyCheckApiResponse {
	success: boolean;
	result?: EternalAiS4SafetyCheckResponse;
	error?: string;
}

export class EternalAiBridge extends BaseHttpClient {
	constructor(config: Partial<HttpClientConfig> = {}) {
		super(config);
	}

	async getHealth(): Promise<EternalAiHealthResponse> {
		return await this.makeRequest<EternalAiHealthResponse>(
			'/eternal_ai/health'
		);
	}

	async listConversations(): Promise<EternalAiConversationSummary[]> {
		const response = await this.handleRequest<EternalAiConversationsResponse>(
			'/eternal_ai/conversations',
			{},
			'Ошибка загрузки Eternal AI диалогов'
		);

		if (!response?.success) {
			throw new Error(
				response?.error || 'Не удалось загрузить список диалогов'
			);
		}

		return response.conversations || [];
	}

	async listMessages(
		conversationId: string
	): Promise<EternalAiMessageRecord[]> {
		const response = await this.handleRequest<EternalAiMessagesResponse>(
			`/eternal_ai/conversations/${encodeURIComponent(conversationId)}/messages`,
			{},
			'Ошибка загрузки Eternal AI сообщений'
		);

		if (!response?.success) {
			throw new Error(response?.error || 'Не удалось загрузить сообщения');
		}

		return response.messages || [];
	}

	async listArtifacts(
		conversationId: string,
		filters?: {
			type?: string;
			context?: string;
			limit?: number;
		}
	): Promise<EternalAiArtifactRecord[]> {
		const params = new URLSearchParams();
		if (filters?.type) {
			params.set('type', filters.type);
		}
		if (filters?.context) {
			params.set('context', filters.context);
		}
		params.set('limit', String(filters?.limit || 100));

		const response = await this.handleRequest<EternalAiArtifactsResponse>(
			`/eternal_ai/conversations/${encodeURIComponent(conversationId)}/artifacts?${params.toString()}`,
			{},
			'Ошибка загрузки Eternal AI artifacts'
		);

		if (!response?.success) {
			throw new Error(response?.error || 'Не удалось загрузить artifacts');
		}

		return response.artifacts || [];
	}

	async listTurnTraces(
		conversationId: string,
		limit = 20
	): Promise<EternalAiTurnTraceRecord[]> {
		const response = await this.handleRequest<EternalAiTurnTracesResponse>(
			`/eternal_ai/conversations/${encodeURIComponent(conversationId)}/traces?limit=${encodeURIComponent(String(limit))}`,
			{},
			'Ошибка загрузки Eternal AI trace'
		);

		if (!response?.success) {
			throw new Error(response?.error || 'Не удалось загрузить trace');
		}

		return response.traces || [];
	}

	async createSeedArtifact(
		request: CreateEternalAiArtifactRequest
	): Promise<EternalAiArtifactRecord> {
		const response =
			await this.handleRequest<EternalAiArtifactMutationResponse>(
				`/eternal_ai/conversations/${encodeURIComponent(request.conversationId)}/artifacts`,
				{
					method: 'POST',
					body: {
						type: request.type,
						context: request.context,
						text: request.text,
						metadata: request.metadata ?? null,
					},
				},
				'Ошибка создания seed artifact'
			);

		if (!response?.success || !response.artifact) {
			throw new Error(response?.error || 'Не удалось создать artifact');
		}

		return response.artifact;
	}

	async updateArtifact(
		request: UpdateEternalAiArtifactRequest
	): Promise<EternalAiArtifactRecord> {
		const response =
			await this.handleRequest<EternalAiArtifactMutationResponse>(
				`/eternal_ai/conversations/${encodeURIComponent(request.conversationId)}/artifacts/${encodeURIComponent(request.artifactId)}`,
				{
					method: 'PUT',
					body: {
						type: request.type,
						context: request.context,
						text: request.text,
						metadata: request.metadata ?? null,
					},
				},
				'Ошибка обновления Eternal AI artifact'
			);

		if (!response?.success || !response.artifact) {
			throw new Error(response?.error || 'Не удалось обновить artifact');
		}

		return response.artifact;
	}

	async deleteArtifact(
		conversationId: string,
		artifactId: string
	): Promise<{ deleted: boolean }> {
		const response =
			await this.handleRequest<EternalAiArtifactMutationResponse>(
				`/eternal_ai/conversations/${encodeURIComponent(conversationId)}/artifacts/${encodeURIComponent(artifactId)}`,
				{ method: 'DELETE' },
				'Ошибка удаления Eternal AI artifact'
			);

		if (!response?.success) {
			throw new Error(response?.error || 'Не удалось удалить artifact');
		}

		return { deleted: response.deleted === true };
	}

	async deleteMessage(
		conversationId: string,
		messageId: string
	): Promise<{ deleted: boolean }> {
		const response = await this.handleRequest<EternalAiDeleteResponse>(
			`/eternal_ai/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
			{ method: 'DELETE' },
			'Ошибка удаления Eternal AI сообщения'
		);

		if (!response?.success) {
			throw new Error(response?.error || 'Не удалось удалить сообщение');
		}

		return { deleted: response.deleted === true };
	}

	async sendMessage(
		request: SendEternalAiMessageRequest
	): Promise<SendEternalAiMessageResponse> {
		const response = await this.handleRequest<EternalAiSendResponse>(
			'/eternal_ai/chat',
			{ method: 'POST', body: request, timeout: 120000 },
			'Ошибка запроса к Eternal AI'
		);

		if (!response?.success) {
			throw new Error(
				response?.error || 'Не удалось получить ответ Eternal AI'
			);
		}

		return response;
	}

	async deleteConversation(
		conversationId: string
	): Promise<{ deleted: boolean }> {
		const response = await this.handleRequest<EternalAiDeleteResponse>(
			`/eternal_ai/conversations/${encodeURIComponent(conversationId)}`,
			{ method: 'DELETE' },
			'Ошибка удаления Eternal AI диалога'
		);

		if (!response?.success) {
			throw new Error(response?.error || 'Не удалось удалить диалог');
		}

		return { deleted: response.deleted === true };
	}

	async listCreativeEffects(): Promise<EternalAiCreativeEffectItem[]> {
		const response = await this.handleRequest<EternalAiCreativeEffectsResponse>(
			'/eternal_ai/creative-effects',
			{},
			'Ошибка загрузки каталога эффектов Eternal AI'
		);

		if (!response?.success) {
			throw new Error(response?.error || 'Не удалось загрузить эффекты');
		}

		return response.effects || [];
	}

	async startCreativeEffect(
		request: StartCreativeEffectRequest
	): Promise<StartCreativeEffectResponse> {
		const response =
			await this.handleRequest<EternalAiCreativeGenerateResponse>(
				'/eternal_ai/creative/generate',
				{ method: 'POST', body: request, timeout: 120000 },
				'Ошибка запуска генерации Eternal AI'
			);

		if (!response?.success) {
			throw new Error(
				response?.error || 'Не удалось запустить визуальный эффект'
			);
		}

		return response;
	}

	async startCustomGeneration(
		request: StartCustomGenerationRequest
	): Promise<StartCustomGenerationResponse> {
		const response = await this.handleRequest<EternalAiCustomGenerateResponse>(
			'/eternal_ai/custom/generate',
			{ method: 'POST', body: request, timeout: 120000 },
			'Ошибка запуска кастомной генерации Eternal AI'
		);

		if (!response?.success) {
			throw new Error(
				response?.error || 'Не удалось запустить кастомную генерацию'
			);
		}

		return response;
	}

	async pollCreativeEffect(
		requestId: string
	): Promise<EternalAiCreativePollResponse> {
		const response = await this.handleRequest<EternalAiCreativePollApiResponse>(
			`/eternal_ai/creative/poll/${encodeURIComponent(requestId)}`,
			{},
			'Ошибка poll Eternal AI'
		);

		if (!response?.success || !response.poll) {
			throw new Error(
				response?.error || 'Не удалось получить статус генерации'
			);
		}

		return response.poll;
	}

	async safetyCheckS4(
		request: EternalAiS4SafetyCheckRequest
	): Promise<EternalAiS4SafetyCheckResponse> {
		const response =
			await this.handleRequest<EternalAiS4SafetyCheckApiResponse>(
				'/eternal_ai/safety-check',
				{ method: 'POST', body: request, timeout: 120000 },
				'Ошибка S4 safety-check Eternal AI'
			);

		if (!response?.success || !response.result) {
			throw new Error(response?.error || 'Не удалось выполнить проверку S4');
		}

		return response.result;
	}
}
