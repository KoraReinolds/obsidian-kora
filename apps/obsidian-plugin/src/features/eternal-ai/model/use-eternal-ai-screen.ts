/**
 * @module features/eternal-ai/model/use-eternal-ai-screen
 * @description Composable экрана Eternal AI. Управляет локальным списком
 * диалогов, загрузкой истории из Kora server и отправкой новых сообщений в
 * OpenAI-compatible Eternal endpoint через серверный модуль. Поддерживает
 * каталог Creative (Easy Effect) и асинхронную генерацию через poll.
 * Список моделей чата подгружается из `openclaw.json` (Open Claw).
 */

import { computed, ref, watch } from 'vue';
import type { CanonicalChatMessage } from '../../../../../../packages/contracts/src/canonical-chat-message';
import type {
	EternalAiArtifactRecord,
	EternalAiConversationSummary,
	EternalAiCustomMode,
	EternalAiCreativeEffectItem,
	EternalAiHealthResponse,
	EternalAiS4SafetyCheckResponse,
	EternalAiTurnRecord,
} from '../../../../../../packages/contracts/src/eternal-ai';
import {
	ChatTimelineEternalTurnConversation,
	ChatTimelineEternalTurnDebug,
	canonicalChatMessageToTimelineMessage,
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

/**
 * @description Короткое время в пузыре мессенджера (без даты и модели).
 * @param {string | null | undefined} value - ISO createdAt
 * @returns {string}
 */
const formatMessengerTime = (value?: string | null): string => {
	if (!value) {
		return '';
	}
	return new Date(value).toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	});
};

const sleep = (ms: number): Promise<void> =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});

/**
 * @description Генерирует локальный id для optimistic turn/message до ответа сервера.
 * @param {string} prefix - Префикс сущности (`turn` или `message`)
 * @returns {string}
 */
