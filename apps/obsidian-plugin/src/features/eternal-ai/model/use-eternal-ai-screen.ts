/**
 * @module features/eternal-ai/model/use-eternal-ai-screen
 * @description Composable экрана Eternal AI. Управляет локальным списком
 * диалогов, загрузкой истории из Kora server и отправкой новых сообщений в
 * OpenAI-compatible Eternal endpoint через серверный модуль.
 */

import { computed, ref } from 'vue';
import type {
	EternalAiConversationSummary,
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

	const screen = useScreenMessage();

	const selectedConversation = computed(
		() =>
			conversations.value.find(
				conversation => conversation.id === selectedConversationId.value
			) || null
	);

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

	const refreshData = async (
		nextConversationId?: string | null
	): Promise<void> => {
		isRefreshing.value = true;
		try {
			health.value = await options.transport.getHealth();
			conversations.value = await options.transport.listConversations();
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
		screenMessage: screen.message,
		timelineItems,
		systemPromptSummary,
		refreshData,
		selectConversation,
		startNewConversation,
		sendCurrentDraft,
		handleDeleteConversation,
	};
}
