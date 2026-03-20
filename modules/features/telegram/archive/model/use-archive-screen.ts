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
	backfillLimit?: number;
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
 *  messagesPageLimit: import('vue').Ref<number>,
 *  messagesPageOffset: import('vue').Ref<number>,
 *  currentPage: import('vue').ComputedRef<number>,
 *  totalPages: import('vue').ComputedRef<number>,
 *  canGoPrevPage: import('vue').ComputedRef<boolean>,
 *  canGoNextPage: import('vue').ComputedRef<boolean>,
 *  isBackfilling: import('vue').Ref<boolean>,
 *  isRefreshing: import('vue').Ref<boolean>,
 *  isLoadingMessages: import('vue').Ref<boolean>,
 *  isSyncing: import('vue').Ref<boolean>,
 *  screenMessage: import('vue').Ref<{ kind: 'neutral' | 'success' | 'error', text: string } | null>,
 *  selectedChat: import('vue').ComputedRef<ArchiveChat | null>,
 *  refreshData: () => Promise<void>,
 *  handleSync: () => Promise<void>,
 *  handleChatSelection: (chatId: string) => Promise<void>,
 *  goToPrevPage: () => Promise<void>,
 *  goToNextPage: () => Promise<void>,
 *  goToPage: (page: number) => Promise<void>,
 *  reloadCurrentPage: () => Promise<void>,
 *  handleBackfillOlder: () => Promise<void>,
 *  handleSyncNewerForSelectedChat: () => Promise<void>,
 *  visibleRangeText: import('vue').ComputedRef<string>,
 *  visibleTimeRangeText: import('vue').ComputedRef<string>,
 *  fullTimeRangeText: import('vue').ComputedRef<string>,
 *  formatDate: (value?: string | null) => string
 * }} State и действия archive feature.
 */
