/**
 * @module features/eternal-ai/model/use-eternal-ai-screen
 * @description Composable экрана Eternal AI. Управляет локальным списком
 * диалогов, загрузкой истории из Kora server и отправкой новых сообщений в
 * OpenAI-compatible Eternal endpoint через серверный модуль. Поддерживает
 * каталог Creative (Easy Effect) и асинхронную генерацию через poll.
 * Список моделей чата подгружается из `openclaw.json` (Open Claw).
 */

import { computed, ref, watch } from 'vue';
import type {
	EternalAiArtifactRecord,
	EternalAiConversationSummary,
	EternalAiCustomMode,
	EternalAiCreativeEffectItem,
	EternalAiHealthResponse,
	EternalAiMessageRecord,
	EternalAiS4SafetyCheckResponse,
	EternalAiTurnTraceRecord,
} from '../../../../../../packages/contracts/src/eternal-ai';
import {
	ChatTimelineEternalTurnConversation,
	ChatTimelineEternalTurnDebug,
	useScreenMessage,
} from '../../../ui-vue';
import type {
	ChatTimelineEternalConversationTurnItem,
	ChatTimelineEternalDebugTurnItem,
	ChatTimelineEternalTracePayload,
	ChatTimelineItem,
	ChatTimelineMessageItem,
} from '../../../ui-vue';
import type { EternalAiTransportPort } from '../ports/eternal-ai-transport-port';
import { loadOpenClawChatModelsFromDisk } from '../lib/load-openclaw-chat-models';
import type { OpenClawChatModelOption } from '../lib/load-openclaw-chat-models';

export interface EternalAiScreenModelOptions {
	transport: EternalAiTransportPort;
	defaultSystemPrompt?: string;
	/** Текущая строка модели: legacy id без `/` или ref `provider/model` (настройки плагина / сервер). */
	getPersistedChatModelId: () => string;
	/** Сохранить выбранную модель и синхронизировать Kora server (saveSettings плагина). */
	persistChatModelId: (modelRef: string) => Promise<void>;
}

const getRoleLabel = (role: EternalAiMessageRecord['role']): string => {
	if (role === 'assistant') return 'Eternal AI';
	if (role === 'system') return 'System';
	return 'You';
};

const getRoleInitials = (role: EternalAiMessageRecord['role']): string => {
	if (role === 'assistant') return 'EA';
	if (role === 'system') return 'SY';
	return 'YU';
};

const mapMessageAttachments = (
	message: EternalAiMessageRecord
): ChatTimelineMessageItem['attachments'] => {
	const raw = message.attachments;
	if (!raw?.length) {
		return undefined;
	}

	return raw.map((item, index) => {
		const rec = item as Record<string, unknown>;
		return {
			id: String(rec.id ?? `${message.id}-att-${index}`),
			kind: String(rec.kind ?? 'file'),
			name: String(rec.name ?? 'Вложение'),
			description:
				typeof rec.description === 'string' ? rec.description : undefined,
			previewSrc: typeof rec.previewSrc === 'string' ? rec.previewSrc : null,
			isGenerating: Boolean(rec.isGenerating),
			isImage: Boolean(rec.isImage),
			isVideo: Boolean(rec.isVideo),
			size: typeof rec.size === 'number' ? rec.size : null,
			mimeType: typeof rec.mimeType === 'string' ? rec.mimeType : null,
		};
	});
};

const sleep = (ms: number): Promise<void> =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});

/**
 * @description Три «виртуальных» пункта каталога: base generate без effect_id Eternal.
 * Показываются первыми в списке с фиксированными ценами (условные единицы API).
 */
const KORA_CUSTOM_CATALOG_ITEMS: EternalAiCreativeEffectItem[] = [
	{
		effect_id: '__kora_custom_photo_generate__',
		tag: 'Генерация фото (свой промпт)',
		effect_type: 'image',
		price: 0.76,
		model_id: 'custom-base',
	},
	{
		effect_id: '__kora_custom_photo_edit__',
		tag: 'Редактирование фото',
		effect_type: 'image',
		price: 0.76,
		model_id: 'custom-base',
	},
	{
		effect_id: '__kora_custom_video_generate__',
		tag: 'Генерация видео',
		effect_type: 'video',
		price: 4,
		model_id: 'custom-base',
	},
];

const KORA_CUSTOM_ID_TO_MODE: Record<string, EternalAiCustomMode> = {
	__kora_custom_photo_generate__: 'photo_generate',
	__kora_custom_photo_edit__: 'photo_edit',
	__kora_custom_video_generate__: 'video_generate',
};

