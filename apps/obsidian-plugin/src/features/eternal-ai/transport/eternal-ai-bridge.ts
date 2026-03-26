/**
 * @module features/eternal-ai/transport/eternal-ai-bridge
 * @description HTTP-клиент Obsidian для Eternal AI модуля внутри Kora server.
 */

import {
	BaseHttpClient,
	type HttpClientConfig,
} from '../../../telegram/core/base-http-client';
import type {
	EternalAiConversationSummary,
	EternalAiHealthResponse,
	EternalAiMessageRecord,
	SendEternalAiMessageRequest,
	SendEternalAiMessageResponse,
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

interface EternalAiSendResponse extends SendEternalAiMessageResponse {
	success: boolean;
	error?: string;
}

interface EternalAiDeleteResponse {
	success: boolean;
	deleted?: boolean;
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
}