export function useArchiveScreen(options: ArchiveScreenModelOptions) {
	const selectedChatId = ref<string | null>(null);
	const peerInputValue = ref(options.defaultPeer || '');
	const chats = ref<ArchiveChat[]>([]);
	const selectedChatMessages = ref<ArchiveMessage[]>([]);
	const selectedChatTotal = ref(0);
	const selectedChatFullRange = ref<{
		oldestTimestampUtc: string | null;
		newestTimestampUtc: string | null;
	}>({
		oldestTimestampUtc: null,
		newestTimestampUtc: null,
	});
	const messagesPageLimit = ref(options.recentMessagesLimit);
	const messagesPageOffset = ref(0);
	const isRefreshing = ref(false);
	const isLoadingMessages = ref(false);
	const isSyncing = ref(false);
	const isBackfilling = ref(false);
	const isDeletingChatId = ref<string | null>(null);
	const screen = useScreenMessage();
	const search = useFilterQuery(chats, chat =>
		[chat.title, chat.username, chat.chatId].filter(Boolean).join(' ')
	);

	const selectedChat = computed(
		() => chats.value.find(chat => chat.chatId === selectedChatId.value) || null
	);
	const currentPage = computed(
		() => Math.floor(messagesPageOffset.value / messagesPageLimit.value) + 1
	);
	const totalPages = computed(() =>
		Math.max(1, Math.ceil(selectedChatTotal.value / messagesPageLimit.value))
	);
	const canGoPrevPage = computed(() => messagesPageOffset.value > 0);
	const canGoNextPage = computed(() => {
		return (
			messagesPageOffset.value + messagesPageLimit.value <
			selectedChatTotal.value
		);
	});
	const visibleRangeText = computed(() => {
		if (
			selectedChatTotal.value === 0 ||
			selectedChatMessages.value.length === 0
		) {
			return '0 из 0';
		}
		const from = messagesPageOffset.value + 1;
		const to = Math.min(
			messagesPageOffset.value + selectedChatMessages.value.length,
			selectedChatTotal.value
		);
		return `${from}-${to} из ${selectedChatTotal.value}`;
	});
	const visibleTimeRangeText = computed(() => {
		if (selectedChatMessages.value.length === 0) {
			return 'Диапазон: нет сообщений';
		}
		const newest = selectedChatMessages.value[0]?.timestampUtc;
		const oldest =
			selectedChatMessages.value[selectedChatMessages.value.length - 1]
				?.timestampUtc;
		return `Диапазон: ${formatDate(newest)} - ${formatDate(oldest)}`;
	});
	const fullTimeRangeText = computed(() => {
		const { newestTimestampUtc, oldestTimestampUtc } =
			selectedChatFullRange.value;
		if (!newestTimestampUtc || !oldestTimestampUtc) {
			return 'Диапазон в базе: нет сообщений';
		}
		return `Диапазон в базе: ${formatDate(newestTimestampUtc)} - ${formatDate(oldestTimestampUtc)}`;
	});

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
	const loadSelectedChatMessages = async (params?: {
		offset?: number;
		limit?: number;
	}): Promise<void> => {
		if (!selectedChatId.value) {
			selectedChatMessages.value = [];
			selectedChatTotal.value = 0;
			selectedChatFullRange.value = {
				oldestTimestampUtc: null,
				newestTimestampUtc: null,
			};
			return;
		}

		const nextOffset =
			typeof params?.offset === 'number'
				? Math.max(0, params.offset)
				: messagesPageOffset.value;
		const nextLimit =
			typeof params?.limit === 'number' && Number.isFinite(params.limit)
				? Math.max(1, Math.floor(params.limit))
				: messagesPageLimit.value;

		messagesPageOffset.value = nextOffset;
		messagesPageLimit.value = nextLimit;
		isLoadingMessages.value = true;
		try {
			const response = await options.transport.getArchivedMessages({
				chatId: selectedChatId.value,
				limit: nextLimit,
				offset: nextOffset,
			});
			selectedChatMessages.value = response.messages;
			selectedChatTotal.value = response.total;
			selectedChatFullRange.value = response.fullRange;
			const maxOffset = Math.max(0, response.total - nextLimit);
			if (messagesPageOffset.value > maxOffset) {
				messagesPageOffset.value =
					Math.floor(maxOffset / nextLimit) * nextLimit;
				return await loadSelectedChatMessages();
			}
		} finally {
			isLoadingMessages.value = false;
		}
	};

	/**
	 * @description Загружает предыдущую страницу (более новые сообщения).
	 * @returns {Promise<void>}
	 */
	const goToPrevPage = async (): Promise<void> => {
		if (isLoadingMessages.value || !canGoPrevPage.value) {
			return;
		}
		await loadSelectedChatMessages({
			offset: Math.max(0, messagesPageOffset.value - messagesPageLimit.value),
		});
	};

	/**
	 * @description Загружает следующую страницу (более старые сообщения).
	 * @returns {Promise<void>}
	 */
	const goToNextPage = async (): Promise<void> => {
		if (isLoadingMessages.value || !canGoNextPage.value) {
			return;
		}
		await loadSelectedChatMessages({
			offset: messagesPageOffset.value + messagesPageLimit.value,
		});
	};

	/**
	 * @description Переходит к указанной странице в рамках локальной пагинации.
	 * @param {number} page - Целевой номер страницы (1-based).
	 * @returns {Promise<void>}
	 */
	const goToPage = async (page: number): Promise<void> => {
		if (isLoadingMessages.value) {
			return;
		}
		const target = Math.min(Math.max(1, Math.floor(page)), totalPages.value);
		const offset = (target - 1) * messagesPageLimit.value;
		await loadSelectedChatMessages({ offset });
	};

	/**
	 * @description Перезагружает текущую страницу выбранного чата.
	 * @returns {Promise<void>}
	 */
	const reloadCurrentPage = async (): Promise<void> => {
		await loadSelectedChatMessages();
	};

	/**
	 * @description Обновляет весь экран: список чатов и текущие сообщения.
	 * @returns {Promise<void>}
	 */
	const refreshData = async (): Promise<void> => {
		isRefreshing.value = true;
		try {
			await loadChats();
			await reloadCurrentPage();
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
			await reloadCurrentPage();
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
		messagesPageOffset.value = 0;
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
			messagesPageOffset.value = 0;
			await reloadCurrentPage();
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
	 * @async
	 * @description Ручной TG-first backfill: догружает более старые сообщения через серверный `/archive/backfill` и затем перечитывает текущую страницу.
	 * @returns {Promise<void>}
	 */
	const handleBackfillOlder = async (): Promise<void> => {
		if (
			!selectedChatId.value ||
			isBackfilling.value ||
			isLoadingMessages.value
		) {
			return;
		}

		isBackfilling.value = true;
		try {
			const result = await options.transport.backfillArchive({
				chatId: selectedChatId.value,
				limit: options.backfillLimit ?? options.defaultSyncLimit,
			});
			await reloadCurrentPage();
			if (result.totalProcessed === 0) {
				screen.setMessage('neutral', 'Более старых сообщений не найдено.');
				return;
			}
			screen.setMessage(
				'success',
				`Догружено старых: добавлено ${result.inserted}, обновлено ${result.updated}, без изменений ${result.skipped}.`
			);
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось догрузить старые сообщения: ${(error as Error).message}`
			);
		} finally {
			isBackfilling.value = false;
		}
	};

	/**
	 * @async
	 * @description Ручная догрузка новых сообщений для выбранного чата из Telegram по forward-sync (`minId`).
	 * @returns {Promise<void>}
	 */
	const handleSyncNewerForSelectedChat = async (): Promise<void> => {
		if (!selectedChat.value || isSyncing.value) {
			return;
		}
		const peer =
			selectedChat.value.username?.trim() || selectedChat.value.chatId.trim();
		isSyncing.value = true;
		screen.setMessage('neutral', `Догружаем новые сообщения для ${peer}…`);
		try {
			const result = await options.transport.syncArchive({
				peer,
				limit: options.defaultSyncLimit,
			});
			await loadChats();
			selectedChatId.value = result.chatId || selectedChatId.value;
			await reloadCurrentPage();
			if (result.totalProcessed === 0) {
				screen.setMessage(
					'neutral',
					'Новых сообщений для выбранного чата не найдено.'
				);
				return;
			}
			screen.setMessage(
				'success',
				`Догружено новых: добавлено ${result.inserted}, обновлено ${result.updated}, без изменений ${result.skipped}.`
			);
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось догрузить новые сообщения: ${(error as Error).message}`
			);
		} finally {
			isSyncing.value = false;
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
		messagesPageLimit,
		messagesPageOffset,
		currentPage,
		totalPages,
		canGoPrevPage,
		canGoNextPage,
		isRefreshing,
		isLoadingMessages,
		isSyncing,
		isBackfilling,
		isDeletingChatId,
		screenMessage: screen.message,
		selectedChat,
		visibleRangeText,
		visibleTimeRangeText,
		fullTimeRangeText,
		refreshData,
		handleSync,
		handleChatSelection,
		goToPrevPage,
		goToNextPage,
		goToPage,
		reloadCurrentPage,
		handleBackfillOlder,
		handleSyncNewerForSelectedChat,
		handleDeleteChat,
		formatDate,
	};
}