/**
 * @description Проверка id эффекта из блока KORA_CUSTOM_CATALOG_ITEMS.
 * @param {string} effectId - effect_id карточки
 * @returns {boolean}
 */
function isKoraCustomCatalogEffectId(effectId: string): boolean {
	return Boolean(KORA_CUSTOM_ID_TO_MODE[effectId]);
}

/**
 * @description Извлекает `traceId` из `metadata` сообщения (assistant / user после error-path).
 * @param {EternalAiMessageRecord} message - сообщение Eternal AI
 * @returns {string | null}
 */
function getTraceIdFromMessage(message: EternalAiMessageRecord): string | null {
	const meta = message.metadata;
	if (!meta || typeof meta !== 'object') {
		return null;
	}
	const id = (meta as Record<string, unknown>).traceId;
	return typeof id === 'string' ? id : null;
}

/**
 * @description Собирает DTO инспектора ленты из записи turn trace.
 * @param {EternalAiTurnTraceRecord} trace - снимок с сервера
 * @returns {ChatTimelineEternalTracePayload}
 */
function buildTimelineTracePayload(
	trace: EternalAiTurnTraceRecord
): ChatTimelineEternalTracePayload {
	return {
		traceId: trace.id,
		model: trace.model,
		status: trace.status,
		promptText: trace.promptText,
		rawResponse: trace.rawResponse,
		runtimeExtraction: trace.runtimeExtraction
			? {
					actions: trace.runtimeExtraction.actions,
					memoryCandidates: trace.runtimeExtraction.memoryCandidates,
					environmentPatchPretty: trace.runtimeExtraction.environmentPatch
						? JSON.stringify(trace.runtimeExtraction.environmentPatch, null, 2)
						: '',
					usedStructuredBlocks: trace.runtimeExtraction.usedStructuredBlocks,
				}
			: null,
		recalledArtifacts: trace.recalledArtifacts.map(artifact => ({
			id: artifact.id,
			type: artifact.type,
			context: artifact.context,
			sourceLabel: `${artifact.sourceType}:${artifact.sourceId}`,
			scopeLabel: artifact.scope.id
				? `${artifact.scope.kind}:${artifact.scope.id}`
				: artifact.scope.kind,
			text: artifact.text,
			score: artifact.score ?? null,
		})),
		promptFragments: trace.promptFragments.map(fragment => ({
			id: fragment.id,
			layer: fragment.layer,
			priority: fragment.priority,
			source: fragment.source,
			text: fragment.text,
		})),
		timingsMs: trace.timingsMs,
		errorText: trace.errorText ?? null,
		startedAt: trace.startedAt,
		finishedAt: trace.finishedAt,
	};
}

/**
 * @description Нормализует одно сообщение Eternal AI в универсальный bubble-item.
 * Этот item используется и как самостоятельная строка (system), и как часть turn renderer.
 * @param {EternalAiMessageRecord} message - исходное сообщение из БД
 * @returns {ChatTimelineMessageItem}
 */
function mapMessageToTimelineMessage(
	message: EternalAiMessageRecord
): ChatTimelineMessageItem {
	const role = message.role;
	const isUser = role === 'user';
	return {
		id: message.id,
		rawPayload: message,
		role,
		align: isUser ? 'end' : role === 'system' ? 'center' : 'start',
		author: getRoleLabel(role),
		initials: getRoleInitials(role),
		meta: [
			message.createdAt
				? new Date(message.createdAt).toLocaleString()
				: 'ещё не было',
			message.model || null,
		]
			.filter(Boolean)
			.join(' · '),
		text: message.contentText,
		attachments: mapMessageAttachments(message),
		badges:
			message.status === 'error' && message.errorText
				? [message.errorText]
				: [],
		accent: isUser
			? {
					avatarBg: 'var(--interactive-accent)',
					avatarText: 'white',
					bubbleBg: 'rgba(var(--interactive-accent-rgb, 124, 92, 255), 0.12)',
					bubbleBorder:
						'rgba(var(--interactive-accent-rgb, 124, 92, 255), 0.25)',
				}
			: role === 'system'
				? {
						avatarBg: 'hsl(42 74% 52%)',
						avatarText: 'rgba(255, 255, 255, 0.95)',
						bubbleBg: 'rgba(66, 53, 19, 0.9)',
						bubbleBorder: 'rgba(255, 208, 87, 0.22)',
					}
				: {
						avatarBg: 'hsl(195 40% 44%)',
						avatarText: 'rgba(255, 255, 255, 0.95)',
						bubbleBg: 'rgba(29, 29, 29, 0.96)',
						bubbleBorder: 'rgba(255, 255, 255, 0.08)',
					},
	};
}

