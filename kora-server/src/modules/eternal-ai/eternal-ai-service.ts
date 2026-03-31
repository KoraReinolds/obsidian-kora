/**
 * @module modules/eternal-ai/eternal-ai-service
 * @description Оркестратор нового turn-centric слоя Eternal AI. Сервис хранит
 * явные `turn`, а runtime-данные (`messages`, `trace`, `artifacts`, `effect_jobs`)
 * являются дочерними сущностями одного шага истории.
 */

import { randomUUID } from 'node:crypto';
import type {
	CreateEternalAiArtifactRequest,
	DeleteEternalAiTurnResponse,
	EternalAiArtifactRecord,
	EternalAiConversationSummary,
	EternalAiCreativeEffectItem,
	EternalAiCreativePollResponse,
	EternalAiHealthResponse,
	EternalAiMessageRecord,
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
} from '../../../../packages/contracts/src/eternal-ai.js';
import { renderCanonicalChatMessageToText } from '../../../../packages/contracts/src/canonical-chat-message.js';
import {
	buildArtifact,
	type Artifact,
} from '../../../../packages/kora-core/src/memory/index.js';
import {
	DefaultResponseParser,
	TurnEngine,
	type PromptFragment,
	type TurnTrace,
} from '../../../../packages/kora-core/src/runtime/index.js';
import { isEternalStyleOpenClawProviderId } from '../../../../packages/contracts/src/openclaw-chat-builtins.js';
import type { ServerConfig } from '../../services/config-service.js';
import {
	EternalAiRepository,
	type CreateConversationInput,
} from './eternal-ai-repository.js';
import {
	buildEternalCanonicalMessage,
	buildEternalHiddenPayloadFromParsedResponse,
} from './eternal-ai-canonical-message.js';
import { resolveChatCompletionTransport } from './resolve-openclaw-chat-completion.js';

const ETERNAL_OPEN_ORIGIN = 'https://open.eternalai.org';
const CREATIVE_EFFECTS_URL = `${ETERNAL_OPEN_ORIGIN}/creative-ai/effects`;

/**
 * @description Нужен ли для строки модели ключ Eternal (x-api-key).
 * @param {string} modelRef - legacy id или `provider/model`
 * @returns {boolean}
 */
