/**
 * @module chunking/model/use-chunk-screen
 *
 * @description Vue model состояния chunk list экрана с инкрементальным sync и выделением по курсору.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type {
	ChunkDisplayItem,
	ChunkFileContext,
} from '../ports/chunk-transport-port';
import type { ChunkTransportPort } from '../ports/chunk-transport-port';
import { findChunkIndexForLine } from '../ui/chunk-cursor';

export interface ChunkScreenModelOptions {
	transport: ChunkTransportPort;
	pollIntervalMs?: number;
}

/**
 * @description Создает состояние/действия экрана chunk list.
 * @param {ChunkScreenModelOptions} options - Зависимости feature.
 * @returns {object} Reactive state и handlers для chunk screen.
 */
export function useChunkScreen(options: ChunkScreenModelOptions) {
	const context = ref<ChunkFileContext | null>(null);
	const isLoading = ref(false);
	const isSyncing = ref(false);
	const message = ref<{
		kind: 'neutral' | 'success' | 'error';
		text: string;
	} | null>(null);
	const selectedChunkId = ref<string | null>(null);
	const lastSignature = ref<string>('');
	const pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 600);
	let timer: number | null = null;

	const displayItems = computed<ChunkDisplayItem[]>(
		() => context.value?.displayItems || []
	);
	const hasActiveFile = computed(() => Boolean(context.value));
	const activeFileName = computed(() => context.value?.fileName || '');
	const visibleCount = computed(() => Math.min(displayItems.value.length, 50));
	const visibleItems = computed(() => displayItems.value.slice(0, 50));
	const changedCount = computed(
		() => displayItems.value.filter(item => item.status !== 'unchanged').length
	);
	const selectedChunk = computed(
		() =>
			visibleItems.value.find(item => item.chunkId === selectedChunkId.value) ||
			null
	);

	/**
	 * @description Обновляет контекст чанков для активного файла.
	 * @returns {Promise<void>}
	 */
	const refresh = async (): Promise<void> => {
		isLoading.value = true;
		try {
			const nextContext = await options.transport.readActiveChunkContext();
			context.value = nextContext;
			if (!nextContext) {
				selectedChunkId.value = null;
				lastSignature.value = '';
				return;
			}
			lastSignature.value = `${nextContext.filePath}:${nextContext.chunks.length}:${nextContext.displayItems.length}`;
			syncSelectionByCursor(nextContext);
		} catch (error) {
			message.value = {
				kind: 'error',
				text: `Не удалось загрузить чанки: ${(error as Error).message}`,
			};
		} finally {
			isLoading.value = false;
		}
	};

	/**
	 * @description Привязывает выделение к строке курсора.
	 * @param {ChunkFileContext} chunkContext - Текущий контекст файла.
	 * @returns {void}
	 */
	const syncSelectionByCursor = (chunkContext: ChunkFileContext): void => {
		const line = options.transport.getActiveCursorLine();
		const index = findChunkIndexForLine(chunkContext.chunks as any, line);
		if (index >= 0) {
			selectedChunkId.value = chunkContext.chunks[index].chunkId;
		}
	};

	/**
	 * @description Ручной выбор чанка в списке.
	 * @param {string} chunkId - chunkId выбранного элемента.
	 * @returns {void}
	 */
	const selectChunk = (chunkId: string): void => {
		selectedChunkId.value = chunkId;
	};

	/**
	 * @description Инкрементально синхронизирует изменения чанков в vector store.
	 * @returns {Promise<void>}
	 */
	const syncChunks = async (): Promise<void> => {
		if (!context.value || isSyncing.value) return;
		isSyncing.value = true;
		message.value = { kind: 'neutral', text: 'Синхронизируем чанки…' };
		try {
			await options.transport.syncContext(context.value);
			message.value = {
				kind: 'success',
				text: 'Синхронизация чанков завершена.',
			};
			await refresh();
		} catch (error) {
			message.value = {
				kind: 'error',
				text: `Ошибка синхронизации: ${(error as Error).message}`,
			};
		} finally {
			isSyncing.value = false;
		}
	};

	/**
	 * @description Background poll активного контекста и курсора.
	 * @returns {void}
	 */
	const startPolling = (): void => {
		if (timer) {
			window.clearInterval(timer);
		}
		timer = window.setInterval(async () => {
			const nextContext = await options.transport.readActiveChunkContext();
			const nextSignature = nextContext
				? `${nextContext.filePath}:${nextContext.chunks.length}:${nextContext.displayItems.length}`
				: '';
			if (nextSignature !== lastSignature.value) {
				context.value = nextContext;
				lastSignature.value = nextSignature;
			}
			if (nextContext) {
				syncSelectionByCursor(nextContext);
			}
		}, pollIntervalMs);
	};

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
		context,
		isLoading,
		isSyncing,
		message,
		hasActiveFile,
		activeFileName,
		visibleCount,
		changedCount,
		visibleItems,
		selectedChunkId,
		selectedChunk,
		refresh,
		selectChunk,
		syncChunks,
	};
}