/**
 * @description Собирает turn-item для обычного режима чата: одна строка ленты
 * соответствует одному runtime turn, внутри которого уже user/assistant bubbles.
 * @param params - Нормализованные части turn
 * @returns {ChatTimelineEternalConversationTurnItem}
 */
function buildConversationTurnItem(params: {
	turnId: string;
	userMessage?: ChatTimelineMessageItem | null;
	assistantMessage?: ChatTimelineMessageItem | null;
	trace?: ChatTimelineEternalTracePayload | null;
	rawPayload: Record<string, unknown>;
}): ChatTimelineEternalConversationTurnItem {
	return {
		id: params.turnId,
		kind: 'custom',
		renderer: ChatTimelineEternalTurnConversation,
		rendererProps: {
			turnId: params.turnId,
			userMessage: params.userMessage ?? null,
			assistantMessage: params.assistantMessage ?? null,
			trace: params.trace ?? null,
		},
		rawPayload: params.rawPayload,
	};
}

/**
 * @description Собирает turn-item для полного debug-режима: friendly output и
 * trace показываются в одном renderer-блоке без доп. раскрывашек.
 * @param params - Нормализованные части turn
 * @returns {ChatTimelineEternalDebugTurnItem}
 */
function buildDebugTurnItem(params: {
	turnId: string;
	userMessage?: ChatTimelineMessageItem | null;
	assistantMessage?: ChatTimelineMessageItem | null;
	trace?: ChatTimelineEternalTracePayload | null;
	rawPayload: Record<string, unknown>;
}): ChatTimelineEternalDebugTurnItem {
	return {
		id: params.turnId,
		kind: 'custom',
		renderer: ChatTimelineEternalTurnDebug,
		rendererProps: {
			turnId: params.turnId,
			userMessage: params.userMessage ?? null,
			assistantMessage: params.assistantMessage ?? null,
			trace: params.trace ?? null,
		},
		rawPayload: params.rawPayload,
	};
}

