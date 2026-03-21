/**
 * @module semantic-inspector/model/use-semantic-inspector-screen
 *
 * @description Feature model for the semantic inspector debug screen.
 * It coordinates backend status, current-note lookup, list filtering, and
 * note-scoped debug actions without depending on Obsidian view lifecycle code.
 */

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
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
 * @anchor <semantic_inspector_screen_model>
 *
 * @description Builds reactive state/actions for the semantic inspector screen.
 * The model keeps runtime/backend concerns in the transport and exposes only
 * view-ready state for the list-detail Vue screen.
 *
 * @param {SemanticInspectorScreenModelOptions} options - Feature dependencies.
 * @returns {object} Reactive state and actions for the inspector UI.
 */
export function useSemanticInspectorScreen(
	options: SemanticInspectorScreenModelOptions
) {
	const backendStatus = ref<SemanticInspectorBackendStatus>(EMPTY_STATUS);
	const noteContext = ref<SemanticInspectorNoteContext | null>(null);
	const isRefreshing = ref(false);
	const isRunningReindex = ref(false);
	const isRunningDelete = ref(false);
	const lastSignature = ref('');
	const pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 600);
	let timer: number | null = null;

	const screen = useScreenMessage();
	const records = computed<SemanticInspectorRecord[]>(
		() => noteContext.value?.records ?? []
	);
	const { query, filtered } = useFilterQuery(records, record =>
		[
			record.title,
			record.chunkId,
			record.pointId,
			record.originalId,
			record.contentType,
			record.preview,
		].join(' ')
	);
	const selection = useSelection<string>(null);

	const selectedRecord = computed<SemanticInspectorRecord | null>(
		() =>
			filtered.value.find(
				record => record.pointId === selection.selected.value
			) ?? null
	);

	const noteSummaryText = computed(() => {
		if (!noteContext.value) {
			return 'Нет активной markdown-заметки';
		}
		return `${noteContext.value.fileName} · ${records.value.length} records`;
	});

	const breakdownChips = computed(() =>
		Object.entries(backendStatus.value.contentTypeBreakdown).map(
			([key, value]) => `${key}: ${value}`
		)
	);

	const hasActiveNote = computed(() => Boolean(noteContext.value));
	const hasRecords = computed(() => records.value.length > 0);
	const isBusy = computed(
		() => isRefreshing.value || isRunningReindex.value || isRunningDelete.value
	);

	/**
	 * @description Builds a lightweight signature for note-scoped inspector data.
	 * This lets the background poll update the screen only when the active note
	 * or its stored semantic records actually changed.
	 *
	 * @param {SemanticInspectorNoteContext | null} context - Current note-scoped inspector state.
	 * @returns {string} Stable signature used for cheap change detection.
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
	 * @description Ensures the selection stays valid when records/filtering change.
	 * @returns {void}
	 */
	const syncSelection = (): void => {
		if (filtered.value.length === 0) {
			selection.select(null);
			return;
		}

		if (
			selection.selected.value &&
			filtered.value.some(record => record.pointId === selection.selected.value)
		) {
			return;
		}

		selection.select(filtered.value[0].pointId);
	};

	/**
	 * @description Loads both runtime status and current-note records.
	 * Errors are surfaced through the shared status banner, while partial success
	 * still updates whichever data source completed successfully.
	 * @returns {Promise<void>}
	 */
	const refresh = async (): Promise<void> => {
		isRefreshing.value = true;
		screen.clearMessage();
		try {
			const [backendResult, noteResult] = await Promise.allSettled([
				options.transport.getBackendStatus(),
				options.transport.readCurrentNoteContext(),
			]);

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
				lastSignature.value = buildNoteSignature(noteResult.value);
			} else {
				noteContext.value = null;
				lastSignature.value = '';
			}

			if (
				backendResult.status === 'rejected' ||
				noteResult.status === 'rejected'
			) {
				const backendError =
					backendResult.status === 'rejected'
						? (backendResult.reason as Error)?.message
						: null;
				const noteError =
					noteResult.status === 'rejected'
						? (noteResult.reason as Error)?.message
						: null;

				screen.setMessage(
					'error',
					[backendError, noteError].filter(Boolean).join(' | ') ||
						'Не удалось обновить semantic inspector.'
				);
			}
		} finally {
			isRefreshing.value = false;
			syncSelection();
		}
	};

	/**
	 * @description Selects a record by backend point id.
	 * @param {string} pointId - Record identifier from the current filtered list.
	 * @returns {void}
	 */
	const selectRecord = (pointId: string): void => {
		selection.select(pointId);
	};

	/**
	 * @description Reindexes the current note and refreshes the inspector state.
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
	 * @description Deletes all indexed records for the current note and reloads state.
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
	 * @description Background poll of the current note context, mirroring the
	 * `chunks` screen pattern. Runtime health stays on manual refresh, while the
	 * note-scoped records update automatically when the active note changes.
	 *
	 * @returns {void}
	 */
	const startPolling = (): void => {
		if (timer) {
			window.clearInterval(timer);
		}

		timer = window.setInterval(async () => {
			const nextContext = await options.transport.readCurrentNoteContext();
			const nextSignature = buildNoteSignature(nextContext);

			if (nextSignature !== lastSignature.value) {
				noteContext.value = nextContext;
				lastSignature.value = nextSignature;
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
		noteSummaryText,
		records,
		filterQuery: query,
		filteredRecords: filtered,
		breakdownChips,
		selectedRecordId: selection.selected,
		selectedRecord,
		hasActiveNote,
		hasRecords,
		isRefreshing,
		isRunningReindex,
		isRunningDelete,
		isBusy,
		message: screen.message,
		clearMessage: screen.clearMessage,
		refresh,
		selectRecord,
		reindexCurrentNote,
		deleteCurrentNoteRecords,
	};
}
