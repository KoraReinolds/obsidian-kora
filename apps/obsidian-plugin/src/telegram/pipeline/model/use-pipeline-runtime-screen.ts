/**
 * @module telegram/pipeline/model/use-pipeline-runtime-screen
 *
 * @description Composable для minimal pipeline runtime: selection slice, ручной
 * запуск шагов, локальный preview и отправка embedding-пакетов через текущий vector bridge.
 */

import { computed, reactive, ref } from 'vue';
import type {
	ArchiveChat,
	ArchiveMessage,
	ArchiveMessagesResponse,
} from '../../../../../../packages/contracts/src/telegram';
import type {
	Artifact,
	SourceUnit,
} from '../../../../../../packages/kora-core/src';
import {
	buildDialogueArtifactsFromArchiveMessages,
	buildSourceUnitsFromArchiveMessages,
} from '../../../../../../packages/kora-core/src';
import { useScreenMessage } from '../../../ui-vue';
import type {
	PipelineRuntimeTransportPort,
	PipelineVectorHealthResponse,
	PipelineVectorizeRequest,
} from '../ports/pipeline-runtime-port';

export type PipelineStepKey = 'normalize' | 'chunk' | 'embed';

export type PipelineStepStatus =
	| 'idle'
	| 'running'
	| 'success'
	| 'warning'
	| 'error';

export interface PipelineStepState {
	key: PipelineStepKey;
	status: PipelineStepStatus;
	startedAt: string | null;
	finishedAt: string | null;
	processed: number;
	skipped: number;
	failed: number;
	summary: string;
	error: string | null;
}

export interface PipelineRuntimeModelOptions {
	transport: PipelineRuntimeTransportPort;
	defaultPageLimit: number;
	defaultChunkSize: number;
	defaultGapMinutes: number;
}

export interface PipelineNormalizedMessage {
	messagePk: string;
	messageId: number;
	chatId: string;
	timestampUtc: string;
	senderLabel: string;
	kind: 'message' | 'service' | 'reply' | 'forward' | 'media';
	content: string;
	rawContent: string;
	notes: string[];
	source: ArchiveMessage;
	sourceUnit: SourceUnit;
}

export interface PipelineChunkRecord {
	chunkId: string;
	chatId: string;
	title: string;
	content: string;
	messageIds: number[];
	messagePks: string[];
	sourceSenders: string[];
	startTimestampUtc: string;
	endTimestampUtc: string;
	contentType: 'telegram_post' | 'telegram_comment';
	artifact: Artifact;
}

export interface PipelineSelectionSnapshot {
	chatId: string;
	pageLimit: number;
	pageNumber: number;
	includeServiceMessages: boolean;
	includeReplies: boolean;
	includeMediaOnlyMessages: boolean;
}

const DEFAULT_VECTOR_BATCH_SIZE = 16;

const createStepState = (key: PipelineStepKey): PipelineStepState => ({
	key,
	status: 'idle',
	startedAt: null,
	finishedAt: null,
	processed: 0,
	skipped: 0,
	failed: 0,
	summary: 'Ожидает запуска',
	error: null,
});

const parsePositiveInt = (value: string, fallback: number): number => {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return Math.max(1, Math.floor(fallback));
	}
	return Math.max(1, Math.floor(parsed));
};

const getMediaItems = (
	message: ArchiveMessage
): Array<Record<string, unknown>> => {
	const media = message.media as
		| { attachments?: Array<Record<string, unknown>> }
		| null
		| undefined;
	return Array.isArray(media?.attachments) ? media?.attachments || [] : [];
};

const describeMediaItems = (message: ArchiveMessage): string[] => {
	return getMediaItems(message)
		.map(item =>
			String(item.fileName || item.relativePath || item.kind || '').trim()
		)
		.filter(Boolean);
};

const buildReplyContext = (message: ArchiveMessage): string | null => {
	if (!message.replyToMessageId) {
		return null;
	}
	return `Reply to #${message.replyToMessageId}`;
};

const buildForwardContext = (message: ArchiveMessage): string | null => {
	const forwardedFrom = (message.forward as { forwardedFrom?: string } | null)
		?.forwardedFrom;
	if (!forwardedFrom) {
		return null;
	}
	return `Forwarded from ${forwardedFrom}`;
};

