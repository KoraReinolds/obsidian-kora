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
} from '../../../../packages/contracts/src/eternal-ai';
import type { ServerConfig } from '../../services/config-service.js';
import {
	EternalAiRepository,
	type CreateConversationInput,
} from './eternal-ai-repository.js';

const ETERNAL_OPEN_ORIGIN = 'https://open.eternalai.org';
const CREATIVE_EFFECTS_URL = `${ETERNAL_OPEN_ORIGIN}/creative-ai/effects`;

/** @description Ключи, которые не должны уходить в плагин из ответа Eternal. */
const STRIPPED_EFFECT_KEYS = new Set([
	'decrypted_aes_key',
	'input_decrypted_aes_key',
	'encrypted_aes_key',
	'md5_file_hash',
]);

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

	/**
	 * @description Загружает каталог визуальных эффектов и удаляет чувствительные поля.
	 * @returns {Promise<EternalAiCreativeEffectItem[]>}
	 */
	async listCreativeEffects(): Promise<EternalAiCreativeEffectItem[]> {
		const response = await fetch(CREATIVE_EFFECTS_URL, { method: 'GET' });
		if (!response.ok) {
			throw new Error(
				`Eternal creative effects HTTP ${response.status}: ${response.statusText}`
			);
		}

		const payload = (await response.json()) as unknown;
		if (!Array.isArray(payload)) {
			throw new Error('Eternal creative effects: ожидался JSON-массив.');
		}

		return payload
			.map(raw => {
				try {
					return this.sanitizeCreativeEffect(raw);
				} catch {
					return null;
				}
			})
			.filter((item): item is EternalAiCreativeEffectItem => item !== null);
	}

	/**
	 * @description Стартует генерацию по Easy Effect: запрос к `/generate`, локальная запись job.
	 * @param {StartCreativeEffectRequest} request - effect_id и изображения (URL или data URL).
	 * @returns {Promise<StartCreativeEffectResponse>}
	 */
	async startCreativeEffect(
		request: StartCreativeEffectRequest
	): Promise<StartCreativeEffectResponse> {
		const config = this.getConfig();
		if (!config.eternalAiApiKey) {
			throw new Error('ETERNAL_AI_API_KEY не задан в конфигурации сервера.');
		}

		if (!request.images?.length) {
			throw new Error('Нужно хотя бы одно изображение (images).');
		}

		const now = new Date().toISOString();
		const model = config.eternalAiModel || 'uncensored-eternal-ai-1.0';
		const conversation = this.ensureConversationForCreative({
			conversationId: request.conversationId ?? undefined,
			effectTag: request.effect_tag,
			model,
			now,
		});

		const generateResponse = await fetch(`${ETERNAL_OPEN_ORIGIN}/generate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': config.eternalAiApiKey,
			},
			body: JSON.stringify({
				effect_id: request.effect_id,
				images: request.images,
			}),
		});

		const generatePayload = (await generateResponse
			.json()
			.catch(() => null)) as Record<string, unknown> | null;

		if (!generateResponse.ok) {
			const detail =
				(typeof generatePayload?.detail === 'string'
					? generatePayload.detail
					: null) ||
				(typeof generatePayload?.error === 'string'
					? generatePayload.error
					: null) ||
				`HTTP ${generateResponse.status}`;
			throw new Error(`Eternal generate: ${detail}`);
		}

		const requestId = generatePayload?.request_id;
		if (typeof requestId !== 'string' || !requestId) {
			throw new Error('Eternal generate: в ответе нет request_id.');
		}

		const userMessage = this.repository.insertMessage({
			id: randomUUID(),
			conversationId: conversation.id,
			role: 'user',
			contentText: `Визуальный эффект: ${request.effect_tag}`,
			model,
			status: 'complete',
			createdAt: now,
			metadata: {
				creativeEffect: true,
				effectId: request.effect_id,
				effectTag: request.effect_tag,
				requestId,
			},
		});

		this.repository.insertEffectJob({
			requestId,
			conversationId: conversation.id,
			userMessageId: userMessage.id,
			effectId: request.effect_id,
			effectTag: request.effect_tag,
			status: 'pending',
			createdAt: now,
			updatedAt: now,
		});

		this.repository.updateConversationMetadata({
			conversationId: conversation.id,
			model,
			lastMessagePreview: this.buildPreview(userMessage.contentText),
			lastMessageAt: now,
			updatedAt: now,
		});

		return {
			request_id: requestId,
			conversation: this.repository.getConversation(
				conversation.id
			) as EternalAiConversationSummary,
			userMessage,
		};
	}

	/**
	 * @description Запускает кастомную генерацию (фото/видео/редактирование) через base/generate.
	 * @param {StartCustomGenerationRequest} request - Режим, prompt и optional images.
	 * @returns {Promise<StartCustomGenerationResponse>}
	 */
	async startCustomGeneration(
		request: StartCustomGenerationRequest
	): Promise<StartCustomGenerationResponse> {
		const config = this.getConfig();
		if (!config.eternalAiApiKey) {
			throw new Error('ETERNAL_AI_API_KEY не задан в конфигурации сервера.');
		}

		const now = new Date().toISOString();
		const model = config.eternalAiModel || 'uncensored-eternal-ai-1.0';
		const conversation = this.ensureConversationForCreative({
			conversationId: request.conversationId ?? undefined,
			effectTag: `Custom ${request.mode}`,
			model,
			now,
		});

		const payload: Record<string, unknown> = {
			prompt: request.prompt,
		};
		if (request.images?.length) {
			payload.images = request.images;
		}
		if (request.mode === 'video_generate') {
			payload.output_type = 'video';
		}

		const generateResponse = await fetch(
			`${ETERNAL_OPEN_ORIGIN}/base/generate`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': config.eternalAiApiKey,
				},
				body: JSON.stringify(payload),
			}
		);

		const generatePayload = (await generateResponse
			.json()
			.catch(() => null)) as Record<string, unknown> | null;
		if (!generateResponse.ok) {
			const detail =
				(typeof generatePayload?.detail === 'string'
					? generatePayload.detail
					: null) ||
				(typeof generatePayload?.error === 'string'
					? generatePayload.error
					: null) ||
				`HTTP ${generateResponse.status}`;
			throw new Error(`Eternal custom generate: ${detail}`);
		}

		const requestId = generatePayload?.request_id;
		if (typeof requestId !== 'string' || !requestId) {
			throw new Error('Eternal custom generate: в ответе нет request_id.');
		}

		const userMessage = this.repository.insertMessage({
			id: randomUUID(),
			conversationId: conversation.id,
			role: 'user',
			contentText: `[Custom ${request.mode}] ${request.prompt}`,
			model,
			status: 'complete',
			createdAt: now,
			metadata: {
				customGeneration: true,
				mode: request.mode,
				requestId,
			},
		});

		this.repository.insertEffectJob({
			requestId,
			conversationId: conversation.id,
			userMessageId: userMessage.id,
			effectId: `custom:${request.mode}`,
			effectTag: `Custom ${request.mode}`,
			status: 'pending',
			createdAt: now,
			updatedAt: now,
		});

		this.repository.updateConversationMetadata({
			conversationId: conversation.id,
			model,
			lastMessagePreview: this.buildPreview(userMessage.contentText),
			lastMessageAt: now,
			updatedAt: now,
		});

		return {
			request_id: requestId,
			conversation: this.repository.getConversation(
				conversation.id
			) as EternalAiConversationSummary,
			userMessage,
		};
	}

	/**
	 * @description Проксирует poll-result и при успехе записывает ответ ассистента в историю.
	 * @param {string} requestId - Идентификатор задачи Eternal.
	 * @returns {Promise<EternalAiCreativePollResponse>}
	 */
	async pollCreativeEffect(
		requestId: string
	): Promise<EternalAiCreativePollResponse> {
		const config = this.getConfig();
		if (!config.eternalAiApiKey) {
			throw new Error('ETERNAL_AI_API_KEY не задан в конфигурации сервера.');
		}

		const job = this.repository.getEffectJob(requestId);
		if (!job) {
			throw new Error('Задача effect не найдена в локальной базе.');
		}

		if (job.status === 'success' && job.assistant_message_id) {
			return {
				request_id: requestId,
				status: 'success',
				progress: 100,
				result_url: job.result_url || undefined,
				completed: true,
			};
		}

		if (job.status === 'error' && job.assistant_message_id) {
			return {
				request_id: requestId,
				status: 'error',
				error: job.error_text || 'Ошибка генерации',
				completed: true,
			};
		}

		const pollUrl = `${ETERNAL_OPEN_ORIGIN}/poll-result/${encodeURIComponent(requestId)}`;
		const response = await fetch(pollUrl, {
			method: 'GET',
			headers: {
				'x-api-key': config.eternalAiApiKey,
			},
		});

		const payload = (await response.json().catch(() => null)) as Record<
			string,
			unknown
		> | null;

		if (!payload) {
			return {
				request_id: requestId,
				status: 'processing',
				completed: false,
			};
		}

		const statusRaw = typeof payload.status === 'string' ? payload.status : '';
		const resultUrl =
			typeof payload.result_url === 'string' ? payload.result_url : null;
		const progress =
			typeof payload.progress === 'number' ? payload.progress : undefined;
		const errorText = typeof payload.error === 'string' ? payload.error : null;
		const detailText =
			typeof payload.detail === 'string' ? payload.detail : null;

		const normalized = statusRaw.toLowerCase();
		const pendingHint = (value: string | null): boolean => {
			if (!value) {
				return false;
			}
			return /not found|still processing|processing|pending|wait/i.test(value);
		};

		const looksPending =
			pendingHint(errorText) ||
			pendingHint(detailText) ||
			normalized === 'pending' ||
			normalized === 'processing';

		const updatedAt = new Date().toISOString();

		if (resultUrl && !job.assistant_message_id) {
			const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(resultUrl);
			const assistantMessage = this.repository.insertMessage({
				id: randomUUID(),
				conversationId: job.conversation_id,
				role: 'assistant',
				contentText: `Готово (${job.effect_tag || job.effect_id}):\n${resultUrl}`,
				model: config.eternalAiModel || null,
				status: 'complete',
				createdAt: updatedAt,
				metadata: {
					creativeEffectResult: true,
					effectId: job.effect_id,
					requestId,
					resultUrl,
				},
				attachments: [
					{
						id: randomUUID(),
						kind: isVideo ? 'video' : 'image',
						name: isVideo ? 'Видео' : 'Изображение',
						previewSrc: resultUrl,
						isImage: !isVideo,
						isVideo,
					},
				],
			});

			this.repository.updateEffectJob(requestId, {
				status: 'success',
				result_url: resultUrl,
				assistant_message_id: assistantMessage.id,
				updatedAt,
			});

			this.repository.updateConversationMetadata({
				conversationId: job.conversation_id,
				lastMessagePreview: this.buildPreview('Готово: визуальный эффект'),
				lastMessageAt: updatedAt,
				updatedAt,
			});

			return {
				request_id: requestId,
				status: 'success',
				progress: progress ?? 100,
				result_url: resultUrl,
				completed: true,
				assistantMessage,
				conversation: this.repository.getConversation(
					job.conversation_id
				) as EternalAiConversationSummary,
			};
		}

		if (
			!resultUrl &&
			!looksPending &&
			(normalized === 'failed' ||
				normalized === 'error' ||
				(Boolean(errorText) && !pendingHint(errorText)) ||
				(Boolean(detailText) && !pendingHint(detailText) && !response.ok))
		) {
			const detail =
				errorText ||
				detailText ||
				(!response.ok ? `HTTP ${response.status}` : null) ||
				'Генерация завершилась ошибкой.';

			if (!job.assistant_message_id) {
				this.repository.updateEffectJob(requestId, {
					status: 'error',
					error_text: String(detail),
					updatedAt,
				});

				const assistantMessage = this.repository.insertMessage({
					id: randomUUID(),
					conversationId: job.conversation_id,
					role: 'assistant',
					contentText: `Ошибка визуального эффекта: ${detail}`,
					model: config.eternalAiModel || null,
					status: 'error',
					errorText: String(detail),
					createdAt: updatedAt,
					metadata: {
						creativeEffectError: true,
						effectId: job.effect_id,
						requestId,
					},
				});

				this.repository.updateEffectJob(requestId, {
					assistant_message_id: assistantMessage.id,
					updatedAt,
				});

				this.repository.updateConversationMetadata({
					conversationId: job.conversation_id,
					lastMessagePreview: this.buildPreview(assistantMessage.contentText),
					lastMessageAt: updatedAt,
					updatedAt,
				});

				return {
					request_id: requestId,
					status: 'error',
					error: String(detail),
					progress,
					completed: true,
					assistantMessage,
					conversation: this.repository.getConversation(
						job.conversation_id
					) as EternalAiConversationSummary,
				};
			}
		}

		this.repository.updateEffectJob(requestId, {
			status: 'processing',
			updatedAt,
		});

		return {
			request_id: requestId,
			status: statusRaw || 'processing',
			progress,
			result_url: resultUrl,
			error: errorText,
			completed: false,
		};
	}

	private sanitizeCreativeEffect(raw: unknown): EternalAiCreativeEffectItem {
		if (!raw || typeof raw !== 'object') {
			throw new Error('Некорректный элемент списка эффектов.');
		}

		const source = raw as Record<string, unknown>;
		const cleaned: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(source)) {
			if (STRIPPED_EFFECT_KEYS.has(key)) {
				continue;
			}
			cleaned[key] = value;
		}

		const effect_id = cleaned.effect_id;
		const tag = cleaned.tag;
		const effect_type = cleaned.effect_type;
		const price = cleaned.price;
		const model_id = cleaned.model_id;

		if (typeof effect_id !== 'string' || !effect_id) {
			throw new Error('У эффекта отсутствует effect_id.');
		}
		if (typeof tag !== 'string') {
			throw new Error('У эффекта отсутствует tag.');
		}
		if (effect_type !== 'image' && effect_type !== 'video') {
			throw new Error('Неизвестный effect_type.');
		}
		if (typeof price !== 'number' || Number.isNaN(price)) {
			throw new Error('Неизвестное поле price.');
		}
		if (typeof model_id !== 'string') {
			throw new Error('Неизвестное поле model_id.');
		}

		const item: EternalAiCreativeEffectItem = {
			effect_id,
			tag,
			effect_type,
			price,
			model_id,
		};

		if (typeof cleaned.sampleInputURL === 'string') {
			item.sampleInputURL = cleaned.sampleInputURL;
		}
		if (typeof cleaned.sampleOutputURL === 'string') {
			item.sampleOutputURL = cleaned.sampleOutputURL;
		}
		if (typeof cleaned.duration === 'number') {
			item.duration = cleaned.duration;
		}
		if (typeof cleaned.is_blurred === 'boolean') {
			item.is_blurred = cleaned.is_blurred;
		}
		if (typeof cleaned.is_staging === 'boolean') {
			item.is_staging = cleaned.is_staging;
		}
		if (typeof cleaned.room_tier === 'number') {
			item.room_tier = cleaned.room_tier;
		}
		if (typeof cleaned.fix_artifacted === 'boolean') {
			item.fix_artifacted = cleaned.fix_artifacted;
		}
		if (typeof cleaned.created_at === 'string') {
			item.created_at = cleaned.created_at;
		}

		return item;
	}

	private ensureConversationForCreative(params: {
		conversationId?: string;
		effectTag: string;
		model: string;
		now: string;
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
			title:
				this.buildPreview(`Creative: ${params.effectTag}`, 48) || 'Creative',
			model: params.model,
			systemPrompt: undefined,
			createdAt: params.now,
		};

		return this.repository.createConversation(input);
	}
}
