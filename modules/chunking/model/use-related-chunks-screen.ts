/**
 * @module chunking/model/use-related-chunks-screen
 *
 * @description Vue model для related chunks по активному чанку.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type {
	ChunkFileContext,
	RelatedChunkResult,
	UnsyncedNoteRef,
} from '../ports/chunk-transport-port';
import type { ChunkTransportPort } from '../ports/chunk-transport-port';
import { findChunkIndexForLine } from '../ui/chunk-cursor';

export interface RelatedChunksScreenModelOptions {
	transport: ChunkTransportPort;
	pollIntervalMs?: number;
}

/**
 * @description Создает state/actions для related chunks экрана.
 * @param {RelatedChunksScreenModelOptions} options - Зависимости feature.
 * @returns {object} Reactive state и handlers.
 */
export function useRelatedChunksScreen(
	options: RelatedChunksScreenModelOptions
) {
	const context = ref<ChunkFileContext | null>(null);
	const relatedChunks = ref<RelatedChunkResult[]>([]);
	const unsyncedNotes = ref<UnsyncedNoteRef[]>([]);
	const activeChunkId = ref<string | null>(null);
	const isLoading = ref(false);
	const isLoadingRelated = ref(false);
	const message = ref<{
		kind: 'neutral' | 'success' | 'error' | 'warning';
		text: string;
	} | null>(null);
	const pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 700);
	let timer: number | null = null;

	const activeChunk = computed(() => {
		if (!context.value || !activeChunkId.value) return null;
		return (
			context.value.chunks.find(
				chunk => chunk.chunkId === activeChunkId.value
			) || null
		);
	});

	/**
	 * @description Загружает контекст активного файла и unsynced notes.
	 * @returns {Promise<void>}
	 */
	const refreshContext = async (): Promise<void> => {
		isLoading.value = true;
		try {
			context.value = await options.transport.readActiveChunkContext();
			unsyncedNotes.value = await options.transport.getUnsyncedNotes(20);
			await syncByCursor();
		} catch (error) {
			message.value = {
				kind: 'error',
				text: `Не удалось загрузить related контекст: ${(error as Error).message}`,
			};
		} finally {
			isLoading.value = false;
		}
	};

	/**
	 * @description Обновляет активный чанк по текущей позиции курсора.
	 * @returns {Promise<void>}
	 */
	const syncByCursor = async (): Promise<void> => {
		if (!context.value) {
			activeChunkId.value = null;
			relatedChunks.value = [];
			return;
		}
		const line = options.transport.getActiveCursorLine();
		const index = findChunkIndexForLine(context.value.chunks as any, line);
		if (index < 0) return;
		const nextChunkId = context.value.chunks[index].chunkId;
		if (nextChunkId === activeChunkId.value) return;
		activeChunkId.value = nextChunkId;
		await loadRelated();
	};

	/**
	 * @description Загружает список похожих чанков для активного.
	 * @returns {Promise<void>}
	 */
	const loadRelated = async (): Promise<void> => {
		if (!activeChunk.value || !context.value) return;
		isLoadingRelated.value = true;
		try {
			const healthy = await options.transport.isVectorHealthy();
			if (!healthy) {
				message.value = {
					kind: 'warning',
					text: 'Vector service unavailable. Запустите gramjs-server с Qdrant/OpenAI.',
				};
				relatedChunks.value = [];
				return;
			}
			relatedChunks.value = await options.transport.searchRelated(
				activeChunk.value.contentRaw || '',
				{
					chunkId: activeChunk.value.chunkId,
					originalId: context.value.originalId,
					filePath: context.value.filePath,
				}
			);
		} catch (error) {
			message.value = {
				kind: 'error',
				text: `Не удалось загрузить related chunks: ${(error as Error).message}`,
			};
			relatedChunks.value = [];
		} finally {
			isLoadingRelated.value = false;
		}
	};

	/**
	 * @description Открывает найденный related chunk в редакторе.
	 * @param {RelatedChunkResult} result - Выбранный related chunk.
	 * @returns {Promise<void>}
	 */
	const openRelated = async (result: RelatedChunkResult): Promise<void> => {
		await options.transport.openRelatedChunk(result);
	};

	const startPolling = (): void => {
		if (timer) window.clearInterval(timer);
		timer = window.setInterval(() => {
			void syncByCursor();
		}, pollIntervalMs);
	};

	onMounted(() => {
		void refreshContext();
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
		relatedChunks,
		unsyncedNotes,
		activeChunkId,
		activeChunk,
		isLoading,
		isLoadingRelated,
		message,
		refreshContext,
		loadRelated,
		openRelated,
	};
}
