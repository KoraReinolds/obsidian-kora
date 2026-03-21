/**
 * @module semantic-inspector/model/use-semantic-inspector-screen
 *
 * @description Модель фичи semantic inspector: здоровье бэкенда, записи индекса,
 * локальный baseline/diff чанков, объединённые строки списка, выбор по курсору,
 * инкрементальная синхронизация дельт и переиндексация/удаление в рамках заметки.
 */

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ChunkFileContext } from '../../chunking/ports/chunk-transport-port';
import { findChunkIndexForLine } from '../../chunking/ui/chunk-cursor';
import {
	useFilterQuery,
	useScreenMessage,
	useSelection,
} from '../../core/ui-vue';
import type {
	SemanticInspectorBackendStatus,
	SemanticInspectorNoteContext,
	SemanticInspectorRecord,
	SemanticInspectorTransportPort,
	SemanticInspectorUnifiedRow,
} from '../ports/semantic-inspector-transport-port';

export interface SemanticInspectorScreenModelOptions {
	transport: SemanticInspectorTransportPort;
	pollIntervalMs?: number;
}

const EMPTY_STATUS: SemanticInspectorBackendStatus = {
	status: 'unavailable',
	backend: null,
	collection: null,
	databasePath: null,
	qdrantUrl: null,
	embeddingModel: null,
	embeddingBaseUrl: null,
	totalPoints: 0,
	contentTypeBreakdown: {},
	error: null,
};

/**
 * @description Объединяет записи индекса и элементы отображения локальных чанков в одну строку на chunkId.
 * @param {SemanticInspectorNoteContext | null} note - Записи индекса в рамках заметки.
 * @param {ChunkFileContext | null} chunkCtx - Локальный парсинг и статус baseline.
 * @returns {SemanticInspectorUnifiedRow[]} Отсортированные объединённые строки для панели списка.
 */
function buildUnifiedRows(
	note: SemanticInspectorNoteContext | null,
	chunkCtx: ChunkFileContext | null
): SemanticInspectorUnifiedRow[] {
	const byChunk = new Map<string, SemanticInspectorUnifiedRow>();
	const recordByChunkId = new Map<string, SemanticInspectorRecord>();

	for (const r of note?.records ?? []) {
		if (!recordByChunkId.has(r.chunkId)) {
			recordByChunkId.set(r.chunkId, r);
		}
	}

	for (const item of chunkCtx?.displayItems ?? []) {
		const idx = recordByChunkId.get(item.chunkId);
		byChunk.set(item.chunkId, {
			chunkId: item.chunkId,
			localItem: item,
			indexRecord: idx ?? null,
		});
		recordByChunkId.delete(item.chunkId);
	}

	for (const [chunkId, rec] of recordByChunkId) {
		byChunk.set(chunkId, {
			chunkId,
			localItem: null,
			indexRecord: rec,
		});
	}

	return Array.from(byChunk.values()).sort((a, b) =>
		a.chunkId.localeCompare(b.chunkId)
	);
}

/**
 * @anchor <semantic_inspector_screen_model>
 *
 * @description Собирает реактивное состояние и действия для экрана semantic inspector.
 *
 * @param {SemanticInspectorScreenModelOptions} options - Зависимости фичи.
 * @returns {object} Реактивное состояние и действия для UI инспектора.
 */
