/**
 * @module features/telegram/archive/model/use-archive-screen
 *
 * @description Feature composable для экрана архива Telegram.
 * Инкапсулирует state/actions без зависимости от Obsidian ItemView.
 */

import { computed, ref } from 'vue';
import type {
	ArchiveChat,
	ArchiveMessage,
} from '../../../../../telegram-types';
import { useFilterQuery, useScreenMessage } from '../../../../core/ui-vue';
import type { ArchiveTransportPort } from '../ports/archive-transport-port';

/**
 * @description Параметры инициализации archive screen model.
 */
export interface ArchiveScreenModelOptions {
	transport: ArchiveTransportPort;
	defaultPeer?: string;
	defaultSyncLimit: number;
	recentMessagesLimit: number;
}

/**
 * @description Создает state/actions для archive UI.
 * @param {ArchiveScreenModelOptions} options - Зависимости и настройки feature.
 * @returns {{
 *  peerInputValue: import('vue').Ref<string>,
 *  searchQuery: import('vue').Ref<string>,
 *  chats: import('vue').Ref<ArchiveChat[]>,
 *  filteredChats: import('vue').ComputedRef<ArchiveChat[]>,
 *  selectedChatId: import('vue').Ref<string | null>,
 *  selectedChatMessages: import('vue').Ref<ArchiveMessage[]>,
 *  selectedChatTotal: import('vue').Ref<number>,
 *  isRefreshing: import('vue').Ref<boolean>,
 *  isLoadingMessages: import('vue').Ref<boolean>,
 *  isSyncing: import('vue').Ref<boolean>,
 *  screenMessage: import('vue').Ref<{ kind: 'neutral' | 'success' | 'error', text: string } | null>,
 *  selectedChat: import('vue').ComputedRef<ArchiveChat | null>,
 *  refreshData: () => Promise<void>,
 *  handleSync: () => Promise<void>,
 *  handleChatSelection: (chatId: string) => Promise<void>,
 *  formatDate: (value?: string | null) => string
 * }} State и действия archive feature.
 */