const formatDate = (value?: string | null): string => {
	if (!value) return 'ещё не было';
	return new Date(value).toLocaleString();
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

const mapSourceUnitToPreview = (
	unit: SourceUnit,
	sourceByPk: Map<string, ArchiveMessage>
): PipelineNormalizedMessage => {
	const source = sourceByPk.get(unit.id);
	const metadata = unit.metadata || {};
	const text =
		typeof metadata.textNormalized === 'string'
			? metadata.textNormalized
			: typeof metadata.textRaw === 'string'
				? metadata.textRaw
				: unit.text;
	const messageId =
		typeof metadata.messageId === 'number' ? metadata.messageId : Number.NaN;

	const baseNotes = Array.isArray(metadata.notes)
		? metadata.notes.filter(
				(value): value is string => typeof value === 'string'
			)
		: [];
	const contextNotes: string[] = [];
	if (source) {
		const replyLine = buildReplyContext(source);
		if (replyLine) {
			contextNotes.push(replyLine);
		}
		const forwardLine = buildForwardContext(source);
		if (forwardLine) {
			contextNotes.push(forwardLine);
		}
		for (const mediaLine of describeMediaItems(source)) {
			contextNotes.push(`Media: ${mediaLine}`);
		}
	}

	return {
		messagePk: unit.id,
		messageId,
		chatId: unit.sourceId,
		timestampUtc: unit.timestamp || '',
		senderLabel: unit.author || 'Unknown',
		kind:
			unit.unitType === 'event'
				? 'service'
				: typeof metadata.replyToMessageId === 'number'
					? 'reply'
					: typeof metadata.forwardedFrom === 'string'
						? 'forward'
						: Boolean(metadata.hasMedia) &&
							  !(
									typeof metadata.textNormalized === 'string' &&
									metadata.textNormalized
							  )
							? 'media'
							: 'message',
		content: unit.text,
		rawContent: text,
		notes: [...baseNotes, ...contextNotes],
		source: source || {
			messagePk: unit.id,
			chatId: unit.sourceId,
			messageId,
			timestampUtc: unit.timestamp || '',
			textNormalized: text,
			textRaw: text,
			contentHash: String(metadata.contentHash || unit.id),
		},
		sourceUnit: unit,
	};
};

const mapArtifactToChunkRecord = (artifact: Artifact): PipelineChunkRecord => {
	const metadata = artifact.metadata || {};
	return {
		chunkId: artifact.id,
		chatId: artifact.sourceId,
		title: String(metadata.title || artifact.id),
		content: artifact.text,
		messageIds: Array.isArray(metadata.messageIds)
			? metadata.messageIds.filter(
					(value): value is number => typeof value === 'number'
				)
			: [],
		messagePks: Array.isArray(metadata.messagePks)
			? metadata.messagePks.filter(
					(value): value is string => typeof value === 'string'
				)
			: [],
		sourceSenders: Array.isArray(metadata.sourceAuthors)
			? metadata.sourceAuthors.filter(
					(value): value is string => typeof value === 'string'
				)
			: [],
		startTimestampUtc: String(metadata.startTimestampUtc || artifact.createdAt),
		endTimestampUtc: String(metadata.endTimestampUtc || artifact.updatedAt),
		contentType:
			metadata.contentType === 'telegram_comment'
				? 'telegram_comment'
				: 'telegram_post',
		artifact,
	};
};

const splitIntoBatches = <T>(items: T[], size: number): T[][] => {
	const safeSize = Math.max(1, Math.floor(size));
	const batches: T[][] = [];
	for (let index = 0; index < items.length; index += safeSize) {
		batches.push(items.slice(index, index + safeSize));
	}
	return batches;
};

export function usePipelineRuntimeScreen(options: PipelineRuntimeModelOptions) {
	const screen = useScreenMessage();
	const chats = ref<ArchiveChat[]>([]);
	const selectedChatId = ref<string | null>(null);
	const selectedChatMessages = ref<ArchiveMessage[]>([]);
	const selectedChatTotal = ref(0);
	const selectedChatFullRange = ref<{
		oldestTimestampUtc: string | null;
		newestTimestampUtc: string | null;
	}>({
		oldestTimestampUtc: null,
		newestTimestampUtc: null,
	});
	const pageLimitValue = ref(String(Math.max(1, options.defaultPageLimit)));
	const pageNumberValue = ref('1');
	const chunkSizeValue = ref(String(Math.max(1, options.defaultChunkSize)));
	const gapMinutesValue = ref(String(Math.max(1, options.defaultGapMinutes)));
	const includeServiceMessages = ref(false);
	const includeReplies = ref(true);
	const includeMediaOnlyMessages = ref(true);
	const selectedStepKey = ref<PipelineStepKey>('normalize');
	const isRefreshingChats = ref(false);
	const isLoadingSelection = ref(false);
	const isRunningStep = ref<PipelineStepKey | null>(null);
	const vectorHealth = ref<PipelineVectorHealthResponse | null>(null);
	const normalizedRecords = ref<PipelineNormalizedMessage[]>([]);
	const chunkRecords = ref<PipelineChunkRecord[]>([]);
	const embeddingPayloads = ref<PipelineVectorizeRequest[]>([]);
	const embeddingResults = ref<unknown[]>([]);

	const stepStates = reactive<Record<PipelineStepKey, PipelineStepState>>({
		normalize: createStepState('normalize'),
		chunk: createStepState('chunk'),
		embed: createStepState('embed'),
	});

	const selectedChat = computed(
		() => chats.value.find(chat => chat.chatId === selectedChatId.value) || null
	);

	const rawMessageCount = computed(() => selectedChatMessages.value.length);
	const filteredMessages = computed(() => {
		return selectedChatMessages.value.filter(message => {
			const isService =
				message.messageType === 'service' || Boolean(message.service);
			const hasText = Boolean(message.textNormalized || message.textRaw);
			const hasMedia = getMediaItems(message).length > 0;
			const hasReply = Boolean(message.replyToMessageId);

			if (!includeServiceMessages.value && isService) {
				return false;
			}
			if (!includeReplies.value && hasReply) {
				return false;
			}
			if (!includeMediaOnlyMessages.value && hasMedia && !hasText) {
				return false;
			}
			return true;
		});
	});

	const filteredMessageCount = computed(() => filteredMessages.value.length);

	const currentPage = computed(() => {
		const total =
			selectedChat.value?.messageCount || selectedChatTotal.value || 0;
		const pageSize = Math.max(1, parsePositiveInt(pageLimitValue.value, 1));
		if (total <= 0) {
			return 1;
		}
		const sourcePage =
			Math.floor(parsePositiveInt(pageNumberValue.value, 1)) || 1;
		const pages = Math.max(1, Math.ceil(total / pageSize));
		return Math.min(Math.max(1, sourcePage), pages);
	});

	const totalPages = computed(() => {
		const total =
			selectedChat.value?.messageCount || selectedChatTotal.value || 0;
		const pageSize = Math.max(1, parsePositiveInt(pageLimitValue.value, 1));
		return Math.max(1, Math.ceil(total / pageSize));
	});

	const visibleRangeText = computed(() => {
		const total =
			selectedChat.value?.messageCount || selectedChatTotal.value || 0;
		if (selectedChatMessages.value.length === 0 || total === 0) {
			return '0 из 0';
		}
		const from =
			(currentPage.value - 1) * parsePositiveInt(pageLimitValue.value, 1) + 1;
		const to = Math.min(from + selectedChatMessages.value.length - 1, total);
		return `${from}-${to} из ${total}`;
	});

	const selectedSelectionSnapshot = computed<PipelineSelectionSnapshot>(() => ({
		chatId: selectedChatId.value || '',
		pageLimit: parsePositiveInt(pageLimitValue.value, options.defaultPageLimit),
		pageNumber: currentPage.value,
		includeServiceMessages: includeServiceMessages.value,
		includeReplies: includeReplies.value,
		includeMediaOnlyMessages: includeMediaOnlyMessages.value,
	}));

	const selectedChatLabel = computed(
		() => selectedChat.value?.title || 'Не выбран'
	);
	const selectedChatType = computed(
		() => selectedChat.value?.type || 'unknown'
	);

	const isVectorReady = computed(
		() => vectorHealth.value?.status === 'healthy'
	);

	const vectorHealthText = computed(() => {
		if (!vectorHealth.value) {
			return 'Vector health не проверен';
		}
		return vectorHealth.value.status === 'healthy'
			? `Vector ready · ${vectorHealth.value.stats?.totalPoints || 0} points`
			: `Vector ${vectorHealth.value.status}${
					vectorHealth.value.error ? ` · ${vectorHealth.value.error}` : ''
				}`;
	});

	const orderedRawMessages = computed(() =>
		[...selectedChatMessages.value].reverse()
	);
	const orderedNormalizedMessages = computed(() =>
		[...normalizedRecords.value].reverse()
	);
	const orderedChunkRecords = computed(() => [...chunkRecords.value].reverse());

	const selectedStepState = computed(() => stepStates[selectedStepKey.value]);
	const selectedStepTitle = computed(() => {
		if (selectedStepKey.value === 'normalize') return 'Normalize';
		if (selectedStepKey.value === 'chunk') return 'Chunk';
		return 'Embed';
	});

	const sampleNormalizedRecord = computed(
		() => normalizedRecords.value[0] || null
	);
	const sampleChunkRecord = computed(() => chunkRecords.value[0] || null);
	const samplePayload = computed(() => embeddingPayloads.value[0] || null);

	const loadChats = async (): Promise<void> => {
		isRefreshingChats.value = true;
		try {
			const rawChats = await options.transport.getArchivedChats(200);
			chats.value = rawChats;
			if (!selectedChatId.value && rawChats.length > 0) {
				selectedChatId.value = rawChats[0].chatId;
			}
			if (
				selectedChatId.value &&
				!rawChats.some(chat => chat.chatId === selectedChatId.value)
			) {
				selectedChatId.value = rawChats[0]?.chatId || null;
			}
		} finally {
			isRefreshingChats.value = false;
		}
	};

	const loadVectorHealth = async (): Promise<void> => {
		try {
			vectorHealth.value = await options.transport.getVectorHealthDetails();
		} catch (error) {
			vectorHealth.value = {
				status: 'error',
				error: (error as Error).message,
			};
		}
	};

	const clearDerivedArtifacts = (): void => {
		normalizedRecords.value = [];
		chunkRecords.value = [];
		embeddingPayloads.value = [];
		embeddingResults.value = [];
		stepStates.normalize = createStepState('normalize');
		stepStates.chunk = createStepState('chunk');
		stepStates.embed = createStepState('embed');
		selectedStepKey.value = 'normalize';
	};

	const markStepRunning = (key: PipelineStepKey): void => {
		isRunningStep.value = key;
		stepStates[key] = {
			...stepStates[key],
			status: 'running',
			startedAt: new Date().toISOString(),
			finishedAt: null,
			error: null,
			summary: 'Выполняется...',
		};
	};

	const finishStep = (
		key: PipelineStepKey,
		patch: Partial<PipelineStepState>
	): void => {
		stepStates[key] = {
			...stepStates[key],
			...patch,
			finishedAt: new Date().toISOString(),
		};
		isRunningStep.value = null;
	};

	const failStep = (key: PipelineStepKey, error: Error): void => {
		stepStates[key] = {
			...stepStates[key],
			status: 'error',
			finishedAt: new Date().toISOString(),
			error: error.message,
			summary: 'Шаг завершился с ошибкой',
		};
		isRunningStep.value = null;
	};

	const loadSelectionSlice = async (params?: {
		pageNumber?: number;
		pageLimit?: number;
	}): Promise<void> => {
		if (!selectedChatId.value) {
			selectedChatMessages.value = [];
			selectedChatTotal.value = 0;
			selectedChatFullRange.value = {
				oldestTimestampUtc: null,
				newestTimestampUtc: null,
			};
			clearDerivedArtifacts();
			return;
		}

		const nextPageLimit = parsePositiveInt(
			String(params?.pageLimit ?? pageLimitValue.value),
			options.defaultPageLimit
		);
		const nextPageNumber = parsePositiveInt(
			String(params?.pageNumber ?? pageNumberValue.value),
			1
		);
		const total =
			selectedChat.value?.messageCount || selectedChatTotal.value || 0;
		const nextOffset = getSourceOffsetForDisplayPage(
			nextPageNumber,
			nextPageLimit,
			total
		);

		pageLimitValue.value = String(nextPageLimit);
		pageNumberValue.value = String(nextPageNumber);
		clearDerivedArtifacts();
		isLoadingSelection.value = true;

		try {
			const response: ArchiveMessagesResponse =
				await options.transport.getArchivedMessages({
					chatId: selectedChatId.value,
					limit: nextPageLimit,
					offset: nextOffset,
				});

			selectedChatMessages.value = response.messages;
			selectedChatTotal.value = response.total;
			selectedChatFullRange.value = response.fullRange;
			screen.setMessage(
				'success',
				`Slice загружен: ${response.messages.length} сообщений, страница ${nextPageNumber}/${Math.max(
					1,
					Math.ceil((response.total || 0) / nextPageLimit)
				)}.`
			);
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось загрузить selection slice: ${(error as Error).message}`
			);
		} finally {
			isLoadingSelection.value = false;
		}
	};

	const refreshData = async (): Promise<void> => {
		isRefreshingChats.value = true;
		try {
			await loadChats();
			await loadVectorHealth();
			if (selectedChatId.value) {
				await loadSelectionSlice({ pageNumber: currentPage.value });
			}
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось обновить runtime: ${(error as Error).message}`
			);
		} finally {
			isRefreshingChats.value = false;
		}
	};

	const handleChatSelection = async (chatId: string): Promise<void> => {
		if (!chatId || chatId === selectedChatId.value) return;
		selectedChatId.value = chatId;
		pageNumberValue.value = '1';
		await loadSelectionSlice({ pageNumber: 1 });
	};

	const handlePageSubmit = async (): Promise<void> => {
		await loadSelectionSlice({
			pageNumber: parsePositiveInt(pageNumberValue.value, 1),
			pageLimit: parsePositiveInt(
				pageLimitValue.value,
				options.defaultPageLimit
			),
		});
	};

	const goToPrevPage = async (): Promise<void> => {
		const next = Math.max(1, currentPage.value - 1);
		pageNumberValue.value = String(next);
		await loadSelectionSlice({ pageNumber: next });
	};

	const goToNextPage = async (): Promise<void> => {
		const next = Math.min(totalPages.value, currentPage.value + 1);
		pageNumberValue.value = String(next);
		await loadSelectionSlice({ pageNumber: next });
	};

	const runNormalizeStep = async (): Promise<void> => {
		markStepRunning('normalize');
		try {
			const source = filteredMessages.value;
			const sourceUnits = buildSourceUnitsFromArchiveMessages(source, {
				chatId: selectedChatId.value || '',
			});
			const sourceByPk = new Map(
				source.map(message => [message.messagePk, message] as const)
			);
			const next = sourceUnits.map(unit =>
				mapSourceUnitToPreview(unit, sourceByPk)
			);
			normalizedRecords.value = next;
			chunkRecords.value = [];
			embeddingPayloads.value = [];
			embeddingResults.value = [];
			finishStep('normalize', {
				status: 'success',
				processed: next.length,
				skipped: 0,
				failed: 0,
				summary: `Построено ${next.length} source units`,
				error: null,
			});
			selectedStepKey.value = 'normalize';
		} catch (error) {
			failStep('normalize', error as Error);
			screen.setMessage(
				'error',
				`Normalize step failed: ${(error as Error).message}`
			);
		}
	};

	const runChunkStep = async (): Promise<void> => {
		markStepRunning('chunk');
		try {
			if (normalizedRecords.value.length === 0) {
				await runNormalizeStep();
			}
			const next = buildDialogueArtifactsFromArchiveMessages(
				filteredMessages.value,
				{
					chatId: selectedChatId.value || '',
					chatTitle: selectedChatLabel.value,
					scopeId: selectedChatId.value || '',
					windowSize: parsePositiveInt(
						chunkSizeValue.value,
						options.defaultChunkSize
					),
					gapMinutes: parsePositiveInt(
						gapMinutesValue.value,
						options.defaultGapMinutes
					),
					includeServiceMessages: includeServiceMessages.value,
					includeReplies: includeReplies.value,
					includeMediaOnlyMessages: includeMediaOnlyMessages.value,
				}
			).map(mapArtifactToChunkRecord);
			chunkRecords.value = next;
			embeddingPayloads.value = [];
			embeddingResults.value = [];
			finishStep('chunk', {
				status: 'success',
				processed: next.length,
				skipped: 0,
				failed: 0,
				summary: `Собрано ${next.length} artifacts`,
				error: null,
			});
			selectedStepKey.value = 'chunk';
		} catch (error) {
			failStep('chunk', error as Error);
			screen.setMessage(
				'error',
				`Chunk step failed: ${(error as Error).message}`
			);
		}
	};

	const runEmbedStep = async (): Promise<void> => {
		markStepRunning('embed');
		try {
			if (!isVectorReady.value) {
				await loadVectorHealth();
			}
			if (!isVectorReady.value) {
				throw new Error(
					`Vector backend unavailable: ${vectorHealth.value?.error || vectorHealth.value?.status || 'unknown'}`
				);
			}

			if (chunkRecords.value.length === 0) {
				await runChunkStep();
			}

			const payloads: PipelineVectorizeRequest[] = chunkRecords.value.map(
				(chunk, index) => ({
					id: `${selectedChatId.value || 'chat'}:${chunk.chunkId}`,
					contentType: chunk.contentType,
					title: chunk.title,
					content: chunk.content,
					metadata: {
						chatId: selectedChatId.value,
						chatTitle: selectedChatLabel.value,
						pageNumber: currentPage.value,
						pageLimit: parsePositiveInt(
							pageLimitValue.value,
							options.defaultPageLimit
						),
						chunkIndex: index + 1,
						artifactId: chunk.artifact.id,
						artifactType: chunk.artifact.artifactType,
						messageIds: chunk.messageIds,
						messagePks: chunk.messagePks,
						sourceSenders: chunk.sourceSenders,
						startTimestampUtc: chunk.startTimestampUtc,
						endTimestampUtc: chunk.endTimestampUtc,
						pipeline: 'telegram-minimal-runtime',
					},
				})
			);

			embeddingPayloads.value = payloads;
			const batches = splitIntoBatches(payloads, DEFAULT_VECTOR_BATCH_SIZE);
			const responses: unknown[] = [];
			for (const batch of batches) {
				if (batch.length === 0) continue;
				responses.push(await options.transport.batchVectorize(batch));
			}
			embeddingResults.value = responses;
			finishStep('embed', {
				status: 'success',
				processed: payloads.length,
				skipped: 0,
				failed: 0,
				summary: `Отправлено ${payloads.length} чанков в ${batches.length} батчах`,
				error: null,
			});
			selectedStepKey.value = 'embed';
		} catch (error) {
			failStep('embed', error as Error);
			screen.setMessage(
				'error',
				`Embed step failed: ${(error as Error).message}`
			);
		}
	};

	const runSelectedStep = async (step: PipelineStepKey): Promise<void> => {
		if (step === 'normalize') {
			await runNormalizeStep();
			return;
		}
		if (step === 'chunk') {
			await runChunkStep();
			return;
		}
		await runEmbedStep();
	};

	const pipelineSteps = [
		{
			key: 'normalize' as const,
			title: 'Normalize',
			description: 'Преобразует сырой slice в канонические source units.',
		},
		{
			key: 'chunk' as const,
			title: 'Chunk',
			description: 'Собирает source units в dialogue-window artifacts.',
		},
		{
			key: 'embed' as const,
			title: 'Embed',
			description: 'Отправляет chunk-пакеты в vector backend.',
		},
	] as const;

	return {
		chats,
		selectedChatId,
		selectedChat,
		selectedChatMessages,
		orderedRawMessages,
		selectedChatTotal,
		selectedChatFullRange,
		pageLimitValue,
		pageNumberValue,
		chunkSizeValue,
		gapMinutesValue,
		includeServiceMessages,
		includeReplies,
		includeMediaOnlyMessages,
		selectedSelectionSnapshot,
		selectedChatLabel,
		selectedChatType,
		currentPage,
		totalPages,
		visibleRangeText,
		rawMessageCount,
		filteredMessages,
		filteredMessageCount,
		isRefreshingChats,
		isLoadingSelection,
		isRunningStep,
		vectorHealth,
		vectorHealthText,
		isVectorReady,
		selectedStepKey,
		selectedStepState,
		selectedStepTitle,
		stepStates,
		pipelineSteps,
		normalizedRecords,
		orderedNormalizedMessages,
		chunkRecords,
		orderedChunkRecords,
		embeddingPayloads,
		embeddingResults,
		sampleNormalizedRecord,
		sampleChunkRecord,
		samplePayload,
		screenMessage: screen.message,
		clearScreenMessage: screen.clearMessage,
		refreshData,
		loadSelectionSlice,
		handleChatSelection,
		handlePageSubmit,
		goToPrevPage,
		goToNextPage,
		runSelectedStep,
		runNormalizeStep,
		runChunkStep,
		runEmbedStep,
		formatDate,
		getMessageAuthorLabel,
		getMessageInitials,
		getMessageAccent,
	};
}