export function useSemanticInspectorScreen(
	options: SemanticInspectorScreenModelOptions
) {
	const backendStatus = ref<SemanticInspectorBackendStatus>(EMPTY_STATUS);
	const noteContext = ref<SemanticInspectorNoteContext | null>(null);
	const chunkContext = ref<ChunkFileContext | null>(null);
	const isRefreshing = ref(false);
	const isRunningReindex = ref(false);
	const isRunningDelete = ref(false);
	const isSyncingDeltas = ref(false);
	const lastSignature = ref('');
	const pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 600);
	let timer: number | null = null;

	const screen = useScreenMessage();

	const records = computed<SemanticInspectorRecord[]>(
		() => noteContext.value?.records ?? []
	);

	const unifiedRows = computed(() =>
		buildUnifiedRows(noteContext.value, chunkContext.value)
	);

	const { query, filtered } = useFilterQuery(unifiedRows, row => {
		const local = row.localItem;
		const idx = row.indexRecord;
		return [
			row.chunkId,
			local?.content ?? '',
			local?.status ?? '',
			local?.chunk?.chunkType ?? '',
			(local?.chunk?.headingsPath ?? []).join(' '),
			idx?.preview ?? '',
			idx?.title ?? '',
			idx?.pointId ?? '',
			idx?.contentType ?? '',
		].join(' ');
	});

	const selection = useSelection<string>(null);

	const selectedUnifiedRow = computed<SemanticInspectorUnifiedRow | null>(
		() =>
			filtered.value.find(row => row.chunkId === selection.selected.value) ??
			null
	);

	const noteSummaryText = computed(() => {
		if (!noteContext.value && !chunkContext.value) {
			return 'Нет активной markdown-заметки';
		}
		const name =
			noteContext.value?.fileName ?? chunkContext.value?.fileName ?? '';
		return `${name} · index: ${records.value.length} · local rows: ${chunkContext.value?.displayItems.length ?? 0}`;
	});

	const breakdownChips = computed(() =>
		Object.entries(backendStatus.value.contentTypeBreakdown).map(
			([key, value]) => `${key}: ${value}`
		)
	);

	const hasActiveNote = computed(() =>
		Boolean(noteContext.value || chunkContext.value)
	);

	const hasUnifiedRows = computed(() => unifiedRows.value.length > 0);

	const changedChunkCount = computed(
		() =>
			chunkContext.value?.displayItems.filter(i => i.status !== 'unchanged')
				.length ?? 0
	);

	const isBusy = computed(
		() =>
			isRefreshing.value ||
			isRunningReindex.value ||
			isRunningDelete.value ||
			isSyncingDeltas.value
	);

	/**
	 * @description Сигнатура только по записям индекса.
	 * @param {SemanticInspectorNoteContext | null} context - Контекст заметки.
	 * @returns {string}
	 */
	const buildNoteSignature = (
		context: SemanticInspectorNoteContext | null
	): string => {
		if (!context) {
			return '';
		}
		const recordSignature = context.records
			.map(
				record => `${record.pointId}:${record.chunkId}:${record.content.length}`
			)
			.join('|');
		return `${context.filePath}:${context.originalId}:${context.records.length}:${recordSignature}`;
	};

	/**
	 * @description Сигнатура для локального контекста чанков.
	 * @param {ChunkFileContext | null} ctx - Контекст файла с чанками.
	 * @returns {string}
	 */
	const buildChunkSignature = (ctx: ChunkFileContext | null): string => {
		if (!ctx) {
			return '';
		}
		return `${ctx.filePath}:${ctx.chunks.length}:${ctx.displayItems
			.map(i => `${i.chunkId}:${i.status}`)
			.join(',')}`;
	};

	/**
	 * @description Объединённая сигнатура для дешёвого сравнения при опросе.
	 * @param {SemanticInspectorNoteContext | null} note - Контекст заметки в индексе.
	 * @param {ChunkFileContext | null} chunk - Локальный контекст чанков.
	 * @returns {string}
	 */
	const buildFullSignature = (
		note: SemanticInspectorNoteContext | null,
		chunk: ChunkFileContext | null
	): string => {
		return `${buildNoteSignature(note)}||${buildChunkSignature(chunk)}`;
	};

	/**
	 * @description Сохраняет корректность выбора строки при смене фильтра.
	 * @returns {void}
	 */
	const syncSelection = (): void => {
		if (filtered.value.length === 0) {
			selection.select(null);
			return;
		}
		if (
			selection.selected.value &&
			filtered.value.some(row => row.chunkId === selection.selected.value)
		) {
			return;
		}
		selection.select(filtered.value[0].chunkId);
	};

	/**
	 * @description Сопоставляет строку курсора редактора со строкой чанка, если возможно.
	 * @param {ChunkFileContext} ctx - Текущий контекст чанков.
	 * @returns {void}
	 */
	const syncSelectionByCursor = (ctx: ChunkFileContext): void => {
		const line = options.transport.getActiveCursorLine();
		const index = findChunkIndexForLine(ctx.chunks as any, line);
		if (index >= 0) {
			selection.select(ctx.chunks[index].chunkId);
		}
	};

	/**
	 * @description Загружает статус бэкенда, записи индекса и локальный контекст чанков.
	 * @returns {Promise<void>}
	 */
	const refresh = async (): Promise<void> => {
		isRefreshing.value = true;
		screen.clearMessage();
		try {
			const [backendResult, noteResult, chunkResult] = await Promise.allSettled(
				[
					options.transport.getBackendStatus(),
					options.transport.readCurrentNoteContext(),
					options.transport.readLocalChunkContext(),
				]
			);

			if (backendResult.status === 'fulfilled') {
				backendStatus.value = backendResult.value;
			} else {
				backendStatus.value = {
					...EMPTY_STATUS,
					status: 'error',
					error: (backendResult.reason as Error)?.message ?? 'Unknown error',
				};
			}

			if (noteResult.status === 'fulfilled') {
				noteContext.value = noteResult.value;
			} else {
				noteContext.value = null;
			}

			if (chunkResult.status === 'fulfilled') {
				chunkContext.value = chunkResult.value;
			} else {
				chunkContext.value = null;
			}

			lastSignature.value = buildFullSignature(
				noteContext.value,
				chunkContext.value
			);

			if (chunkContext.value) {
				syncSelectionByCursor(chunkContext.value);
			}

			const failures = [backendResult, noteResult, chunkResult].filter(
				r => r.status === 'rejected'
			) as PromiseRejectedResult[];
			if (failures.length > 0) {
				screen.setMessage(
					'error',
					failures
						.map(f => (f.reason as Error)?.message)
						.filter(Boolean)
						.join(' | ') || 'Не удалось обновить semantic inspector.'
				);
			}
		} finally {
			isRefreshing.value = false;
			syncSelection();
		}
	};

	/**
	 * @description Выбирает объединённую строку по chunkId.
	 * @param {string} chunkId - Идентификатор чанка из отфильтрованного списка.
	 * @returns {void}
	 */
	const selectRow = (chunkId: string): void => {
		selection.select(chunkId);
	};

	/**
	 * @description Переиндексирует текущую заметку и обновляет состояние инспектора.
	 * @returns {Promise<void>}
	 */
	const reindexCurrentNote = async (): Promise<void> => {
		if (isRunningReindex.value) return;
		isRunningReindex.value = true;
		try {
			const result = await options.transport.reindexCurrentNote();
			screen.setMessage('success', result.message);
			await refresh();
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось переиндексировать заметку: ${(error as Error).message}`
			);
		} finally {
			isRunningReindex.value = false;
		}
	};

	/**
	 * @description Удаляет проиндексированные записи для текущей заметки.
	 * @returns {Promise<void>}
	 */
	const deleteCurrentNoteRecords = async (): Promise<void> => {
		if (isRunningDelete.value) return;
		isRunningDelete.value = true;
		try {
			const result = await options.transport.deleteCurrentNoteRecords();
			screen.setMessage('success', result.message);
			await refresh();
		} catch (error) {
			screen.setMessage(
				'error',
				`Не удалось удалить записи заметки: ${(error as Error).message}`
			);
		} finally {
			isRunningDelete.value = false;
		}
	};

	/**
	 * @description Отправляет инкрементальные дельты чанков в векторный бэкенд.
	 * @returns {Promise<void>}
	 */
	const syncChunkDeltas = async (): Promise<void> => {
		if (!chunkContext.value || isSyncingDeltas.value) return;
		isSyncingDeltas.value = true;
		try {
			await options.transport.syncChunkDeltas(chunkContext.value);
			screen.setMessage('success', 'Синхронизация дельт завершена.');
			await refresh();
		} catch (error) {
			screen.setMessage(
				'error',
				`Ошибка синхронизации дельт: ${(error as Error).message}`
			);
		} finally {
			isSyncingDeltas.value = false;
		}
	};

	/**
	 * @description Опрашивает индекс заметки и локальный контекст чанков; курсор следует активному чанку.
	 * @returns {void}
	 */
	const startPolling = (): void => {
		if (timer) {
			window.clearInterval(timer);
		}
		timer = window.setInterval(async () => {
			const [note, chunk] = await Promise.all([
				options.transport.readCurrentNoteContext(),
				options.transport.readLocalChunkContext(),
			]);
			const nextSig = buildFullSignature(note, chunk);
			if (nextSig !== lastSignature.value) {
				noteContext.value = note;
				chunkContext.value = chunk;
				lastSignature.value = nextSig;
				syncSelection();
			}
			if (chunk) {
				syncSelectionByCursor(chunk);
			}
		}, pollIntervalMs);
	};

	watch(filtered, () => {
		syncSelection();
	});

	onMounted(() => {
		void refresh();
		startPolling();
	});

	onUnmounted(() => {
		if (timer) {
			window.clearInterval(timer);
			timer = null;
		}
	});

	return {
		backendStatus,
		noteContext,
		chunkContext,
		noteSummaryText,
		records,
		unifiedRows,
		filterQuery: query,
		filteredUnifiedRows: filtered,
		breakdownChips,
		selectedChunkId: selection.selected,
		selectedUnifiedRow,
		hasActiveNote,
		hasUnifiedRows,
		changedChunkCount,
		isRefreshing,
		isRunningReindex,
		isRunningDelete,
		isSyncingDeltas,
		isBusy,
		message: screen.message,
		clearMessage: screen.clearMessage,
		refresh,
		selectRow,
		syncChunkDeltas,
		reindexCurrentNote,
		deleteCurrentNoteRecords,
	};
}