const createOptimisticId = (prefix: string): string =>
	`${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

/**
 * @description Строит каноническое user-сообщение для мгновенного показа в ленте
 * до прихода server turn. Используем минимальный tg-first payload.
 * @param {Object} params - Параметры optimistic сообщения
 * @param {string} params.messageId - Локальный id сообщения
 * @param {string} params.chatId - Текущий id диалога или fallback для нового чата
 * @param {string} params.text - Текст user draft
 * @param {string} params.createdAt - ISO timestamp
 * @returns {CanonicalChatMessage}
 */
function buildOptimisticCanonicalUserMessage(params: {
	messageId: string;
	chatId: string;
	text: string;
	createdAt: string;
}): CanonicalChatMessage {
	return {
		id: params.messageId,
		chatId: params.chatId,
		sender: {
			kind: 'user',
			id: 'user',
			name: 'Вы',
			displayName: 'Вы',
			initials: 'В',
			isSelf: true,
		},
		timestampUtc: params.createdAt,
		parts: [
			{
				kind: 'speech',
				text: params.text,
			},
		],
		metadata: {
			optimistic: true,
		},
	};
}

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
 * @description Собирает DTO инспектора ленты из записи turn trace.
 * @param {NonNullable<EternalAiTurnRecord['trace']>} trace - снимок с сервера
 * @returns {ChatTimelineEternalTracePayload}
 */
function buildTimelineTracePayload(
	trace: NonNullable<EternalAiTurnRecord['trace']>
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
 * @param {EternalAiTurnRecord['userMessage'] | EternalAiTurnRecord['assistantMessage']} message - исходное сообщение из БД
 * @returns {ChatTimelineMessageItem}
 */
function getCanonicalMessageForTimeline(
	message: NonNullable<
		EternalAiTurnRecord['userMessage'] | EternalAiTurnRecord['assistantMessage']
	>
): CanonicalChatMessage {
	const canonicalMessage = message.canonicalMessage;
	if (!canonicalMessage) {
		throw new Error(
			`Eternal message ${message.id} is missing canonicalMessage after migration.`
		);
	}
	return canonicalMessage;
}

function mapMessageToTimelineMessage(
	message: NonNullable<
		EternalAiTurnRecord['userMessage'] | EternalAiTurnRecord['assistantMessage']
	>
): ChatTimelineMessageItem {
	const role = message.role;
	const isUser = role === 'user';
	return canonicalChatMessageToTimelineMessage(
		getCanonicalMessageForTimeline(message),
		{
			role,
			align: isUser ? 'end' : role === 'system' ? 'center' : 'start',
			bubbleChrome: 'messenger',
			author: '',
			initials: '',
			rawPayload: message,
			meta: formatMessengerTime(message.createdAt),
			badges:
				message.status === 'error' && message.errorText
					? [message.errorText]
					: [],
			accent: isUser
				? {
						bubbleBg:
							'color-mix(in srgb, var(--interactive-accent) 44%, var(--background-primary))',
						bubbleBorder:
							'color-mix(in srgb, var(--interactive-accent) 68%, var(--background-modifier-border))',
					}
				: role === 'system'
					? {
							bubbleBg: 'rgba(66, 53, 19, 0.92)',
							bubbleBorder: 'rgba(255, 208, 87, 0.22)',
						}
					: {
							bubbleBg: 'var(--background-modifier-hover)',
							bubbleBorder: 'var(--background-modifier-border)',
						},
		}
	);
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
	turnStatus?: EternalAiTurnRecord['status'] | null;
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
			turnStatus: params.turnStatus ?? null,
			trace: params.trace ?? null,
		},
		rawPayload: params.rawPayload,
	};
}

export function useEternalAiScreen(options: EternalAiScreenModelOptions) {
	const conversations = ref<EternalAiConversationSummary[]>([]);
	const selectedConversationId = ref<string | null>(null);
	const turns = ref<EternalAiTurnRecord[]>([]);
	const draft = ref('');
	const health = ref<EternalAiHealthResponse | null>(null);
	const isRefreshing = ref(false);
	const isLoadingMessages = ref(false);
	const isSending = ref(false);
	const isDeletingConversationId = ref<string | null>(null);
	const isDeletingTurnId = ref<string | null>(null);
	const isDeletingArtifactId = ref<string | null>(null);
	const isUpdatingArtifactId = ref<string | null>(null);
	const isLoadingArtifacts = ref(false);
	const isCreatingArtifact = ref(false);
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
		const buildTurnItem = timelineDebugEnabled.value
			? buildDebugTurnItem
			: buildConversationTurnItem;
		return turns.value.map(turn =>
			buildTurnItem({
				turnId: turn.id,
				userMessage: turn.userMessage
					? mapMessageToTimelineMessage(turn.userMessage)
					: null,
				assistantMessage: turn.assistantMessage
					? mapMessageToTimelineMessage(turn.assistantMessage)
					: null,
				turnStatus: turn.status,
				trace: turn.trace ? buildTimelineTracePayload(turn.trace) : null,
				rawPayload: {
					type: 'eternal-turn',
					mode: timelineDebugEnabled.value ? 'debug' : 'conversation',
					turn,
				},
			})
		);
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
	const loadTurns = async (
		conversationId: string | null,
		loadOpts?: { silent?: boolean }
	): Promise<void> => {
		if (!conversationId) {
			turns.value = [];
			return;
		}

		const silent = Boolean(loadOpts?.silent);
		if (!silent) {
			isLoadingMessages.value = true;
		}
		try {
			turns.value = await options.transport.listTurns(conversationId);
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось загрузить turns Eternal AI: ${(error as Error).message}`
			);
		} finally {
			if (!silent) {
				isLoadingMessages.value = false;
			}
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

			await loadTurns(selectedConversationId.value, {
				silent: refreshOpts?.silentMessages,
			});
			await loadArtifacts(selectedConversationId.value, {
				silent: refreshOpts?.silentMessages,
			});

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
			loadTurns(conversationId),
			loadArtifacts(conversationId),
		]);
	};

	const startNewConversation = (): void => {
		selectedConversationId.value = null;
		turns.value = [];
		artifacts.value = [];
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
		const optimisticCreatedAt = new Date().toISOString();
		const optimisticTurnId = createOptimisticId('optimistic-turn');
		const optimisticMessageId = createOptimisticId('optimistic-message');
		const optimisticConversationId =
			selectedConversationId.value || '__optimistic-new-conversation__';
		const optimisticCanonicalMessage = buildOptimisticCanonicalUserMessage({
			messageId: optimisticMessageId,
			chatId: optimisticConversationId,
			text: nextDraft,
			createdAt: optimisticCreatedAt,
		});
		const optimisticTurn: EternalAiTurnRecord = {
			id: optimisticTurnId,
			conversationId: optimisticConversationId,
			parentTurnId: turns.value[turns.value.length - 1]?.id || null,
			kind: 'chat',
			status: 'pending',
			model: selectedChatModelRef.value,
			errorText: null,
			userMessage: {
				id: optimisticMessageId,
				conversationId: optimisticConversationId,
				turnId: optimisticTurnId,
				role: 'user',
				contentText: nextDraft,
				model: selectedChatModelRef.value,
				status: 'complete',
				errorText: null,
				attachments: null,
				metadata: {
					optimistic: true,
					canonicalMessage: optimisticCanonicalMessage,
				},
				canonicalMessage: optimisticCanonicalMessage,
				createdAt: optimisticCreatedAt,
			},
			assistantMessage: null,
			trace: null,
			createdAt: optimisticCreatedAt,
			updatedAt: optimisticCreatedAt,
		};
		draft.value = '';
		isSending.value = true;
		turns.value = [...turns.value, optimisticTurn];

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
			turns.value = turns.value.map(turn =>
				turn.id === optimisticTurnId
					? {
							...turn,
							status: 'error',
							errorText: (error as Error).message,
							updatedAt: new Date().toISOString(),
						}
					: turn
			);
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
				turns.value = [];
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

	const handleDeleteTurn = async (turnId: string): Promise<void> => {
		const conversationId = selectedConversationId.value;
		if (!conversationId) {
			return;
		}

		isDeletingTurnId.value = turnId;
		try {
			await options.transport.deleteTurn(conversationId, turnId);
			await refreshData(conversationId);
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось удалить turn: ${(error as Error).message}`
			);
		} finally {
			isDeletingTurnId.value = null;
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
			await loadTurns(start.conversation.id, { silent: true });

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
			await loadTurns(start.conversation.id, { silent: true });

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
		turns,
		draft,
		health,
		isRefreshing,
		isLoadingMessages,
		isSending,
		isDeletingConversationId,
		isDeletingTurnId,
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
		handleDeleteTurn,
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
