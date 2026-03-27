/**
 * @module features/eternal-ai/model/use-eternal-ai-screen
 * @description Composable экрана Eternal AI. Управляет локальным списком
 * диалогов, загрузкой истории из Kora server и отправкой новых сообщений в
 * OpenAI-compatible Eternal endpoint через серверный модуль. Поддерживает
 * каталог Creative (Easy Effect) и асинхронную генерацию через poll.
 */

import { computed, ref } from 'vue';
import type {
	EternalAiConversationSummary,
	EternalAiCustomMode,
	EternalAiCreativeEffectItem,
	EternalAiHealthResponse,
	EternalAiMessageRecord,
} from '../../../../../../packages/contracts/src/eternal-ai';
import { useScreenMessage } from '../../../ui-vue';
import type { ChatTimelineItem } from '../../../ui-vue';
import type { EternalAiTransportPort } from '../ports/eternal-ai-transport-port';

export interface EternalAiScreenModelOptions {
	transport: EternalAiTransportPort;
	defaultSystemPrompt?: string;
}

const formatDate = (value?: string | null): string => {
	if (!value) {
		return 'ещё не было';
	}
	return new Date(value).toLocaleString();
};

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
): ChatTimelineItem['attachments'] => {
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

	const leftTab = ref<'chats' | 'effects' | 'custom'>('chats');
	const creativeEffects = ref<EternalAiCreativeEffectItem[]>([]);
	const effectsQuery = ref('');
	const selectedEffectId = ref<string | null>(null);
	const effectSourceDataUrl = ref<string | null>(null);
	const isLoadingEffects = ref(false);
	const isCreativeRunning = ref(false);
	const customMode = ref<EternalAiCustomMode>('photo_generate');
	const customPrompt = ref('');
	const customSourceDataUrl = ref<string | null>(null);
	const isCustomRunning = ref(false);

	const screen = useScreenMessage();

	const selectedConversation = computed(
		() =>
			conversations.value.find(
				conversation => conversation.id === selectedConversationId.value
			) || null
	);

	const selectedEffect = computed(
		() =>
			creativeEffects.value.find(
				effect => effect.effect_id === selectedEffectId.value
			) || null
	);

	const filteredEffects = computed(() => {
		const query = effectsQuery.value.trim().toLowerCase();
		const items = creativeEffects.value;
		if (!query) {
			return items;
		}

		return items.filter(effect => effect.tag.toLowerCase().includes(query));
	});

	const timelineItems = computed<ChatTimelineItem[]>(() => {
		return messages.value.map(message => {
			const role = message.role;
			const isUser = role === 'user';
			return {
				id: message.id,
				role,
				align: isUser ? 'end' : role === 'system' ? 'center' : 'start',
				author: getRoleLabel(role),
				initials: getRoleInitials(role),
				meta: [formatDate(message.createdAt), message.model || null]
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
							bubbleBg:
								'rgba(var(--interactive-accent-rgb, 124, 92, 255), 0.12)',
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
			} satisfies ChatTimelineItem;
		});
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

	const loadMessages = async (conversationId: string | null): Promise<void> => {
		if (!conversationId) {
			messages.value = [];
			return;
		}

		isLoadingMessages.value = true;
		try {
			messages.value = await options.transport.listMessages(conversationId);
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось загрузить историю Eternal AI: ${(error as Error).message}`
			);
		} finally {
			isLoadingMessages.value = false;
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

	const refreshData = async (
		nextConversationId?: string | null
	): Promise<void> => {
		isRefreshing.value = true;
		try {
			health.value = await options.transport.getHealth();
			conversations.value = await options.transport.listConversations();
			await loadCreativeEffects();

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

			await loadMessages(selectedConversationId.value);

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
		await loadMessages(conversationId);
	};

	const startNewConversation = (): void => {
		selectedConversationId.value = null;
		messages.value = [];
		screen.setMessage(
			'neutral',
			'Новый чат начнётся с первого отправленного сообщения.'
		);
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
		const confirmed = window.confirm(
			'Удалить этот Eternal AI диалог из локальной истории?'
		);
		if (!confirmed) {
			return;
		}

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

		const confirmed = window.confirm('Удалить это сообщение из локальной БД?');
		if (!confirmed) {
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
		selectedEffectId.value = effectId;
	};

	const setEffectSourceFromFileList = (files: FileList | null): void => {
		const file = files?.[0];
		if (!file) {
			effectSourceDataUrl.value = null;
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			effectSourceDataUrl.value = typeof result === 'string' ? result : null;
		};
		reader.onerror = () => {
			effectSourceDataUrl.value = null;
			screen.setMessage('error', 'Не удалось прочитать файл изображения.');
		};
		reader.readAsDataURL(file);
	};

	const setCustomSourceFromFileList = (files: FileList | null): void => {
		const file = files?.[0];
		if (!file) {
			customSourceDataUrl.value = null;
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			customSourceDataUrl.value = typeof result === 'string' ? result : null;
		};
		reader.onerror = () => {
			customSourceDataUrl.value = null;
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

		if (!effectSourceDataUrl.value) {
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
				images: [effectSourceDataUrl.value],
			});

			selectedConversationId.value = start.conversation.id;
			await loadMessages(start.conversation.id);

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

			await refreshData(start.conversation.id);
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

		const prompt = customPrompt.value.trim();
		if (!prompt) {
			screen.setMessage('warning', 'Введите prompt для кастомной генерации.');
			return;
		}

		if (
			(customMode.value === 'photo_edit' ||
				customMode.value === 'video_generate') &&
			!customSourceDataUrl.value
		) {
			screen.setMessage(
				'warning',
				'Для этого режима нужно исходное изображение.'
			);
			return;
		}

		isCustomRunning.value = true;
		try {
			const start = await options.transport.startCustomGeneration({
				conversationId: selectedConversationId.value,
				mode: customMode.value,
				prompt,
				images: customSourceDataUrl.value ? [customSourceDataUrl.value] : [],
			});

			selectedConversationId.value = start.conversation.id;
			await loadMessages(start.conversation.id);

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

			await refreshData(start.conversation.id);
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
		screenMessage: screen.message,
		timelineItems,
		systemPromptSummary,
		refreshData,
		selectConversation,
		startNewConversation,
		sendCurrentDraft,
		handleDeleteConversation,
		handleDeleteMessage,
		leftTab,
		creativeEffects,
		effectsQuery,
		selectedEffectId,
		selectedEffect,
		filteredEffects,
		effectSourceDataUrl,
		isLoadingEffects,
		isCreativeRunning,
		loadCreativeEffects,
		selectEffect,
		setEffectSourceFromFileList,
		runCreativeEffect,
		customMode,
		customPrompt,
		customSourceDataUrl,
		isCustomRunning,
		setCustomSourceFromFileList,
		runCustomGeneration,
	};
}
