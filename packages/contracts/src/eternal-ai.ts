/**
 * @module packages/contracts/eternal-ai
 * @description Общие DTO для экрана Eternal AI в Obsidian и server-модуля,
 * который хранит историю локально и проксирует OpenAI-compatible chat API.
 */

export interface EternalAiConversationSummary {
	id: string;
	title: string;
	model: string;
	systemPrompt?: string | null;
	lastMessagePreview?: string | null;
	lastMessageAt?: string | null;
	messageCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface EternalAiMessageRecord {
	id: string;
	conversationId: string;
	role: 'user' | 'assistant' | 'system';
	contentText: string;
	model?: string | null;
	status: 'complete' | 'error';
	errorText?: string | null;
	attachments?: Array<Record<string, unknown>> | null;
	metadata?: Record<string, unknown> | null;
	createdAt: string;
}

export interface CreateEternalAiConversationRequest {
	title?: string;
	systemPrompt?: string;
	model?: string;
}

export interface SendEternalAiMessageRequest {
	conversationId?: string;
	text: string;
	systemPrompt?: string;
	model?: string;
}

export interface SendEternalAiMessageResponse {
	conversation: EternalAiConversationSummary;
	userMessage: EternalAiMessageRecord;
	assistantMessage: EternalAiMessageRecord;
}

export interface EternalAiHealthResponse {
	status: 'healthy' | 'misconfigured' | 'error';
	baseUrl?: string | null;
	model?: string | null;
	databasePath?: string | null;
	hasApiKey: boolean;
	error?: string;
}
