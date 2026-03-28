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

/**
 * @description Публичные поля визуального эффекта после санитизации на сервере
 * (без AES/md5 и прочих чувствительных полей исходного JSON Eternal).
 */
export interface EternalAiCreativeEffectItem {
	effect_id: string;
	tag: string;
	effect_type: 'image' | 'video';
	price: number;
	model_id: string;
	sampleInputURL?: string;
	sampleOutputURL?: string;
	duration?: number;
	is_blurred?: boolean;
	is_staging?: boolean;
	room_tier?: number;
	fix_artifacted?: boolean;
	created_at?: string;
}

export interface StartCreativeEffectRequest {
	conversationId?: string | null;
	effect_id: string;
	effect_tag: string;
	/** Base64 data URL или публичный URL изображения (как в API Eternal). */
	images: string[];
}

export interface StartCreativeEffectResponse {
	request_id: string;
	conversation: EternalAiConversationSummary;
	userMessage: EternalAiMessageRecord;
}

/**
 * @description Ответ прокси poll; поля зеркалят типичный JSON Eternal `poll-result`.
 */
export interface EternalAiCreativePollResponse {
	request_id: string;
	status?: string;
	progress?: number;
	result_url?: string | null;
	error?: string | null;
	detail?: string | null;
	/** true, если сервер записал финальное сообщение ассистента в SQLite. */
	completed?: boolean;
	assistantMessage?: EternalAiMessageRecord | null;
	conversation?: EternalAiConversationSummary | null;
}

export type EternalAiCustomMode =
	| 'photo_generate'
	| 'photo_edit'
	| 'video_generate';

export interface StartCustomGenerationRequest {
	conversationId?: string | null;
	mode: EternalAiCustomMode;
	prompt: string;
	images?: string[];
}

export interface StartCustomGenerationResponse {
	request_id: string;
	conversation: EternalAiConversationSummary;
	userMessage: EternalAiMessageRecord;
}

/**
 * @description Запрос к S4 Safety Check API Eternal (промпт + изображения).
 * @see https://docs.eternalai.org/api/uncensored-ai-api/s4-safety-check-api
 */
export interface EternalAiS4SafetyCheckRequest {
	prompt: string;
	/** Base64 data URL или публичный URL. Пустой массив — если кадра нет (например, только текст). */
	images: string[];
}

/**
 * @description Ответ S4: флаг нарушения и разбор по тексту/картинке.
 */
export interface EternalAiS4SafetyCheckResponse {
	is_s4: boolean;
	detail?: {
		text?: string[];
		image?: string[];
	};
	request_id?: string;
}