export function useEternalAiScreen(options: EternalAiScreenModelOptions) {
	const conversations = ref<EternalAiConversationSummary[]>([]);
	const selectedConversationId = ref<string | null>(null);
	const messages = ref<EternalAiMessageRecord[]>([]);
	const draft = ref('');
	const health = ref<EternalAiHealthResponse | null>(null);
	const isRefreshing = ref(false);
	const isLoadingMessages = ref(false);
	const isSending = ref(false);
	const isDeletingConversationId = ref<string | null>(null);
	const isDeletingMessageId = ref<string | null>(null);
	const isDeletingArtifactId = ref<string | null>(null);
	const isUpdatingArtifactId = ref<string | null>(null);
	const isLoadingArtifacts = ref(false);
	const isCreatingArtifact = ref(false);
	const turnTraces = ref<EternalAiTurnTraceRecord[]>([]);
	const artifacts = ref<EternalAiArtifactRecord[]>([]);
	/** Включён ли режим полного debug turn в ленте; выключен — обычный диалог. */
	const timelineDebugEnabled = ref(false);
	const leftTab = ref<'chats' | 'effects' | 'debug'>('chats');
	const creativeEffects = ref<EternalAiCreativeEffectItem[]>([]);
	const effectsQuery = ref('');
	const selectedEffectId = ref<string | null>(null);
	/** Общий исходный кадр для Easy Effect и кастомных карточек каталога. */
	const visualSourceDataUrl = ref<string | null>(null);
	const isLoadingEffects = ref(false);
	const isCreativeRunning = ref(false);
	const customMode = ref<EternalAiCustomMode>('photo_generate');
	const isCustomRunning = ref(false);
	/**
	 * @description Текст отладки под композером: ошибка S4 или отказ по is_s4 перед base generate.
	 * Очищается при правке черновика и смене кадра.
	 */
	const customS4DebugError = ref<string | null>(null);

	const chatModelOptions = ref<OpenClawChatModelOption[]>([]);
	const openClawConfigPath = ref<string | null>(null);
	const openClawCatalogError = ref<string | null>(null);
	const selectedChatModelRef = ref(
		options.getPersistedChatModelId().trim() || 'uncensored-eternal-ai-1.0'
	);

	const screen = useScreenMessage();

	watch(draft, () => {
		customS4DebugError.value = null;
	});

	const selectedConversation = computed(
		() =>
			conversations.value.find(
				conversation => conversation.id === selectedConversationId.value
			) || null
	);

	const selectedEffect = computed((): EternalAiCreativeEffectItem | null => {
		const id = selectedEffectId.value;
		if (!id) {
			return null;
		}
		const builtin = KORA_CUSTOM_CATALOG_ITEMS.find(
			effect => effect.effect_id === id
		);
		if (builtin) {
			return builtin;
		}
		return (
			creativeEffects.value.find(effect => effect.effect_id === id) || null
		);
	});

	const isCustomCatalogEffectSelected = computed(() =>
		selectedEffectId.value
			? isKoraCustomCatalogEffectId(selectedEffectId.value)
			: false
	);

	const traceById = computed(() => {
		const map = new Map<string, EternalAiTurnTraceRecord>();
		for (const trace of turnTraces.value) {
			map.set(trace.id, trace);
		}
		return map;
	});

	const canManageArtifacts = computed(() =>
		Boolean(selectedConversationId.value)
	);

	const filteredEffects = computed((): EternalAiCreativeEffectItem[] => {
		const query = effectsQuery.value.trim().toLowerCase();
		const remote = creativeEffects.value;
		const match = (tag: string): boolean =>
			!query || tag.toLowerCase().includes(query);

		const head = KORA_CUSTOM_CATALOG_ITEMS.filter(e => match(e.tag));
		const tail = !query ? remote : remote.filter(effect => match(effect.tag));

		return [...head, ...tail];
	});

	const timelineItems = computed<ChatTimelineItem[]>(() => {
		const traces = traceById.value;
		const items: ChatTimelineItem[] = [];
		const usedMessageIds = new Set<string>();
		const buildTurnItem = timelineDebugEnabled.value
			? buildDebugTurnItem
			: buildConversationTurnItem;

		for (let index = 0; index < messages.value.length; index += 1) {
			const message = messages.value[index];
			if (usedMessageIds.has(message.id)) {
				continue;
			}

			if (message.role === 'system') {
				usedMessageIds.add(message.id);
				items.push(mapMessageToTimelineMessage(message));
				continue;
			}

			if (message.role === 'user') {
				const nextMessage = messages.value[index + 1];
				const currentTraceId = getTraceIdFromMessage(message);
				const nextTraceId =
					nextMessage?.role === 'assistant'
						? getTraceIdFromMessage(nextMessage)
						: null;
				const trace =
					(currentTraceId ? traces.get(currentTraceId) : undefined) ||
					(nextTraceId ? traces.get(nextTraceId) : undefined) ||
					null;
				const assistantMessage =
					nextMessage?.role === 'assistant' ? nextMessage : null;

				if (assistantMessage) {
					usedMessageIds.add(assistantMessage.id);
				}
				usedMessageIds.add(message.id);

				items.push(
					buildTurnItem({
						turnId: trace?.id || assistantMessage?.id || message.id,
						userMessage: mapMessageToTimelineMessage(message),
						assistantMessage: assistantMessage
							? mapMessageToTimelineMessage(assistantMessage)
							: null,
						trace: trace ? buildTimelineTracePayload(trace) : null,
						rawPayload: {
							type: 'eternal-turn',
							mode: timelineDebugEnabled.value ? 'debug' : 'conversation',
							userMessage: message,
							assistantMessage,
							trace,
						},
					})
				);
				continue;
			}

			usedMessageIds.add(message.id);
			const traceId = getTraceIdFromMessage(message);
			const trace = traceId ? traces.get(traceId) : null;
			items.push(
				buildTurnItem({
					turnId: trace?.id || message.id,
					userMessage: null,
					assistantMessage: mapMessageToTimelineMessage(message),
					trace: trace ? buildTimelineTracePayload(trace) : null,
					rawPayload: {
						type: 'eternal-turn',
						mode: timelineDebugEnabled.value ? 'debug' : 'conversation',
						userMessage: null,
						assistantMessage: message,
						trace,
					},
				})
			);
		}

		return items;
	});

	const systemPromptSummary = computed(() => {
		const prompt =
			selectedConversation.value?.systemPrompt ||
			options.defaultSystemPrompt ||
			'';
		if (!prompt) {
			return 'System prompt не задан';
		}
		const normalized = prompt.replace(/\s+/g, ' ').trim();
		return normalized.length <= 96 ? normalized : `${normalized.slice(0, 95)}…`;
	});

	/**
	 * @description Подгружает историю выбранного диалога. Режим {@code silent} не
	 * включает полноэкранный loading у ленты — контейнер с scroll не размонтируется,
	 * позиция прокрутки сохраняется (нужно при poll генерации).
	 * @param {string | null} conversationId - id диалога или null
	 * @param {{ silent?: boolean }} loadOpts - {@code silent: true} — без isLoadingMessages
	 * @returns {Promise<void>}
	 */
	const loadMessages = async (
		conversationId: string | null,
		loadOpts?: { silent?: boolean }
	): Promise<void> => {
		if (!conversationId) {
			messages.value = [];
			turnTraces.value = [];
			return;
		}

		const silent = Boolean(loadOpts?.silent);
		if (!silent) {
			isLoadingMessages.value = true;
		}
		try {
			messages.value = await options.transport.listMessages(conversationId);
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось загрузить историю Eternal AI: ${(error as Error).message}`
			);
		} finally {
			if (!silent) {
				isLoadingMessages.value = false;
			}
		}
	};

	const loadTurnTraces = async (
		conversationId: string | null,
		_loadOpts?: { silent?: boolean }
	): Promise<void> => {
		if (!conversationId) {
			turnTraces.value = [];
			return;
		}

		try {
			turnTraces.value = await options.transport.listTurnTraces(
				conversationId,
				20
			);
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось загрузить trace Eternal AI: ${(error as Error).message}`
			);
		}
	};

	const loadArtifacts = async (
		conversationId: string | null,
		loadOpts?: { silent?: boolean }
	): Promise<void> => {
		if (!conversationId) {
			artifacts.value = [];
			return;
		}

		const silent = Boolean(loadOpts?.silent);
		if (!silent) {
			isLoadingArtifacts.value = true;
		}
		try {
			artifacts.value = await options.transport.listArtifacts(conversationId, {
				limit: 100,
			});
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось загрузить artifacts Eternal AI: ${(error as Error).message}`
			);
		} finally {
			if (!silent) {
				isLoadingArtifacts.value = false;
			}
		}
	};

	const loadCreativeEffects = async (): Promise<void> => {
		isLoadingEffects.value = true;
		try {
			creativeEffects.value = await options.transport.listCreativeEffects();
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось загрузить каталог эффектов: ${(error as Error).message}`
			);
		} finally {
			isLoadingEffects.value = false;
		}
	};

	/**
	 * @description Перечитывает `openclaw.json` и заполняет список опций моделей чата.
	 * @returns {ReturnType<typeof loadOpenClawChatModelsFromDisk>} Последний снимок Open Claw для reconcile.
	 */
	const syncOpenClawChatModels = (): ReturnType<
		typeof loadOpenClawChatModelsFromDisk
	> => {
		const oc = loadOpenClawChatModelsFromDisk();
		openClawConfigPath.value = oc.configPath;
		if (oc.error) {
			openClawCatalogError.value = oc.error;
		} else if (oc.options.length === 0) {
			openClawCatalogError.value =
				'В openclaw.json нет моделей для чата: задайте agents.defaults.models или models.providers (OpenAI-compatible / Eternal).';
		} else {
			openClawCatalogError.value = null;
		}
		const fb =
			options.getPersistedChatModelId().trim() || 'uncensored-eternal-ai-1.0';
		const fbApi = fb.includes('/') ? fb.slice(fb.indexOf('/') + 1) : fb;
		chatModelOptions.value =
			oc.options.length > 0
				? oc.options
				: [
						{
							openClawRef: fb,
							apiModelId: fbApi,
							label: `${fb} (только настройки Kora)`,
						},
					];
		return oc;
	};

	/**
	 * @description Согласует выбранную модель с каталогом Open Claw и настройками плагина.
	 * @param {{ defaultOpenClawRef: string | null }} oc - результат последнего `syncOpenClawChatModels`
	 * @returns {Promise<void>}
	 */
	const reconcileChatModelSelection = async (oc: {
		defaultOpenClawRef: string | null;
	}): Promise<void> => {
		const effective = chatModelOptions.value;
		if (effective.length === 0) {
			return;
		}
		const persisted = options.getPersistedChatModelId().trim();
		let nextRef =
			persisted || effective[0]?.openClawRef || 'uncensored-eternal-ai-1.0';
		if (!effective.some(option => option.openClawRef === nextRef)) {
			const primary =
				oc.defaultOpenClawRef &&
				effective.some(option => option.openClawRef === oc.defaultOpenClawRef)
					? oc.defaultOpenClawRef
					: null;
			nextRef = primary || effective[0].openClawRef;
		}
		selectedChatModelRef.value = nextRef;
		if (nextRef !== persisted) {
			await options.persistChatModelId(nextRef);
		}
	};

	/**
	 * @description Устанавливает ref модели чата, сохраняет в настройках и на сервере.
	 * @param {string} modelRef - legacy id или `provider/model`
	 * @returns {Promise<void>}
	 */
	const setSelectedChatModelRef = async (modelRef: string): Promise<void> => {
		if (selectedChatModelRef.value === modelRef) {
			return;
		}
		selectedChatModelRef.value = modelRef;
		await options.persistChatModelId(modelRef);
	};

	/**
	 * @description Полное обновление экрана. {@code silentMessages} — обновить список
	 * сообщений без сброса scroll ленты; {@code skipCreativeEffects} — не дергать каталог
	 * эффектов (после завершения генерации).
	 * @param {string | null} [nextConversationId] - Выбрать диалог после загрузки списка
	 * @param {{ silentMessages?: boolean; skipCreativeEffects?: boolean }} [refreshOpts] - Опции
	 * @returns {Promise<void>}
	 */
	const refreshData = async (
		nextConversationId?: string | null,
		refreshOpts?: { silentMessages?: boolean; skipCreativeEffects?: boolean }
	): Promise<void> => {
		isRefreshing.value = true;
		try {
			const ocSnapshot = syncOpenClawChatModels();
			await reconcileChatModelSelection(ocSnapshot);

			health.value = await options.transport.getHealth();
			conversations.value = await options.transport.listConversations();
			if (!refreshOpts?.skipCreativeEffects) {
				await loadCreativeEffects();
			}

			const hasRequestedConversation =
				nextConversationId &&
				conversations.value.some(
					conversation => conversation.id === nextConversationId
				);

			if (hasRequestedConversation) {
				selectedConversationId.value = nextConversationId as string;
			} else if (
				selectedConversationId.value &&
				conversations.value.some(
					conversation => conversation.id === selectedConversationId.value
				)
			) {
				// keep current selection
			} else {
				selectedConversationId.value = conversations.value[0]?.id || null;
			}

			await loadMessages(selectedConversationId.value, {
				silent: refreshOpts?.silentMessages,
			});
			await Promise.all([
				loadTurnTraces(selectedConversationId.value, {
					silent: refreshOpts?.silentMessages,
				}),
				loadArtifacts(selectedConversationId.value, {
					silent: refreshOpts?.silentMessages,
				}),
			]);

			if (health.value.status !== 'healthy') {
				screen.setMessage(
					'warning',
					health.value.error ||
						'Eternal AI настроен не полностью. Проверьте API key и base URL.'
				);
			}
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось обновить Eternal AI экран: ${(error as Error).message}`
			);
		} finally {
			isRefreshing.value = false;
		}
	};

	const selectConversation = async (conversationId: string): Promise<void> => {
		if (selectedConversationId.value === conversationId) {
			return;
		}

		selectedConversationId.value = conversationId;
		await Promise.all([
			loadMessages(conversationId),
			loadTurnTraces(conversationId),
			loadArtifacts(conversationId),
		]);
	};

	const startNewConversation = (): void => {
		selectedConversationId.value = null;
		messages.value = [];
		artifacts.value = [];
		turnTraces.value = [];
		screen.setMessage(
			'neutral',
			'Новый чат начнётся с первого отправленного сообщения.'
		);
	};

	/**
	 * @description Создание artifact (POST artifacts) для модалки «новая запись» в списке.
	 */
	const createArtifactManual = async (params: {
		type: EternalAiArtifactRecord['type'];
		context: string;
		text: string;
		metadata?: Record<string, unknown> | null;
	}): Promise<boolean> => {
		const conversationId = selectedConversationId.value;
		if (!conversationId || isCreatingArtifact.value) {
			return false;
		}

		const context = params.context.trim();
		const text = params.text.trim();
		if (!context || !text) {
			screen.setMessage('warning', 'Укажите context и текст artifact.');
			return false;
		}

		isCreatingArtifact.value = true;
		try {
			await options.transport.createSeedArtifact({
				conversationId,
				type: params.type,
				context,
				text,
				metadata: params.metadata ?? null,
			});
			await loadArtifacts(conversationId, { silent: true });
			screen.setMessage('success', 'Artifact создан.');
			return true;
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось создать artifact: ${(error as Error).message}`
			);
			throw error;
		} finally {
			isCreatingArtifact.value = false;
		}
	};

	const deleteArtifact = async (artifactId: string): Promise<void> => {
		const conversationId = selectedConversationId.value;
		if (!conversationId) {
			return;
		}

		isDeletingArtifactId.value = artifactId;
		try {
			await options.transport.deleteArtifact(conversationId, artifactId);
			await loadArtifacts(conversationId, { silent: true });
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось удалить artifact: ${(error as Error).message}`
			);
		} finally {
			isDeletingArtifactId.value = null;
		}
	};

	const updateArtifact = async (params: {
		artifactId: string;
		type: EternalAiArtifactRecord['type'];
		context: EternalAiArtifactRecord['context'];
		text: string;
		metadata?: Record<string, unknown> | null;
	}): Promise<void> => {
		const conversationId = selectedConversationId.value;
		if (!conversationId) {
			return;
		}

		isUpdatingArtifactId.value = params.artifactId;
		try {
			await options.transport.updateArtifact({
				conversationId,
				artifactId: params.artifactId,
				type: params.type,
				context: params.context,
				text: params.text,
				metadata: params.metadata ?? null,
			});
			await loadArtifacts(conversationId, { silent: true });
			screen.setMessage('success', 'Artifact обновлён.');
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось обновить artifact: ${(error as Error).message}`
			);
			throw error;
		} finally {
			isUpdatingArtifactId.value = null;
		}
	};

	const sendCurrentDraft = async (): Promise<void> => {
		const nextDraft = draft.value.trim();
		if (!nextDraft || isSending.value) {
			return;
		}

		const previousDraft = draft.value;
		draft.value = '';
		isSending.value = true;

		try {
			const result = await options.transport.sendMessage({
				conversationId: selectedConversationId.value || undefined,
				text: nextDraft,
				model: selectedChatModelRef.value,
				systemPrompt:
					selectedConversationId.value === null
						? options.defaultSystemPrompt || undefined
						: undefined,
			});

			selectedConversationId.value = result.conversation.id;
			await refreshData(result.conversation.id);
		} catch (error) {
			draft.value = previousDraft;
			screen.setMessage(
				'error',
				`Не удалось отправить сообщение в Eternal AI: ${(error as Error).message}`
			);
		} finally {
			isSending.value = false;
		}
	};

	const handleDeleteConversation = async (
		conversationId: string
	): Promise<void> => {
		isDeletingConversationId.value = conversationId;
		try {
			await options.transport.deleteConversation(conversationId);
			if (selectedConversationId.value === conversationId) {
				selectedConversationId.value = null;
				messages.value = [];
			}
			await refreshData();
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось удалить диалог: ${(error as Error).message}`
			);
		} finally {
			isDeletingConversationId.value = null;
		}
	};

	const handleDeleteMessage = async (messageId: string): Promise<void> => {
		const conversationId = selectedConversationId.value;
		if (!conversationId) {
			return;
		}

		isDeletingMessageId.value = messageId;
		try {
			await options.transport.deleteMessage(conversationId, messageId);
			await refreshData(conversationId);
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось удалить сообщение: ${(error as Error).message}`
			);
		} finally {
			isDeletingMessageId.value = null;
		}
	};

	const selectEffect = (effectId: string): void => {
		customS4DebugError.value = null;
		selectedEffectId.value = effectId;
		const mode = KORA_CUSTOM_ID_TO_MODE[effectId];
		if (mode) {
			customMode.value = mode;
		}
	};

	/**
	 * @description Один исходный кадр для каталога Easy Effect и кастомных карточек.
	 */
	const setVisualSourceFromFileList = (files: FileList | null): void => {
		customS4DebugError.value = null;
		const file = files?.[0];
		if (!file) {
			visualSourceDataUrl.value = null;
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			visualSourceDataUrl.value = typeof result === 'string' ? result : null;
		};
		reader.onerror = () => {
			visualSourceDataUrl.value = null;
			screen.setMessage('error', 'Не удалось прочитать файл изображения.');
		};
		reader.readAsDataURL(file);
	};

	const runCreativeEffect = async (): Promise<void> => {
		if (isCreativeRunning.value) {
			return;
		}

		const effect = selectedEffect.value;
		if (!effect) {
			screen.setMessage('warning', 'Выберите эффект в каталоге слева.');
			return;
		}

		if (isKoraCustomCatalogEffectId(effect.effect_id)) {
			screen.setMessage(
				'warning',
				'Base-режим: запуск через композер под лентой (та же кнопка отправки).'
			);
			return;
		}

		if (!visualSourceDataUrl.value) {
			screen.setMessage(
				'warning',
				'Нужен исходный кадр: загрузите изображение (jpg/png/webp).'
			);
			return;
		}

		if (health.value?.status !== 'healthy') {
			screen.setMessage(
				'warning',
				'Сервер Eternal AI не готов: проверьте ETERNAL_AI_API_KEY на Kora server.'
			);
			return;
		}

		isCreativeRunning.value = true;
		try {
			const start = await options.transport.startCreativeEffect({
				conversationId: selectedConversationId.value,
				effect_id: effect.effect_id,
				effect_tag: effect.tag,
				images: [visualSourceDataUrl.value],
			});

			selectedConversationId.value = start.conversation.id;
			await loadMessages(start.conversation.id, { silent: true });

			let attempts = 0;
			const maxAttempts = 180;
			let finished = false;

			while (attempts < maxAttempts) {
				const poll = await options.transport.pollCreativeEffect(
					start.request_id
				);

				if (poll.completed) {
					finished = true;
					break;
				}

				attempts += 1;
				await sleep(2000);
			}

			await refreshData(start.conversation.id, {
				silentMessages: true,
				skipCreativeEffects: true,
			});
			leftTab.value = 'chats';

			if (!finished) {
				screen.setMessage(
					'warning',
					'Долгое ожидание результата: проверьте ленту позже или повторите poll вручную на сервере.'
				);
			}
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось выполнить визуальный эффект: ${(error as Error).message}`
			);
		} finally {
			isCreativeRunning.value = false;
		}
	};

	const runCustomGeneration = async (): Promise<void> => {
		if (isCustomRunning.value) {
			return;
		}

		if (health.value?.status !== 'healthy') {
			screen.setMessage(
				'warning',
				'Сервер Eternal AI не готов: проверьте ETERNAL_AI_API_KEY на Kora server.'
			);
			return;
		}

		const prompt = draft.value.trim();
		if (!prompt) {
			screen.setMessage(
				'warning',
				'Введите промпт в поле сообщения внизу для base-генерации.'
			);
			return;
		}

		if (
			(customMode.value === 'photo_edit' ||
				customMode.value === 'video_generate') &&
			!visualSourceDataUrl.value
		) {
			screen.setMessage(
				'warning',
				'Для этого режима нужно исходное изображение.'
			);
			return;
		}

		isCustomRunning.value = true;
		customS4DebugError.value = null;
		try {
			const images = visualSourceDataUrl.value
				? [visualSourceDataUrl.value]
				: [];
			let s4: EternalAiS4SafetyCheckResponse;
			try {
				s4 = await options.transport.safetyCheckS4({
					prompt,
					images,
				});
			} catch (s4Error) {
				customS4DebugError.value = `[S4] ${(s4Error as Error).message}`;
				return;
			}

			if (s4.is_s4) {
				const detailParts = [
					...(s4.detail?.text ?? []),
					...(s4.detail?.image ?? []),
				];
				const detail =
					detailParts.length > 0 ? detailParts.join('; ') : 'без деталей';
				customS4DebugError.value = `[S4] is_s4=true, генерация не запущена. ${detail}`;
				return;
			}

			const start = await options.transport.startCustomGeneration({
				conversationId: selectedConversationId.value,
				mode: customMode.value,
				prompt,
				images: visualSourceDataUrl.value ? [visualSourceDataUrl.value] : [],
			});

			selectedConversationId.value = start.conversation.id;
			await loadMessages(start.conversation.id, { silent: true });

			let attempts = 0;
			const maxAttempts = 180;
			while (attempts < maxAttempts) {
				const poll = await options.transport.pollCreativeEffect(
					start.request_id
				);
				if (poll.completed) {
					break;
				}
				attempts += 1;
				await sleep(2000);
			}

			await refreshData(start.conversation.id, {
				silentMessages: true,
				skipCreativeEffects: true,
			});
			leftTab.value = 'chats';
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось выполнить кастомную генерацию: ${(error as Error).message}`
			);
		} finally {
			isCustomRunning.value = false;
		}
	};

	const clearOpenClawCatalogError = (): void => {
		openClawCatalogError.value = null;
	};

	return {
		conversations,
		selectedConversationId,
		selectedConversation,
		messages,
		draft,
		health,
		isRefreshing,
		isLoadingMessages,
		isSending,
		isDeletingConversationId,
		isDeletingMessageId,
		isDeletingArtifactId,
		isUpdatingArtifactId,
		isLoadingArtifacts,
		isCreatingArtifact,
		screenMessage: screen.message,
		clearScreenMessage: screen.clearMessage,
		clearOpenClawCatalogError,
		timelineDebugEnabled,
		timelineItems,
		artifacts,
		turnTraces,
		canManageArtifacts,
		systemPromptSummary,
		refreshData,
		selectConversation,
		startNewConversation,
		createArtifactManual,
		updateArtifact,
		deleteArtifact,
		sendCurrentDraft,
		handleDeleteConversation,
		handleDeleteMessage,
		leftTab,
		creativeEffects,
		effectsQuery,
		selectedEffectId,
		selectedEffect,
		filteredEffects,
		visualSourceDataUrl,
		isLoadingEffects,
		isCreativeRunning,
		loadCreativeEffects,
		selectEffect,
		setVisualSourceFromFileList,
		runCreativeEffect,
		isCustomCatalogEffectSelected,
		customMode,
		isCustomRunning,
		runCustomGeneration,
		customS4DebugError,
		chatModelOptions,
		openClawConfigPath,
		openClawCatalogError,
		selectedChatModelRef,
		setSelectedChatModelRef,
	};
}
