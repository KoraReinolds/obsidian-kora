/**
 * @module telegram/archive/model/use-archive-screen
 *
 * @description Composable фичи экрана архива Telegram.
 * Инкапсулирует состояние и действия без зависимости от Obsidian ItemView.
 */

import { computed, ref } from 'vue';
import type {
	ArchiveChat,
	ArchiveMessage,
} from '../../../../../../packages/contracts/src/telegram';
import { useFilterQuery, useScreenMessage } from '../../../ui-vue';
import type { ArchiveTransportPort } from '../ports/archive-transport-port';

/**
 * @description Параметры инициализации модели экрана архива.
 */
export interface ArchiveScreenModelOptions {
	transport: ArchiveTransportPort;
	defaultPeer?: string;
	defaultSyncLimit: number;
	recentMessagesLimit: number;
	backfillLimit?: number;
}

/**
 * @description Создаёт состояние и действия для UI архива.
 * @param {ArchiveScreenModelOptions} options - Зависимости фичи и настройки.
 * @returns {object} State и действия фичи архива.
 */
export function useArchiveScreen(options: ArchiveScreenModelOptions) {
	const selectedChatId = ref<string | null>(null);
	const peerInputValue = ref(options.defaultPeer || '');
	const syncLimitValue = ref(String(Math.max(1, options.defaultSyncLimit)));
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
		return `Диапазон в базе: ${formatDate(newestTimestampUtc)} - ${formatDate(
			oldestTimestampUtc
		)}`;
	});

	/**
	 * @description Нормализует входной список чатов и убирает битые записи,
	 * чтобы UI не падал при обращении к `chatId`/`title`.
	 * @param {unknown[]} rawChats - Сырые данные от транспорта.
	 * @returns {ArchiveChat[]} Валидные чаты для UI.
	 */
	const normalizeChats = (rawChats: unknown[]): ArchiveChat[] => {
		return rawChats
			.filter((candidate): candidate is ArchiveChat => {
				if (!candidate || typeof candidate !== 'object') return false;
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
	 */
	const goToPrevPage = async (): Promise<void> => {
		if (isLoadingMessages.value || !canGoPrevPage.value) return;
		await loadSelectedChatMessages({
			offset: Math.max(0, messagesPageOffset.value - messagesPageLimit.value),
		});
	};

	/**
	 * @description Загружает следующую страницу (более старые сообщения).
	 */
	const goToNextPage = async (): Promise<void> => {
		if (isLoadingMessages.value || !canGoNextPage.value) return;
		await loadSelectedChatMessages({
			offset: messagesPageOffset.value + messagesPageLimit.value,
		});
	};

	/**
	 * @description Переключает на указанную страницу локальной пагинации (нумерация с 1).
	 */
	const goToPage = async (page: number): Promise<void> => {
		if (isLoadingMessages.value) return;
		const target = Math.min(Math.max(1, Math.floor(page)), totalPages.value);
		const offset = (target - 1) * messagesPageLimit.value;
		await loadSelectedChatMessages({ offset });
	};

	/**
	 * @description Перезагружает текущую страницу для выбранного чата.
	 */
	const reloadCurrentPage = async (): Promise<void> => {
		await loadSelectedChatMessages();
	};

	/**
	 * @description Обновляет весь экран: список чатов и текущие сообщения.
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
	 * @description Запускает синхронизацию для указанного peer и перезагружает данные.
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
			const parsedLimit = Number(syncLimitValue.value);
			const syncLimit =
				Number.isFinite(parsedLimit) && parsedLimit > 0
					? Math.max(1, Math.floor(parsedLimit))
					: Math.max(1, options.defaultSyncLimit);
			syncLimitValue.value = String(syncLimit);
			const result = await options.transport.syncArchive({
				peer,
				limit: syncLimit,
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
	 */
	const handleChatSelection = async (chatId: string): Promise<void> => {
		if (selectedChatId.value === chatId) return;
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
	 * @description Удаляет чат и всю локальную историю (SQLite), не затрагивая Telegram.
	 */
	const handleDeleteChat = async (chatId: string): Promise<void> => {
		const trimmed = chatId.trim();
		if (!trimmed) return;

		const confirmed = window.confirm(
			'Удалить этот чат из локального архива вместе со всеми сообщениями? Действие не затрагивает Telegram.'
		);
		if (!confirmed) return;

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
	 * @description Ручной backfill «сначала Telegram»: догружает старые сообщения через сервер `/archive/backfill`,
	 * затем перезагружает текущую страницу.
	 */
	const handleBackfillOlder = async (): Promise<void> => {
		if (!selectedChatId.value || isBackfilling.value || isLoadingMessages.value)
			return;

		isBackfilling.value = true;
		try {
			const parsedLimit = Number(syncLimitValue.value);
			const syncLimit =
				Number.isFinite(parsedLimit) && parsedLimit > 0
					? Math.max(1, Math.floor(parsedLimit))
					: Math.max(1, options.defaultSyncLimit);
			syncLimitValue.value = String(syncLimit);
			const result = await options.transport.backfillArchive({
				chatId: selectedChatId.value,
				limit: options.backfillLimit ?? syncLimit,
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
	 * @description Ручная синхронизация новых сообщений для выбранного чата (forward-sync).
	 */
	const handleSyncNewerForSelectedChat = async (): Promise<void> => {
		if (!selectedChat.value || isSyncing.value) return;

		const peer =
			selectedChat.value.username?.trim() || selectedChat.value.chatId.trim();
		isSyncing.value = true;
		screen.setMessage('neutral', `Догружаем новые сообщения для ${peer}…`);

		try {
			const parsedLimit = Number(syncLimitValue.value);
			const syncLimit =
				Number.isFinite(parsedLimit) && parsedLimit > 0
					? Math.max(1, Math.floor(parsedLimit))
					: Math.max(1, options.defaultSyncLimit);
			syncLimitValue.value = String(syncLimit);
			const result = await options.transport.syncArchive({
				peer,
				limit: syncLimit,
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
	 * @description Форматирует дату для человекочитаемого UI.
	 */
	const formatDate = (value?: string | null): string => {
		if (!value) return 'ещё не было';
		return new Date(value).toLocaleString();
	};

	return {
		peerInputValue,
		syncLimitValue,
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
