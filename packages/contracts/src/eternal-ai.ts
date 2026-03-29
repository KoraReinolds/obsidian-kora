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
	/** {@code pending} — визуальная генерация (Easy Effect / custom), ждём poll. */
	status: 'complete' | 'error' | 'pending';
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

export type EternalAiArtifactType =
	| 'dialogue_window'
	| 'episodic_memory'
	| 'semantic_memory'
	| 'session_summary'
	| 'environment_state';

export type EternalAiArtifactContext =
	| 'user'
	| 'persona'
	| 'relationship'
	| 'environment'
	| 'source';

/**
 * @description Публичная запись памяти Eternal AI. Контракт намеренно фокусируется
 * на полях `type`, `context` и `scope`, а все второстепенные детали остаются
 * внутри `metadata`.
 */
export interface EternalAiArtifactRecord {
	id: string;
	type: EternalAiArtifactType;
	context: EternalAiArtifactContext | string;
	scope: {
		kind: string;
		id?: string;
	};
	text: string;
	sourceType: string;
	sourceId: string;
	metadata?: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
	score?: number | null;
}

/**
 * @description Запрос ручного seed-заполнения памяти Eternal AI для выбранного диалога.
 */
export interface CreateEternalAiArtifactRequest {
	conversationId: string;
	type: EternalAiArtifactType;
	context: EternalAiArtifactContext | string;
	text: string;
	metadata?: Record<string, unknown> | null;
}

/**
 * @description Краткий снимок recall-артефакта внутри turn trace. DTO отделён от
 * shared memory-ядра, чтобы HTTP-контракт не зависел напрямую от внутренних типов
 * `kora-core` и мог эволюционировать независимо от server/runtime реализации.
 */
export interface EternalAiArtifactSnapshot {
	id: string;
	type: string;
	context: string;
	sourceType: string;
	sourceId: string;
	scope: {
		kind: string;
		id?: string;
	};
	text: string;
	metadata?: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
	score?: number | null;
}

/**
 * @description DTO одного prompt fragment внутри trace.
 */
export interface EternalAiPromptFragmentSnapshot {
	id: string;
	layer: string;
	priority: number;
	source: string;
	text: string;
	metadata?: Record<string, unknown> | null;
}

/**
 * @description Парсинг ответа модели после минимального runtime-parser.
 */
export interface EternalAiParsedResponseSnapshot {
	rawText: string;
	assistantText: string;
	actions: string[];
	environmentPatch?: Record<string, unknown> | null;
	memoryCandidates: string[];
	displayText: string;
	usedStructuredBlocks: boolean;
}

/**
 * @description Полный debug-first снимок одного runtime-turn внутри Eternal AI.
 */
export interface EternalAiTurnTraceRecord {
	id: string;
	conversationId: string;
	model: string;
	status: 'success' | 'error';
	inputText: string;
	promptText: string;
	rawResponse: string;
	parsedResponse?: EternalAiParsedResponseSnapshot | null;
	recalledArtifacts: EternalAiArtifactSnapshot[];
	promptFragments: EternalAiPromptFragmentSnapshot[];
	timingsMs: Record<string, number>;
	errorText?: string | null;
	startedAt: string;
	finishedAt: string;
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
	/** Сообщение ассистента с промптом и плейсхолдером медиа до завершения poll. */
	assistantMessage: EternalAiMessageRecord;
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
	assistantMessage: EternalAiMessageRecord;
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
