/**
 * @module modules/eternal-ai/eternal-ai-service
 * @description Оркестратор Eternal AI чатов. Сервис хранит локальную историю,
 * формирует OpenAI-compatible payload и записывает оба сообщения пары
 * user/assistant в SQLite, чтобы экран в Obsidian всегда открывался из локального
 * состояния.
 */

import { randomUUID } from 'node:crypto';
import type {
	EternalAiConversationSummary,
	EternalAiHealthResponse,
	EternalAiMessageRecord,
	SendEternalAiMessageRequest,
	SendEternalAiMessageResponse,
} from '../../../../packages/contracts/src/eternal-ai';
import type { ServerConfig } from '../../services/config-service.js';
import {
	EternalAiRepository,
	type CreateConversationInput,
} from './eternal-ai-repository.js';

interface EternalChatCompletionResponse {
	choices?: Array<{
		message?: {
			content?: unknown;
		};
	}>;
	error?: {
		message?: string;
	};
}

export class EternalAiService {
	constructor(
		private readonly repository: EternalAiRepository,
		private readonly getConfig: () => ServerConfig,
		private readonly getDatabasePath: () => string
	) {}

	listConversations(): EternalAiConversationSummary[] {
		return this.repository.listConversations();
	}

	listMessages(conversationId: string): EternalAiMessageRecord[] {
		return this.repository.listMessages(conversationId);
	}

	deleteConversation(conversationId: string): boolean {
		return this.repository.deleteConversation(conversationId);
	}

	getHealth(): EternalAiHealthResponse {
		const config = this.getConfig();
		const hasApiKey = Boolean(config.eternalAiApiKey);

		if (!hasApiKey) {
			return {
				status: 'misconfigured',
				baseUrl: config.eternalAiBaseUrl || null,
				model: config.eternalAiModel || null,
				databasePath: this.getDatabasePath(),
				hasApiKey: false,
				error: 'ETERNAL_AI_API_KEY не задан.',
			};
		}

		return {
			status: 'healthy',
			baseUrl: config.eternalAiBaseUrl || null,
			model: config.eternalAiModel || null,
			databasePath: this.getDatabasePath(),
			hasApiKey: true,
		};
	}

	async sendMessage(
		request: SendEternalAiMessageRequest
	): Promise<SendEternalAiMessageResponse> {
		const config = this.getConfig();
		if (!config.eternalAiApiKey) {
			throw new Error('ETERNAL_AI_API_KEY не задан в конфигурации сервера.');
		}

		const now = new Date().toISOString();
		const model =
			request.model || config.eternalAiModel || 'uncensored-eternal-ai-1.0';
		const conversation = this.ensureConversation({
			conversationId: request.conversationId,
			model,
			systemPrompt: request.systemPrompt,
			now,
			text: request.text,
		});

		const userMessage = this.repository.insertMessage({
			id: randomUUID(),
			conversationId: conversation.id,
			role: 'user',
			contentText: request.text,
			model,
			status: 'complete',
			createdAt: now,
		});

		this.repository.updateConversationMetadata({
			conversationId: conversation.id,
			model,
			systemPrompt: request.systemPrompt ?? conversation.systemPrompt ?? null,
			lastMessagePreview: this.buildPreview(request.text),
			lastMessageAt: now,
			updatedAt: now,
			title: this.deriveConversationTitle(conversation.title, request.text),
		});

		const completionText = await this.requestCompletion({
			conversationId: conversation.id,
			model,
			systemPrompt:
				request.systemPrompt ?? conversation.systemPrompt ?? undefined,
		});

		const assistantCreatedAt = new Date().toISOString();
		const assistantMessage = this.repository.insertMessage({
			id: randomUUID(),
			conversationId: conversation.id,
			role: 'assistant',
			contentText: completionText,
			model,
			status: 'complete',
			createdAt: assistantCreatedAt,
		});

		this.repository.updateConversationMetadata({
			conversationId: conversation.id,
			model,
			systemPrompt: request.systemPrompt ?? conversation.systemPrompt ?? null,
			lastMessagePreview: this.buildPreview(completionText),
			lastMessageAt: assistantCreatedAt,
			updatedAt: assistantCreatedAt,
		});

		return {
			conversation: this.repository.getConversation(
				conversation.id
			) as EternalAiConversationSummary,
			userMessage,
			assistantMessage,
		};
	}

	private ensureConversation(params: {
		conversationId?: string;
		model: string;
		systemPrompt?: string;
		now: string;
		text: string;
	}): EternalAiConversationSummary {
		if (params.conversationId) {
			const existing = this.repository.getConversation(params.conversationId);
			if (!existing) {
				throw new Error('Диалог не найден.');
			}
			return existing;
		}

		const input: CreateConversationInput = {
			id: randomUUID(),
			title: this.buildPreview(params.text, 48) || 'Новый чат',
			model: params.model,
			systemPrompt: params.systemPrompt,
			createdAt: params.now,
		};

		return this.repository.createConversation(input);
	}

	private async requestCompletion(params: {
		conversationId: string;
		model: string;
		systemPrompt?: string;
	}): Promise<string> {
		const config = this.getConfig();
		const baseUrl = (
			config.eternalAiBaseUrl || 'https://open.eternalai.org/v1'
		).replace(/\/$/, '');
		const messages = this.repository
			.listMessages(params.conversationId)
			.map(message => ({
				role: message.role,
				content: message.contentText,
			}));

		if (params.systemPrompt) {
			messages.unshift({
				role: 'system',
				content: params.systemPrompt,
			});
		}

		const response = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': config.eternalAiApiKey as string,
			},
			body: JSON.stringify({
				model: params.model,
				stream: false,
				messages,
			}),
		});

		if (!response.ok) {
			const errorPayload = (await response
				.json()
				.catch(() => null)) as EternalChatCompletionResponse | null;
			throw new Error(
				errorPayload?.error?.message ||
					`Eternal AI HTTP ${response.status}: ${response.statusText}`
			);
		}

		const payload = (await response.json()) as EternalChatCompletionResponse;
		const content = payload.choices?.[0]?.message?.content;
		const text = this.extractContentText(content);

		if (!text) {
			throw new Error('Eternal AI вернул пустой ответ.');
		}

		return text;
	}

	private extractContentText(content: unknown): string {
		if (typeof content === 'string') {
			return content.trim();
		}

		if (Array.isArray(content)) {
			return content
				.map(part => {
					if (typeof part === 'string') {
						return part;
					}
					if (
						part &&
						typeof part === 'object' &&
						'text' in part &&
						typeof (part as { text?: unknown }).text === 'string'
					) {
						return (part as { text: string }).text;
					}
					return '';
				})
				.join('\n')
				.trim();
		}

		return '';
	}

	private buildPreview(text: string, limit = 96): string {
		const normalized = text.replace(/\s+/g, ' ').trim();
		if (normalized.length <= limit) {
			return normalized;
		}
		return `${normalized.slice(0, limit - 1)}…`;
	}

	private deriveConversationTitle(currentTitle: string, text: string): string {
		if (currentTitle && currentTitle !== 'Новый чат') {
			return currentTitle;
		}
		return this.buildPreview(text, 48) || currentTitle || 'Новый чат';
	}
}