function usesEternalApiKeyForChatModel(modelRef: string): boolean {
	const trimmed = modelRef.trim();
	if (!trimmed.includes('/')) {
		return true;
	}
	const providerId = trimmed.slice(0, trimmed.indexOf('/'));
	return isEternalStyleOpenClawProviderId(providerId);
}

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

	private static readonly SUPPORTED_ARTIFACT_TYPES = new Set<
		Artifact['artifactType']
	>([
		'dialogue_window',
		'episodic_memory',
		'semantic_memory',
		'session_summary',
		'environment_state',
	]);

	listConversations(): EternalAiConversationSummary[] {
		return this.repository.listConversations();
	}

	listTurns(conversationId: string): EternalAiTurnRecord[] {
		return this.repository.listTurns(conversationId);
	}

	listArtifacts(params: {
		conversationId: string;
		type?: string;
		context?: string;
		limit?: number;
	}): EternalAiArtifactRecord[] {
		return this.repository.listArtifacts(params);
	}

	createSeedArtifact(
		request: CreateEternalAiArtifactRequest
	): EternalAiArtifactRecord {
		const conversation = this.repository.getConversation(
			request.conversationId
		);
		if (!conversation) {
			throw new Error('Диалог для seed memory не найден.');
		}

		const type = this.assertArtifactType(request.type);
		const context = request.context?.trim();
		const text = request.text?.trim();
		if (!context) {
			throw new Error('Для seed memory обязателен context.');
		}
		if (!text) {
			throw new Error('Для seed memory обязателен text.');
		}

		const createdAt = new Date().toISOString();
		const artifact = buildArtifact({
			artifactType: type,
			context,
			sourceType: 'manual_seed',
			sourceId: request.conversationId,
			scope: {
				kind: 'conversation',
				id: request.conversationId,
			},
			text,
			metadata: {
				...(request.metadata || {}),
				writeMode: 'seed',
			},
			createdAt,
			updatedAt: createdAt,
		});

		this.repository.persistArtifacts([artifact]);
		this.repository.updateConversationMetadata({
			conversationId: request.conversationId,
			updatedAt: createdAt,
		});

		return (
			this.repository.getArtifactById(artifact.id) || {
				id: artifact.id,
				type,
				context: artifact.context,
				scope: artifact.scope,
				text: artifact.text,
				sourceType: artifact.sourceType,
				sourceId: artifact.sourceId,
				metadata: artifact.metadata || null,
				createdAt: artifact.createdAt,
				updatedAt: artifact.updatedAt,
				score: artifact.score ?? null,
			}
		);
	}

	updateArtifact(
		request: UpdateEternalAiArtifactRequest
	): EternalAiArtifactRecord {
		const current = this.repository.getArtifactById(request.artifactId);
		if (!current) {
			throw new Error('Artifact для редактирования не найден.');
		}

		const type = this.assertArtifactType(request.type);
		const context = request.context?.trim();
		const text = request.text?.trim();
		if (!context) {
			throw new Error('Для artifact обязателен context.');
		}
		if (!text) {
			throw new Error('Для artifact обязателен text.');
		}

		const updatedAt = new Date().toISOString();
		const updated = this.repository.updateArtifact({
			...request,
			type,
			context,
			text,
			metadata: request.metadata ?? null,
			updatedAt,
		});

		if (!updated) {
			throw new Error('Не удалось сохранить artifact.');
		}

		return updated;
	}

	deleteArtifact(conversationId: string, artifactId: string): boolean {
		return this.repository.deleteArtifact(conversationId, artifactId);
	}

	deleteConversation(conversationId: string): boolean {
		return this.repository.deleteConversation(conversationId);
	}

	deleteTurn(
		conversationId: string,
		turnId: string
	): DeleteEternalAiTurnResponse {
		const conversation = this.repository.getConversation(conversationId);
		if (!conversation) {
			throw new Error('Диалог не найден.');
		}
		if (!conversation.headTurnId) {
			return {
				conversation,
				deleted: false,
				deletedTurnId: null,
			};
		}
		if (conversation.headTurnId !== turnId) {
			throw new Error(
				'Сейчас можно удалить только последний turn (head истории).'
			);
		}

		const turn = this.repository.getTurn(turnId);
		if (!turn) {
			return {
				conversation,
				deleted: false,
				deletedTurnId: null,
			};
		}

		const deleted = this.repository.deleteTurn(turnId);
		if (!deleted) {
			return {
				conversation,
				deleted: false,
				deletedTurnId: null,
			};
		}

		const updatedConversation = this.syncConversationHead({
			conversationId,
			headTurnId: turn.parentTurnId || null,
			updatedAt: new Date().toISOString(),
		});

		return {
			conversation: updatedConversation,
			deleted: true,
			deletedTurnId: turnId,
		};
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
		const now = new Date().toISOString();
		const model =
			request.model || config.eternalAiModel || 'uncensored-eternal-ai-1.0';

		if (usesEternalApiKeyForChatModel(model) && !config.eternalAiApiKey) {
			throw new Error('ETERNAL_AI_API_KEY не задан в конфигурации сервера.');
		}

		const conversation = this.ensureConversation({
			conversationId: request.conversationId,
			model,
			systemPrompt: request.systemPrompt,
			now,
			text: request.text,
		});

		const turn = this.repository.createTurn({
			id: randomUUID(),
			conversationId: conversation.id,
			parentTurnId: conversation.headTurnId || null,
			kind: 'chat',
			status: 'pending',
			model,
			createdAt: now,
			updatedAt: now,
		});

		const userMessageId = randomUUID();
		const userCanonicalMessage = buildEternalCanonicalMessage({
			messageId: userMessageId,
			conversationId: conversation.id,
			role: 'user',
			createdAt: now,
			text: request.text,
		});
		this.repository.insertMessage({
			id: userMessageId,
			conversationId: conversation.id,
			turnId: turn.id,
			role: 'user',
			contentText: renderCanonicalChatMessageToText(userCanonicalMessage),
			model,
			status: 'complete',
			createdAt: now,
			metadata: {
				canonicalMessage: userCanonicalMessage,
			},
		});

		this.repository.updateConversationMetadata({
			conversationId: conversation.id,
			title: this.deriveConversationTitle(conversation.title, request.text),
			model,
			systemPrompt: request.systemPrompt ?? conversation.systemPrompt ?? null,
			headTurnId: turn.id,
			lastMessagePreview: this.buildPreview(request.text),
			lastMessageAt: now,
			updatedAt: now,
		});

		const turnEngine = this.createTurnEngine();
		const effectiveSystemPrompt =
			request.systemPrompt ?? conversation.systemPrompt ?? undefined;
		const recentMessages = this.repository.toRuntimeMessages(conversation.id);

		try {
			const turnResult = await turnEngine.run({
				sessionId: conversation.id,
				modelRef: model,
				userInput: request.text,
				recentMessages,
				baseFragments: this.buildBasePromptFragments(effectiveSystemPrompt),
				artifactQuery: {
					scopeKind: 'conversation',
					scopeId: conversation.id,
					artifactTypes: [
						'semantic_memory',
						'episodic_memory',
						'environment_state',
						'dialogue_window',
					],
					contexts: [
						'persona',
						'relationship',
						'environment',
						'source',
						'user',
					],
					limit: 8,
				},
			});

			const assistantCreatedAt = new Date().toISOString();
			const assistantMessageId = randomUUID();
			const assistantCanonicalMessage = buildEternalCanonicalMessage({
				messageId: assistantMessageId,
				conversationId: conversation.id,
				role: 'assistant',
				createdAt: assistantCreatedAt,
				text:
					turnResult.parsedResponse.displayText ||
					turnResult.parsedResponse.rawText,
				parts: turnResult.parsedResponse.parts,
				hidden: buildEternalHiddenPayloadFromParsedResponse(
					turnResult.parsedResponse
				),
			});
			const assistantDisplayText = renderCanonicalChatMessageToText(
				assistantCanonicalMessage
			);
			const assistantMessage = this.repository.insertMessage({
				id: assistantMessageId,
				conversationId: conversation.id,
				turnId: turn.id,
				role: 'assistant',
				contentText: assistantDisplayText,
				model,
				status: 'complete',
				createdAt: assistantCreatedAt,
				metadata: {
					canonicalMessage: assistantCanonicalMessage,
					parsedResponse: turnResult.parsedResponse,
				},
			});

			this.repository.persistArtifacts(
				this.buildTurnArtifacts({
					conversationId: conversation.id,
					turnId: turn.id,
					assistantMessage,
					parsedResponse: turnResult.parsedResponse,
				}),
				turn.id
			);
			this.repository.insertTurnTrace({
				conversationId: conversation.id,
				turnId: turn.id,
				trace: turnResult.trace,
				status: 'success',
			});
			this.repository.updateTurn(turn.id, {
				status: 'complete',
				updatedAt: assistantCreatedAt,
			});

			this.repository.updateConversationMetadata({
				conversationId: conversation.id,
				model,
				systemPrompt: effectiveSystemPrompt ?? null,
				headTurnId: turn.id,
				lastMessagePreview: this.buildPreview(assistantDisplayText),
				lastMessageAt: assistantCreatedAt,
				updatedAt: assistantCreatedAt,
			});

			return {
				conversation: this.repository.getConversation(
					conversation.id
				) as EternalAiConversationSummary,
				turn: this.repository.getTurn(turn.id) as EternalAiTurnRecord,
			};
		} catch (error) {
			const message = (error as Error).message;
			const failedAt = new Date().toISOString();
			const failedTrace = this.buildFailedTrace({
				conversationId: conversation.id,
				model,
				inputText: request.text,
				systemPrompt: effectiveSystemPrompt,
				errorText: message,
			});
			this.repository.insertTurnTrace({
				conversationId: conversation.id,
				turnId: turn.id,
				trace: failedTrace,
				status: 'error',
				errorText: message,
			});
			this.repository.updateTurn(turn.id, {
				status: 'error',
				errorText: message,
				updatedAt: failedAt,
			});
			this.repository.updateConversationMetadata({
				conversationId: conversation.id,
				model,
				systemPrompt: effectiveSystemPrompt ?? null,
				headTurnId: turn.id,
				lastMessagePreview: this.buildPreview(request.text),
				lastMessageAt: now,
				updatedAt: failedAt,
			});
			throw error;
		}
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
	 * @description Стартует генерацию по Easy Effect и создаёт один pending-turn.
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
		const turn = this.repository.createTurn({
			id: randomUUID(),
			conversationId: conversation.id,
			parentTurnId: conversation.headTurnId || null,
			kind: 'creative_effect',
			status: 'pending',
			model,
			createdAt: now,
			updatedAt: now,
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

		const placeholderAttachmentId = randomUUID();
		const assistantMessageId = randomUUID();
		const pendingAttachments = [
			{
				id: placeholderAttachmentId,
				kind: 'image',
				name: 'Изображение',
				isImage: true,
				isGenerating: true,
				previewSrc: null,
			},
		] satisfies Array<Record<string, unknown>>;
		const pendingCanonicalMessage = buildEternalCanonicalMessage({
			messageId: assistantMessageId,
			conversationId: conversation.id,
			role: 'assistant',
			createdAt: now,
			text: request.effect_tag,
			attachments: pendingAttachments,
		});
		const assistantMessage = this.repository.insertMessage({
			id: assistantMessageId,
			conversationId: conversation.id,
			turnId: turn.id,
			role: 'assistant',
			contentText: renderCanonicalChatMessageToText(pendingCanonicalMessage),
			model,
			status: 'pending',
			createdAt: now,
			metadata: {
				canonicalMessage: pendingCanonicalMessage,
				creativeGenerating: true,
				creativeEffect: true,
				effectId: request.effect_id,
				effectTag: request.effect_tag,
				requestId,
			},
			attachments: pendingAttachments,
		});

		this.repository.insertEffectJob({
			requestId,
			conversationId: conversation.id,
			turnId: turn.id,
			effectId: request.effect_id,
			effectTag: request.effect_tag,
			status: 'pending',
			createdAt: now,
			updatedAt: now,
		});
		this.repository.updateConversationMetadata({
			conversationId: conversation.id,
			model,
			headTurnId: turn.id,
			lastMessagePreview: this.buildPreview(assistantMessage.contentText),
			lastMessageAt: now,
			updatedAt: now,
		});

		return {
			request_id: requestId,
			conversation: this.repository.getConversation(
				conversation.id
			) as EternalAiConversationSummary,
			turn: this.repository.getTurn(turn.id) as EternalAiTurnRecord,
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
		const turn = this.repository.createTurn({
			id: randomUUID(),
			conversationId: conversation.id,
			parentTurnId: conversation.headTurnId || null,
			kind: 'custom_generation',
			status: 'pending',
			model,
			createdAt: now,
			updatedAt: now,
		});

		const payload: Record<string, unknown> = {
			prompt: request.prompt,
			type: request.mode === 'video_generate' ? 'video' : 'image',
		};
		if (request.images?.length) {
			payload.images = request.images;
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

		const isVideoMode = request.mode === 'video_generate';
		const placeholderAttachmentId = randomUUID();
		const assistantMessageId = randomUUID();
		const pendingAttachments = [
			{
				id: placeholderAttachmentId,
				kind: isVideoMode ? 'video' : 'image',
				name: isVideoMode ? 'Видео' : 'Изображение',
				isImage: !isVideoMode,
				isVideo: isVideoMode,
				isGenerating: true,
				previewSrc: null,
			},
		] satisfies Array<Record<string, unknown>>;
		const pendingCanonicalMessage = buildEternalCanonicalMessage({
			messageId: assistantMessageId,
			conversationId: conversation.id,
			role: 'assistant',
			createdAt: now,
			text: request.prompt,
			attachments: pendingAttachments,
		});
		const assistantMessage = this.repository.insertMessage({
			id: assistantMessageId,
			conversationId: conversation.id,
			turnId: turn.id,
			role: 'assistant',
			contentText: renderCanonicalChatMessageToText(pendingCanonicalMessage),
			model,
			status: 'pending',
			createdAt: now,
			metadata: {
				canonicalMessage: pendingCanonicalMessage,
				creativeGenerating: true,
				customGeneration: true,
				mode: request.mode,
				requestId,
			},
			attachments: pendingAttachments,
		});

		this.repository.insertEffectJob({
			requestId,
			conversationId: conversation.id,
			turnId: turn.id,
			effectId: `custom:${request.mode}`,
			effectTag: `Custom ${request.mode}`,
			status: 'pending',
			createdAt: now,
			updatedAt: now,
		});
		this.repository.updateConversationMetadata({
			conversationId: conversation.id,
			model,
			headTurnId: turn.id,
			lastMessagePreview: this.buildPreview(assistantMessage.contentText),
			lastMessageAt: now,
			updatedAt: now,
		});

		return {
			request_id: requestId,
			conversation: this.repository.getConversation(
				conversation.id
			) as EternalAiConversationSummary,
			turn: this.repository.getTurn(turn.id) as EternalAiTurnRecord,
		};
	}

	/**
	 * @description Проверка S4 (промпт + изображения) без записи в историю чата.
	 * @param {EternalAiS4SafetyCheckRequest} request - Те же поля, что у Eternal `/safety-check`.
	 * @returns {Promise<EternalAiS4SafetyCheckResponse>}
	 */
	async safetyCheckS4(
		request: EternalAiS4SafetyCheckRequest
	): Promise<EternalAiS4SafetyCheckResponse> {
		const config = this.getConfig();
		if (!config.eternalAiApiKey) {
			throw new Error('ETERNAL_AI_API_KEY не задан в конфигурации сервера.');
		}
		if (!request.prompt?.trim()) {
			throw new Error('S4: нужен непустой prompt.');
		}

		const images = Array.isArray(request.images) ? request.images : [];
		const response = await fetch(`${ETERNAL_OPEN_ORIGIN}/safety-check`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': config.eternalAiApiKey,
			},
			body: JSON.stringify({
				prompt: request.prompt.trim(),
				images,
			}),
		});

		const payload = (await response.json().catch(() => null)) as Record<
			string,
			unknown
		> | null;

		if (!response.ok) {
			const detail =
				(typeof payload?.detail === 'string' ? payload.detail : null) ||
				(typeof payload?.error === 'string' ? payload.error : null) ||
				`HTTP ${response.status}`;
			throw new Error(`Eternal S4 safety-check: ${detail}`);
		}

		const is_s4 = Boolean(payload?.is_s4);
		const rawDetail = payload?.detail;
		let detail: EternalAiS4SafetyCheckResponse['detail'];
		if (
			rawDetail &&
			typeof rawDetail === 'object' &&
			!Array.isArray(rawDetail)
		) {
			const d = rawDetail as Record<string, unknown>;
			const text = Array.isArray(d.text)
				? d.text.filter((x): x is string => typeof x === 'string')
				: undefined;
			const image = Array.isArray(d.image)
				? d.image.filter((x): x is string => typeof x === 'string')
				: undefined;
			detail = {};
			if (text?.length) {
				detail.text = text;
			}
			if (image?.length) {
				detail.image = image;
			}
		}

		const request_id =
			typeof payload?.request_id === 'string' ? payload.request_id : undefined;

		return {
			is_s4,
			...(detail && Object.keys(detail).length ? { detail } : {}),
			...(request_id ? { request_id } : {}),
		};
	}

	/**
	 * @description Проксирует poll-result и дозаписывает результат в pending-turn.
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

		if (job.status === 'success') {
			return {
				request_id: requestId,
				status: 'success',
				progress: 100,
				result_url: job.result_url || undefined,
				completed: true,
				turn: this.repository.getTurn(job.turn_id),
			};
		}
		if (job.status === 'error') {
			return {
				request_id: requestId,
				status: 'error',
				error: job.error_text || 'Ошибка генерации',
				completed: true,
				turn: this.repository.getTurn(job.turn_id),
			};
		}

		const turn = this.repository.getTurn(job.turn_id);
		if (!turn) {
			throw new Error('Turn визуальной генерации не найден.');
		}

		const anchorJobMessage = turn.assistantMessage;
		const pendingAssistantFlow = Boolean(
			anchorJobMessage &&
			anchorJobMessage.role === 'assistant' &&
			anchorJobMessage.status === 'pending'
		);

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

		if (resultUrl && pendingAssistantFlow && anchorJobMessage) {
			const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(resultUrl);
			const prevAtt = anchorJobMessage.attachments?.[0] as
				| Record<string, unknown>
				| undefined;
			const attId = typeof prevAtt?.id === 'string' ? prevAtt.id : randomUUID();
			const completedAttachments = [
				{
					id: attId,
					kind: isVideo ? 'video' : 'image',
					name: isVideo ? 'Видео' : 'Изображение',
					previewSrc: resultUrl,
					isImage: !isVideo,
					isVideo,
					isGenerating: false,
				},
			] satisfies Array<Record<string, unknown>>;
			const completedCanonicalMessage = buildEternalCanonicalMessage({
				messageId: anchorJobMessage.id,
				conversationId: job.conversation_id,
				role: 'assistant',
				createdAt: anchorJobMessage.createdAt,
				text: anchorJobMessage.contentText,
				attachments: completedAttachments,
			});
			const assistantMessage = this.repository.updateMessage(
				anchorJobMessage.id,
				{
					status: 'complete',
					attachments: completedAttachments,
					metadata: {
						canonicalMessage: completedCanonicalMessage,
						creativeGenerating: false,
						requestId,
						resultUrl,
					},
				}
			);
			if (!assistantMessage) {
				throw new Error('Не удалось обновить сообщение ассистента.');
			}

			this.repository.updateTurn(job.turn_id, {
				status: 'complete',
				updatedAt,
			});
			this.repository.updateEffectJob(requestId, {
				status: 'success',
				result_url: resultUrl,
				updatedAt,
			});
			this.repository.updateConversationMetadata({
				conversationId: job.conversation_id,
				headTurnId: job.turn_id,
				lastMessagePreview: this.buildPreview(assistantMessage.contentText),
				lastMessageAt: updatedAt,
				updatedAt,
			});

			return {
				request_id: requestId,
				status: 'success',
				progress: progress ?? 100,
				result_url: resultUrl,
				completed: true,
				turn: this.repository.getTurn(job.turn_id),
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

			if (pendingAssistantFlow && anchorJobMessage) {
				const errorCanonicalMessage = buildEternalCanonicalMessage({
					messageId: anchorJobMessage.id,
					conversationId: job.conversation_id,
					role: 'assistant',
					createdAt: anchorJobMessage.createdAt,
					text: anchorJobMessage.contentText,
					attachments: [],
				});
				const assistantMessage = this.repository.updateMessage(
					anchorJobMessage.id,
					{
						status: 'error',
						errorText: String(detail),
						attachments: [],
						metadata: {
							canonicalMessage: errorCanonicalMessage,
							creativeGenerating: false,
							creativeEffectError: true,
							effectId: job.effect_id,
							requestId,
						},
					}
				);
				if (!assistantMessage) {
					throw new Error('Не удалось записать ошибку в сообщение ассистента.');
				}

				this.repository.updateTurn(job.turn_id, {
					status: 'error',
					errorText: String(detail),
					updatedAt,
				});
				this.repository.updateEffectJob(requestId, {
					status: 'error',
					error_text: String(detail),
					updatedAt,
				});
				this.repository.updateConversationMetadata({
					conversationId: job.conversation_id,
					headTurnId: job.turn_id,
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
					turn: this.repository.getTurn(job.turn_id),
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

	private createTurnEngine(): TurnEngine {
		return new TurnEngine({
			artifactStore: this.repository,
			modelGateway: {
				complete: request => this.requestCompletion(request),
			},
			responseParser: new DefaultResponseParser(),
		});
	}

	private buildBasePromptFragments(systemPrompt?: string): PromptFragment[] {
		const fragments: PromptFragment[] = [];

		if (systemPrompt?.trim()) {
			fragments.unshift({
				id: 'eternal-runtime-identity-v1',
				layer: 'identity',
				priority: 200,
				source: 'conversation:system-prompt',
				text: systemPrompt.trim(),
			});
		}

		return fragments;
	}

	/**
	 * @description Артефакты из успешного turn: кандидаты памяти и patch окружения.
	 * Окно пары реплик (dialogue_window/source) в память не кладём — оно дублирует историю сообщений в БД.
	 * @param params - id диалога, turn и разобранный ответ.
	 * @returns {Artifact[]} Пустой массив, если нет memoryCandidates и environmentPatch.
	 */
	private buildTurnArtifacts(params: {
		conversationId: string;
		turnId: string;
		assistantMessage: EternalAiMessageRecord;
		parsedResponse: ReturnType<DefaultResponseParser['parse']>;
	}): Artifact[] {
		const baseCreatedAt = params.assistantMessage.createdAt;
		const artifacts: Artifact[] = [];

		for (const candidate of params.parsedResponse.memoryCandidates) {
			artifacts.push(
				buildArtifact({
					artifactType: 'semantic_memory',
					context: 'relationship',
					sourceType: 'runtime_session',
					sourceId: params.conversationId,
					scope: {
						kind: 'conversation',
						id: params.conversationId,
					},
					text: candidate,
					sourceRefs: [params.assistantMessage.id],
					metadata: {
						fromTrace: 'memory_candidate',
						writeMode: 'runtime_extract',
						turnId: params.turnId,
					},
					createdAt: baseCreatedAt,
					updatedAt: baseCreatedAt,
				})
			);
		}

		if (params.parsedResponse.environmentPatch) {
			artifacts.push(
				buildArtifact({
					artifactType: 'environment_state',
					context: 'environment',
					sourceType: 'runtime_session',
					sourceId: params.conversationId,
					scope: {
						kind: 'conversation',
						id: params.conversationId,
					},
					text: JSON.stringify(params.parsedResponse.environmentPatch, null, 2),
					sourceRefs: [params.assistantMessage.id],
					metadata: {
						...(params.parsedResponse.environmentPatch || {}),
						writeMode: 'runtime_extract',
						turnId: params.turnId,
					},
					createdAt: baseCreatedAt,
					updatedAt: baseCreatedAt,
				})
			);
		}

		return artifacts;
	}

	private buildFailedTrace(params: {
		conversationId: string;
		model: string;
		inputText: string;
		systemPrompt?: string;
		errorText: string;
	}): TurnTrace {
		const startedAt = new Date().toISOString();
		const promptFragments = this.buildBasePromptFragments(params.systemPrompt);
		const assembledPrompt = promptFragments
			.map(fragment => fragment.text)
			.join('\n\n');
		return {
			id: randomUUID(),
			sessionId: params.conversationId,
			modelRef: params.model,
			inputMessage: params.inputText,
			recalledArtifacts: [],
			promptFragments,
			assembledPrompt,
			rawResponse: '',
			parsedResponse: {
				rawText: '',
				assistantText: '',
				parts: [],
				actions: [],
				privateThoughts: [],
				memoryCandidates: [],
				displayText: '',
				usedStructuredBlocks: false,
			},
			errors: [params.errorText],
			timingsMs: {},
			startedAt,
			finishedAt: startedAt,
		};
	}

	private async requestCompletion(params: {
		modelRef: string;
		assembledPrompt: string;
		recentMessages: ReturnType<EternalAiRepository['toRuntimeMessages']>;
	}): Promise<string> {
		const config = this.getConfig();
		const transport = resolveChatCompletionTransport(params.modelRef, {
			baseUrl: config.eternalAiBaseUrl || 'https://open.eternalai.org/v1',
			apiKey: config.eternalAiApiKey || '',
		});

		const messages = [
			{
				role: 'system',
				content: params.assembledPrompt,
			},
			...params.recentMessages.map(message => ({
				role:
					message.actor === 'assistant'
						? 'assistant'
						: message.actor === 'system'
							? 'system'
							: 'user',
				content: message.text,
			})),
		];

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (transport.kind === 'eternal_x_api_key') {
			headers['x-api-key'] = transport.apiKey;
		} else {
			headers.Authorization = `Bearer ${transport.apiKey}`;
		}

		const response = await fetch(`${transport.baseUrl}/chat/completions`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				model: transport.upstreamModelId,
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
					`Chat completions HTTP ${response.status}: ${response.statusText}`
			);
		}

		const payload = (await response.json()) as EternalChatCompletionResponse;
		const content = payload.choices?.[0]?.message?.content;
		const text = this.extractContentText(content);

		if (!text) {
			throw new Error('Модель вернула пустой ответ.');
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

	private assertArtifactType(
		type: string
	): CreateEternalAiArtifactRequest['type'] {
		if (
			EternalAiService.SUPPORTED_ARTIFACT_TYPES.has(
				type as Artifact['artifactType']
			)
		) {
			return type as CreateEternalAiArtifactRequest['type'];
		}
		throw new Error(`Неподдерживаемый artifact type: ${type}`);
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

	private syncConversationHead(params: {
		conversationId: string;
		headTurnId?: string | null;
		updatedAt: string;
	}): EternalAiConversationSummary | null {
		const lastMessage = this.repository.getLastMessageForConversation(
			params.conversationId
		);
		this.repository.updateConversationMetadata({
			conversationId: params.conversationId,
			headTurnId: params.headTurnId ?? null,
			lastMessagePreview: lastMessage
				? this.buildPreview(lastMessage.contentText)
				: null,
			lastMessageAt: lastMessage?.createdAt || null,
			updatedAt: params.updatedAt,
		});

		return this.repository.getConversation(params.conversationId);
	}
}