export function useArchiveScreen(options: ArchiveScreenModelOptions) {
	const selectedChatId = ref<string | null>(null);
	const peerInputValue = ref(options.defaultPeer || '');
	const chats = ref<ArchiveChat[]>([]);
	const selectedChatMessages = ref<ArchiveMessage[]>([]);
	const selectedChatTotal = ref(0);
	const isRefreshing = ref(false);
	const isLoadingMessages = ref(false);
	const isSyncing = ref(false);
	const isDeletingChatId = ref<string | null>(null);
	const screen = useScreenMessage();
	const search = useFilterQuery(chats, chat =>
		[chat.title, chat.username, chat.chatId].filter(Boolean).join(' ')
	);

	const selectedChat = computed(
		() => chats.value.find(chat => chat.chatId === selectedChatId.value) || null
	);

	/**
	 * @description Нормализует входной список чатов и удаляет поврежденные записи,
	 * чтобы UI не падал на обращениях к `chatId`/`title`.
	 * @param {unknown[]} rawChats - Сырые данные, пришедшие из transport.
	 * @returns {ArchiveChat[]} Валидные чаты для UI.
	 */
	const normalizeChats = (rawChats: unknown[]): ArchiveChat[] => {
		return rawChats
			.filter((candidate): candidate is ArchiveChat => {
				if (!candidate || typeof candidate !== 'object') {
					return false;
				}
				const chat = candidate as Partial<ArchiveChat>;
				return (
					typeof chat.chatId === 'string' && typeof chat.title === 'string'
				);
			})
			.map(chat => ({
				...chat,
				username: chat.username ?? null,
				type: chat.type ?? 'unknown',
				messageCount: Number.isFinite(chat.messageCount)
					? chat.messageCount
					: 0,
			}));
	};

	/**
	 * @description Загружает список чатов и синхронизирует выбранный chatId.
	 * @returns {Promise<void>}
	 */
	const loadChats = async (): Promise<void> => {
		const rawChats = await options.transport.getArchivedChats(200);
		chats.value = normalizeChats(rawChats as unknown[]);
		if (
			selectedChatId.value &&
			!chats.value.some(chat => chat.chatId === selectedChatId.value)
		) {
			selectedChatId.value = null;
		}
		if (!selectedChatId.value && chats.value.length > 0) {
			selectedChatId.value = chats.value[0].chatId;
		}
	};

	/**
	 * @description Загружает сообщения выбранного чата.
	 * @returns {Promise<void>}
	 */
	const loadSelectedChatMessages = async (): Promise<void> => {
		if (!selectedChatId.value) {
			selectedChatMessages.value = [];
			selectedChatTotal.value = 0;
			return;
		}

		isLoadingMessages.value = true;
		try {
			const response = await options.transport.getArchivedMessages({
				chatId: selectedChatId.value,
				limit: options.recentMessagesLimit,
				offset: 0,
			});
			selectedChatMessages.value = response.messages;
			selectedChatTotal.value = response.total;
		} finally {
			isLoadingMessages.value = false;
		}
	};

	/**
	 * @description Обновляет весь экран: список чатов и текущие сообщения.
	 * @returns {Promise<void>}
	 */
	const refreshData = async (): Promise<void> => {
		isRefreshing.value = true;
		try {
			await loadChats();
			await loadSelectedChatMessages();
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось обновить архив: ${(error as Error).message}`
			);
		} finally {
			isRefreshing.value = false;
		}
	};

	/**
	 * @description Запускает sync для peer и перезагружает текущие данные.
	 * @returns {Promise<void>}
	 */
	const handleSync = async (): Promise<void> => {
		const peer = peerInputValue.value.trim();
		if (!peer) {
			screen.setMessage(
				'error',
				'Введите peer чата или канала перед синхронизацией.'
			);
			return;
		}

		isSyncing.value = true;
		screen.setMessage('neutral', `Синхронизируем ${peer}…`);
		try {
			const result = await options.transport.syncArchive({
				peer,
				limit: options.defaultSyncLimit,
			});
			await loadChats();
			selectedChatId.value = result.chatId || selectedChatId.value;
			await loadSelectedChatMessages();
			if (result.totalProcessed === 0) {
				screen.setMessage(
					'success',
					'Синк завершён: новых сообщений не найдено.'
				);
			} else {
				screen.setMessage(
					'success',
					`Синк завершён: добавлено ${result.inserted}, обновлено ${result.updated}, без изменений ${result.skipped}.`
				);
			}
		} catch (error) {
			screen.setMessage(
				'error',
				`Синхронизация не удалась: ${(error as Error).message}`
			);
		} finally {
			isSyncing.value = false;
		}
	};

	/**
	 * @description Выбирает чат и загружает его сообщения.
	 * @param {string} chatId - Идентификатор выбранного чата.
	 * @returns {Promise<void>}
	 */
	const handleChatSelection = async (chatId: string): Promise<void> => {
		if (selectedChatId.value === chatId) {
			return;
		}
		selectedChatId.value = chatId;
		try {
			await loadSelectedChatMessages();
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось загрузить сообщения: ${(error as Error).message}`
			);
		}
	};

	/**
	 * @async
	 * @description Удаляет чат и всю историю из локального SQLite-архива (gramjs-server), без изменений в Telegram.
	 * @param {string} chatId - Идентификатор чата в архиве.
	 * @returns {Promise<void>}
	 */
	const handleDeleteChat = async (chatId: string): Promise<void> => {
		const trimmed = chatId.trim();
		if (!trimmed) {
			return;
		}

		const confirmed = window.confirm(
			'Удалить этот чат из локального архива вместе со всеми сообщениями? Действие не затрагивает Telegram.'
		);
		if (!confirmed) {
			return;
		}

		isDeletingChatId.value = trimmed;
		try {
			const { deleted } = await options.transport.deleteArchiveChat(trimmed);
			if (!deleted) {
				screen.setMessage(
					'neutral',
					'Чат не найден в архиве (возможно, уже удалён).'
				);
			} else {
				screen.setMessage('success', 'Чат удалён из локального архива.');
			}
			await loadChats();
			await loadSelectedChatMessages();
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось удалить чат: ${(error as Error).message}`
			);
		} finally {
			isDeletingChatId.value = null;
		}
	};

	/**
	 * @description Форматирует дату для human-readable UI.
	 * @param {string | null | undefined} value - ISO дата.
	 * @returns {string} Локализованная строка даты.
	 */
	const formatDate = (value?: string | null): string => {
		if (!value) {
			return 'ещё не было';
		}
		return new Date(value).toLocaleString();
	};

	return {
		peerInputValue,
		searchQuery: search.query,
		chats,
		filteredChats: search.filtered,
		selectedChatId,
		selectedChatMessages,
		selectedChatTotal,
		isRefreshing,
		isLoadingMessages,
		isSyncing,
		isDeletingChatId,
		screenMessage: screen.message,
		selectedChat,
		refreshData,
		handleSync,
		handleChatSelection,
		handleDeleteChat,
		formatDate,
	};
}
