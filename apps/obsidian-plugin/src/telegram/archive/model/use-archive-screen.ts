/**
 * @module telegram/archive/model/use-archive-screen
 *
 * @description Composable экрана архива Telegram, ориентированного на импорт
 * Telegram Desktop export и просмотр сырых данных.
 */

import { computed, ref } from 'vue';
import type {
	ArchiveChat,
	ArchiveMessage,
} from '../../../../../../packages/contracts/src/telegram';
import { useFilterQuery, useScreenMessage } from '../../../ui-vue';
import type { ChatTimelineItem } from '../../../ui-vue';
import type { ArchiveTransportPort } from '../ports/archive-transport-port';

export interface ArchiveScreenModelOptions {
	transport: ArchiveTransportPort;
	defaultPeer?: string;
	defaultSyncLimit: number;
	recentMessagesLimit: number;
}

export function useArchiveScreen(options: ArchiveScreenModelOptions) {
	const selectedChatId = ref<string | null>(null);
	const peerInputValue = ref(options.defaultPeer || '');
	const selectedFolderLabel = ref(options.defaultPeer || '');
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
	const isDeletingChatId = ref<string | null>(null);
	const highlightedMessageId = ref<number | null>(null);

	const screen = useScreenMessage();
	const search = useFilterQuery(chats, chat =>
		[chat.title, chat.username, chat.chatId, chat.type]
			.filter(Boolean)
			.join(' ')
	);

	const selectedChat = computed(
		() => chats.value.find(chat => chat.chatId === selectedChatId.value) || null
	);
	const effectiveTotalMessages = computed(() => {
		return selectedChat.value?.messageCount || selectedChatTotal.value || 0;
	});
	const selectedMessagesById = computed(() => {
		const map = new Map<number, ArchiveMessage>();
		for (const message of selectedChatMessages.value) {
			map.set(message.messageId, message);
		}
		return map;
	});
	const orderedSelectedChatMessages = computed(() => {
		return [...selectedChatMessages.value].reverse();
	});
	const selectedTimelineItems = computed<ChatTimelineItem[]>(() => {
		return orderedSelectedChatMessages.value.map(message => {
			const accent = getMessageAccent(message);
			const replyPreview = getReplyPreview(message);
			const attachments = getMediaItems(message).map((attachment, index) => ({
				id: `${message.messagePk}-attachment-${index}`,
				kind: String(attachment.kind || 'file'),
				name: String(
					attachment.fileName ||
						attachment.relativePath ||
						attachment.kind ||
						'Вложение'
				),
				description: '',
				previewSrc: resolveAttachmentSrc(attachment),
				isImage: isImageAttachment(attachment),
				size:
					typeof attachment.size === 'number' ? Number(attachment.size) : null,
				mimeType: attachment.mimeType ? String(attachment.mimeType) : null,
			}));
			const reactions = (
				Array.isArray(message.reactions) ? message.reactions : []
			) as Array<Record<string, unknown>>;

			return {
				id: String(message.messageId),
				anchorId: `archive-message-${message.messageId}`,
				role: 'other',
				align: 'start',
				author: getMessageAuthorLabel(message),
				initials: getMessageInitials(message),
				meta: formatMessageMeta(message),
				text: message.textNormalized || message.textRaw || '',
				replyPreview: replyPreview
					? {
							label: replyPreview.author,
							text: replyPreview.text,
							targetId: message.replyToMessageId
								? String(message.replyToMessageId)
								: null,
						}
					: null,
				forwardedLabel: (message.forward as { forwardedFrom?: string } | null)
					?.forwardedFrom
					? `Переслано из ${(message.forward as { forwardedFrom?: string }).forwardedFrom}`
					: null,
				attachments,
				reactions: reactions.map((reaction, index) => ({
					id: `${message.messagePk}-reaction-${index}`,
					label: String(reaction.emoji || reaction.type || 'reaction'),
					count:
						typeof reaction.count === 'number' ? Number(reaction.count) : null,
				})),
				badges: summarizeMessagePayload(message),
				accent: {
					avatarBg: accent.bg,
					avatarText: 'rgba(255, 255, 255, 0.95)',
					bubbleBg: 'rgba(29, 29, 29, 0.96)',
					bubbleBorder: 'rgba(255, 255, 255, 0.08)',
				},
			} satisfies ChatTimelineItem;
		});
	});
	const selectedMessageStats = computed(() => {
		const messages = selectedChatMessages.value;
		const withText = messages.filter(message =>
			Boolean(message.textNormalized)
		).length;
		const withMedia = messages.filter(message => Boolean(message.media)).length;
		const service = messages.filter(
			message => message.messageType === 'service' || Boolean(message.service)
		).length;
		return { withText, withMedia, service };
	});

	const currentPage = computed(() => {
		const total = effectiveTotalMessages.value;
		const pageSize = Math.max(1, messagesPageLimit.value);
		if (total <= 0) {
			return 1;
		}
		const sourcePage = Math.floor(messagesPageOffset.value / pageSize) + 1;
		const pages = Math.max(1, Math.ceil(total / pageSize));
		return pages - sourcePage + 1;
	});
	const totalPages = computed(() =>
		Math.max(
			1,
			Math.ceil(effectiveTotalMessages.value / messagesPageLimit.value)
		)
	);
	const canGoPrevPage = computed(() => currentPage.value > 1);
	const canGoNextPage = computed(() => currentPage.value < totalPages.value);

	const visibleRangeText = computed(() => {
		if (
			effectiveTotalMessages.value === 0 ||
			selectedChatMessages.value.length === 0
		) {
			return '0 из 0';
		}
		const from = (currentPage.value - 1) * messagesPageLimit.value + 1;
		const to = Math.min(
			from + selectedChatMessages.value.length - 1,
			effectiveTotalMessages.value
		);
		return `${from}-${to} из ${selectedChatTotal.value}`;
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

	const normalizeChats = (rawChats: unknown[]): ArchiveChat[] =>
		rawChats
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

	const getSourceOffsetForDisplayPage = (
		displayPage: number,
		limit: number,
		total: number
	): number => {
		const safeLimit = Math.max(1, Math.floor(limit));
		const safeTotal = Math.max(0, total);
		const pages = Math.max(1, Math.ceil(safeTotal / safeLimit));
		const boundedDisplayPage = Math.min(
			Math.max(1, Math.floor(displayPage)),
			pages
		);
		const sourcePage = pages - boundedDisplayPage + 1;
		return Math.max(0, (sourcePage - 1) * safeLimit);
	};

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

		const nextLimit =
			typeof params?.limit === 'number' && Number.isFinite(params.limit)
				? Math.max(1, Math.floor(params.limit))
				: messagesPageLimit.value;
		const totalForPaging =
			selectedChat.value?.messageCount || selectedChatTotal.value || 0;
		const nextDisplayPage =
			typeof params?.offset === 'number'
				? Math.max(1, Math.floor(params.offset))
				: currentPage.value;
		const nextOffset = getSourceOffsetForDisplayPage(
			nextDisplayPage,
			nextLimit,
			totalForPaging
		);

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
		} finally {
			isLoadingMessages.value = false;
		}
	};

	const refreshData = async (): Promise<void> => {
		isRefreshing.value = true;
		try {
			await loadChats();
			await loadSelectedChatMessages({ offset: 1 });
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось обновить архив: ${(error as Error).message}`
			);
		} finally {
			isRefreshing.value = false;
		}
	};

	const handleSync = async (): Promise<void> => {
		screen.setMessage(
			'neutral',
			'Для импорта выберите папку Telegram Desktop export через кнопку.'
		);
	};

	const handleDesktopExportSelection = async (
		files: FileList | File[]
	): Promise<void> => {
		const fileArray = Array.from(files);
		if (fileArray.length === 0) {
			return;
		}

		const resultJsonFile = fileArray.find(file => {
			const relativePath =
				(file as File & { webkitRelativePath?: string }).webkitRelativePath ||
				file.name;
			return /(^|\/)result\.json$/i.test(relativePath);
		});

		if (!resultJsonFile) {
			screen.setMessage(
				'error',
				'В выбранной папке не найден result.json. Выберите корень Telegram Desktop export.'
			);
			return;
		}

		const relativePath =
			(resultJsonFile as File & { webkitRelativePath?: string })
				.webkitRelativePath || resultJsonFile.name;
		const folderLabel =
			relativePath.split('/')[0] ||
			selectedFolderLabel.value ||
			'Telegram export';
		selectedFolderLabel.value = folderLabel;
		peerInputValue.value = folderLabel;

		isSyncing.value = true;
		screen.setMessage('neutral', `Импортируем архив "${folderLabel}"...`);
		try {
			const rawText = await resultJsonFile.text();
			const exportData = JSON.parse(rawText) as Record<string, unknown>;
			const result = await options.transport.importDesktopArchive({
				folderLabel,
				exportData,
			});

			await loadChats();
			selectedChatId.value = result.chatId || selectedChatId.value;
			messagesPageOffset.value = 0;
			await loadSelectedChatMessages({ offset: 1 });
			screen.setMessage(
				'success',
				`Импорт завершён: добавлено ${result.inserted}, обновлено ${result.updated}, без изменений ${result.skipped}.`
			);
		} catch (error) {
			screen.setMessage(
				'error',
				`Импорт не удался: ${(error as Error).message}`
			);
		} finally {
			isSyncing.value = false;
		}
	};

	const handleChatSelection = async (chatId: string): Promise<void> => {
		if (selectedChatId.value === chatId) return;
		selectedChatId.value = chatId;
		messagesPageOffset.value = 0;
		try {
			await loadSelectedChatMessages({ offset: 1 });
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось загрузить сообщения: ${(error as Error).message}`
			);
		}
	};

	const goToPrevPage = async (): Promise<void> => {
		if (isLoadingMessages.value || !canGoPrevPage.value) return;
		await loadSelectedChatMessages({
			offset: currentPage.value - 1,
		});
	};

	const goToNextPage = async (): Promise<void> => {
		if (isLoadingMessages.value || !canGoNextPage.value) return;
		await loadSelectedChatMessages({
			offset: currentPage.value + 1,
		});
	};

	const goToPage = async (page: number): Promise<void> => {
		if (isLoadingMessages.value) return;
		const target = Math.min(Math.max(1, Math.floor(page)), totalPages.value);
		await loadSelectedChatMessages({
			offset: target,
		});
	};

	const reloadCurrentPage = async (): Promise<void> => {
		await loadSelectedChatMessages();
	};

	const jumpToMessageInCurrentView = (messageId: number): boolean => {
		const exists = selectedMessagesById.value.has(messageId);
		if (!exists) {
			screen.setMessage(
				'neutral',
				`Reply #${messageId} не загружен на текущей странице.`
			);
			return false;
		}

		highlightedMessageId.value = messageId;
		window.setTimeout(() => {
			const element = document.getElementById(`archive-message-${messageId}`);
			element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}, 0);
		window.setTimeout(() => {
			if (highlightedMessageId.value === messageId) {
				highlightedMessageId.value = null;
			}
		}, 1800);
		return true;
	};

	const handleDeleteChat = async (chatId: string): Promise<void> => {
		const trimmed = chatId.trim();
		if (!trimmed) return;

		const confirmed = window.confirm(
			'Удалить этот чат из локального архива вместе со всеми сообщениями?'
		);
		if (!confirmed) return;

		isDeletingChatId.value = trimmed;
		try {
			const { deleted } = await options.transport.deleteArchiveChat(trimmed);
			screen.setMessage(
				deleted ? 'success' : 'neutral',
				deleted ? 'Чат удалён из локального архива.' : 'Чат не найден в архиве.'
			);
			await loadChats();
			messagesPageOffset.value = 0;
			await loadSelectedChatMessages({ offset: 1 });
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось удалить чат: ${(error as Error).message}`
			);
		} finally {
			isDeletingChatId.value = null;
		}
	};

	const formatDate = (value?: string | null): string => {
		if (!value) return 'ещё не было';
		return new Date(value).toLocaleString();
	};

	const formatMessageMeta = (message: ArchiveMessage): string => {
		const parts = [formatDate(message.timestampUtc)];
		if (message.messageType && message.messageType !== 'message') {
			parts.unshift(message.messageType);
		}
		return parts.join(' · ');
	};

	const getMessageAuthorLabel = (message: ArchiveMessage): string => {
		return (
			message.senderDisplayName ||
			message.senderName ||
			message.senderId ||
			'Unknown'
		);
	};

	const getMessageInitials = (message: ArchiveMessage): string => {
		const label = getMessageAuthorLabel(message).replace(/\s+/g, ' ').trim();
		if (!label) return '?';
		const parts = label.split(' ').filter(Boolean);
		if (parts.length === 1) {
			return parts[0].slice(0, 2).toUpperCase();
		}
		return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
	};

	const getMessageAccent = (
		message: ArchiveMessage
	): {
		bg: string;
		soft: string;
		text: string;
		border: string;
		tint: string;
	} => {
		const seed = `${message.senderId || ''}:${message.senderDisplayName || ''}`;
		let hash = 0;
		for (let index = 0; index < seed.length; index += 1) {
			hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
		}
		const hue = hash % 360;
		return {
			bg: `hsl(${hue} 32% 52%)`,
			soft: `hsl(${hue} 22% 97%)`,
			text: `hsl(${hue} 28% 34%)`,
			border: `hsl(${hue} 18% 84%)`,
			tint: `hsl(${hue} 22% 92%)`,
		};
	};

	const getReplyPreview = (
		message: ArchiveMessage
	): { author: string; text: string } | null => {
		if (!message.replyToMessageId) return null;
		const reply = selectedMessagesById.value.get(message.replyToMessageId);
		if (!reply) {
			return {
				author: `#${message.replyToMessageId}`,
				text: 'Сообщение вне текущего окна',
			};
		}
		return {
			author: getMessageAuthorLabel(reply),
			text:
				reply.textNormalized ||
				reply.textRaw ||
				(reply.media ? 'Вложение' : 'Сообщение без текста'),
		};
	};

	const getMediaItems = (
		message: ArchiveMessage
	): Array<Record<string, unknown>> => {
		const media = message.media as
			| { attachments?: Array<Record<string, unknown>> }
			| null
			| undefined;
		const attachments = media?.attachments;
		return Array.isArray(attachments) ? attachments : [];
	};

	const isImageAttachment = (attachment: Record<string, unknown>): boolean => {
		const relativePath = String(attachment.relativePath || '');
		const mimeType = String(attachment.mimeType || '');
		return (
			mimeType.startsWith('image/') ||
			/\.(png|jpe?g|gif|webp)$/i.test(relativePath)
		);
	};

	const resolveAttachmentSrc = (
		attachment: Record<string, unknown>
	): string | null => {
		const absolutePath = String(attachment.absolutePath || '');
		if (!absolutePath) return null;
		return `file:///${absolutePath.replace(/\\/g, '/')}`;
	};

	const summarizeMessagePayload = (message: ArchiveMessage): string[] => {
		const result: string[] = [];
		if (message.replyToMessageId) {
			result.push(`Ответ на: #${message.replyToMessageId}`);
		}
		const mediaItems = getMediaItems(message);
		if (mediaItems.length > 0) {
			result.push(`Вложений: ${mediaItems.length}`);
		}
		if ((message.forward as { forwardedFrom?: string } | null)?.forwardedFrom) {
			result.push(
				`Forwarded from: ${(message.forward as { forwardedFrom?: string }).forwardedFrom}`
			);
		}
		const reactions =
			(message.reactions as Array<Record<string, unknown>> | null) || [];
		if (reactions.length > 0) {
			result.push(`Реакций: ${reactions.length}`);
		}
		return result;
	};

	return {
		peerInputValue,
		syncLimitValue,
		searchQuery: search.query,
		chats,
		filteredChats: search.filtered,
		selectedChatId,
		selectedChatMessages,
		orderedSelectedChatMessages,
		selectedTimelineItems,
		selectedChatTotal,
		currentPage,
		totalPages,
		canGoPrevPage,
		canGoNextPage,
		isRefreshing,
		isLoadingMessages,
		isSyncing,
		isBackfilling: ref(false),
		isDeletingChatId,
		highlightedMessageId,
		screenMessage: screen.message,
		selectedChat,
		selectedMessageStats,
		selectedFolderLabel,
		refreshData,
		handleSync,
		handleDesktopExportSelection,
		handleChatSelection,
		goToPrevPage,
		goToNextPage,
		goToPage,
		reloadCurrentPage,
		jumpToMessageInCurrentView,
		handleBackfillOlder: async () => undefined,
		handleSyncNewerForSelectedChat: async () => undefined,
		visibleRangeText,
		fullTimeRangeText,
		handleDeleteChat,
		formatDate,
		formatMessageMeta,
		getMessageAuthorLabel,
		getMessageInitials,
		getMessageAccent,
		getReplyPreview,
		getMediaItems,
		isImageAttachment,
		resolveAttachmentSrc,
		summarizeMessagePayload,
	};
}
