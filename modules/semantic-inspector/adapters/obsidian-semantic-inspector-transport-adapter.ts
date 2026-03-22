/**
 * @module semantic-inspector/adapters/obsidian-semantic-inspector-transport-adapter
 *
 * @description Транспортный адаптер под Obsidian для semantic inspector.
 * Определяет текущую markdown-заметку, выводит `originalId` из frontmatter
 * и запрашивает рантайм семантический бэкенд через {@link VectorBridge}.
 */

import { App, MarkdownView, TFile } from 'obsidian';
import { ObsidianChunkTransportAdapter } from '../../chunking/adapters/obsidian-chunk-transport-adapter';
import type { ChunkFileContext } from '../../chunking/ports/chunk-transport-port';
import type {
	VectorHealthResponse,
	VectorStoredContentRecord,
} from '../../vector';
import type { VectorSearchOptionsProvider } from '../../vector';
import { VectorBridge } from '../../vector';
import type {
	SemanticInspectorActionResult,
	SemanticInspectorBackendStatus,
	SemanticInspectorNoteContext,
	SemanticInspectorRecord,
	SemanticInspectorTransportPort,
} from '../ports/semantic-inspector-transport-port';

interface ActiveNoteDescriptor {
	filePath: string;
	fileName: string;
	originalId: string;
	cache: Record<string, unknown>;
	content: string;
}

/**
 * @anchor <semantic_inspector_adapter>
 *
 * @description Разрешает семантическую диагностику текущей заметки для инспектора
 * без протекания API Obsidian в слой Vue-фичи.
 */
export class ObsidianSemanticInspectorTransportAdapter
	implements SemanticInspectorTransportPort
{
	private lastMarkdownFilePath: string | null = null;
	private readonly chunkAdapter: ObsidianChunkTransportAdapter;

	constructor(
		private readonly app: App,
		private readonly vectorBridge: VectorBridge,
		getVectorSearchOptions?: VectorSearchOptionsProvider
	) {
		this.chunkAdapter = new ObsidianChunkTransportAdapter(
			app,
			vectorBridge,
			getVectorSearchOptions
		);
	}

	/**
	 * @async
	 * @description Делегирует в {@link ObsidianChunkTransportAdapter.readActiveChunkContext}.
	 * @returns {Promise<ChunkFileContext | null>}
	 */
	async readLocalChunkContext(): Promise<ChunkFileContext | null> {
		return this.chunkAdapter.readActiveChunkContext();
	}

	/**
	 * @description Делегирует в {@link ObsidianChunkTransportAdapter.getActiveCursorLine}.
	 * @returns {number}
	 */
	getActiveCursorLine(): number {
		return this.chunkAdapter.getActiveCursorLine();
	}

	/**
	 * @async
	 * @description Делегирует в {@link ObsidianChunkTransportAdapter.syncContext}.
	 * @param {ChunkFileContext} context - Актуальный контекст чанков для синхронизации дельт.
	 * @returns {Promise<void>}
	 */
	async syncChunkDeltas(context: ChunkFileContext): Promise<void> {
		return this.chunkAdapter.syncContext(context);
	}

	/**
	 * @async
	 * @description Загружает записи семантического индекса для текущей markdown-заметки.
	 * @returns {Promise<SemanticInspectorNoteContext | null>} Семантический контекст заметки или `null`, если нет заметки для инспекции.
	 */
	async readCurrentNoteContext(): Promise<SemanticInspectorNoteContext | null> {
		const activeNote = await this.resolveActiveNoteDescriptor();
		if (!activeNote) {
			return null;
		}

		const stored = await this.vectorBridge.getContentBy({
			by: 'originalId',
			value: activeNote.originalId,
			multiple: true,
			limit: 5000,
		});

		const records = Array.isArray(stored)
			? stored
					.map(item => this.normalizeRecord(item, activeNote.originalId))
					.sort((left, right) => left.chunkId.localeCompare(right.chunkId))
			: [];

		return {
			filePath: activeNote.filePath,
			fileName: activeNote.fileName,
			originalId: activeNote.originalId,
			records,
		};
	}

	/**
	 * @async
	 * @description Читает полное состояние здоровья бэкенда у рантайм векторного сервиса.
	 * @returns {Promise<SemanticInspectorBackendStatus>} Нормализованный статус рантайм-бэкенда.
	 */
	async getBackendStatus(): Promise<SemanticInspectorBackendStatus> {
		const health = await this.vectorBridge.getVectorHealthDetails();
		return this.normalizeBackendStatus(health);
	}

	/**
	 * @async
	 * @description Переиндексирует текущую заметку через общий пайплайн векторизации.
	 * @returns {Promise<SemanticInspectorActionResult>} Сводка завершённой переиндексации.
	 */
	async reindexCurrentNote(): Promise<SemanticInspectorActionResult> {
		const activeNote = await this.resolveActiveNoteDescriptor();
		if (!activeNote) {
			throw new Error('Нет активной markdown-заметки для переиндексации.');
		}

		const result = await this.vectorBridge.vectorizeNote({
			originalId: activeNote.originalId,
			path: activeNote.filePath,
			content: activeNote.content,
			title: activeNote.fileName,
			metadata: activeNote.cache,
			cache: activeNote.cache,
		});

		const affectedCount = this.countVectorizeResult(result);
		return {
			affectedCount,
			message:
				affectedCount > 0
					? `Переиндексация завершена: ${affectedCount} записей обновлено.`
					: 'Переиндексация завершена.',
		};
	}

	/**
	 * @async
	 * @description Удаляет строки семантического индекса для текущей заметки по `originalId`.
	 * @returns {Promise<SemanticInspectorActionResult>} Сводка действия удаления.
	 */
	async deleteCurrentNoteRecords(): Promise<SemanticInspectorActionResult> {
		const activeNote = await this.resolveActiveNoteDescriptor();
		if (!activeNote) {
			throw new Error('Нет активной markdown-заметки для удаления из индекса.');
		}

		const affectedCount = await this.vectorBridge.deleteByOriginalId(
			activeNote.originalId
		);

		return {
			affectedCount,
			message:
				affectedCount > 0
					? `Удалено ${affectedCount} записей для текущей заметки.`
					: 'Для текущей заметки в индексе ничего не найдено.',
		};
	}

	/**
	 * @async
	 * @description Определяет текущую markdown-заметку и готовит все поля
	 * для поиска, переиндексации и удаления.
	 * @returns {Promise<ActiveNoteDescriptor | null>} Дескриптор заметки или `null`, если нет подходящей markdown-заметки.
	 */
	private async resolveActiveNoteDescriptor(): Promise<ActiveNoteDescriptor | null> {
		const file = this.resolveActiveMarkdownFile();
		if (!file) {
			return null;
		}

		const rawCache = this.app.metadataCache.getFileCache(file);
		const cache = (rawCache ?? {}) as Record<string, unknown>;
		const frontmatter = this.readFrontmatter(cache);
		const originalId = this.getCreatedRawFromFrontmatter(frontmatter);
		const content = await this.app.vault.read(file);

		return {
			filePath: file.path,
			fileName: file.basename,
			originalId,
			cache,
			content,
		};
	}

	/**
	 * @description Находит markdown-заметку, которую нужно инспектировать.
	 * Инспектор может стать активным листом, поэтому адаптер сначала проверяет
	 * активный файл, затем любой открытый markdown-лист или последний известный путь.
	 * @returns {TFile | null} Кандидат-заметка или `null`.
	 */
	private resolveActiveMarkdownFile(): TFile | null {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile instanceof TFile && activeFile.extension === 'md') {
			this.lastMarkdownFilePath = activeFile.path;
			return activeFile;
		}

		const activeMarkdownView =
			this.app.workspace.getActiveViewOfType(MarkdownView);
		const viewFile = activeMarkdownView?.file;
		if (viewFile instanceof TFile && viewFile.extension === 'md') {
			this.lastMarkdownFilePath = viewFile.path;
			return viewFile;
		}

		const openMarkdownFile = this.app.workspace
			.getLeavesOfType('markdown')
			.map(leaf => (leaf.view as MarkdownView).file)
			.find(file => file instanceof TFile && file.extension === 'md');
		if (openMarkdownFile instanceof TFile) {
			this.lastMarkdownFilePath = openMarkdownFile.path;
			return openMarkdownFile;
		}

		if (this.lastMarkdownFilePath) {
			const fallback = this.app.vault.getAbstractFileByPath(
				this.lastMarkdownFilePath
			);
			if (fallback instanceof TFile && fallback.extension === 'md') {
				return fallback;
			}
		}

		return null;
	}

	/**
	 * @description Извлекает объект frontmatter из кэша метаданных Obsidian.
	 * @param {Record<string, unknown>} cache - Кэш метаданных от Obsidian.
	 * @returns {Record<string, unknown>} Простой объект frontmatter.
	 */
	private readFrontmatter(
		cache: Record<string, unknown>
	): Record<string, unknown> {
		const frontmatter = cache.frontmatter;
		return frontmatter && typeof frontmatter === 'object'
			? (frontmatter as Record<string, unknown>)
			: {};
	}

	/**
	 * @description Нормализует payload бэкенда в удобные для UI семантические записи.
	 * @param {VectorStoredContentRecord} item - Сырая запись из `/content`.
	 * @param {string} fallbackOriginalId - Стабильный идентификатор заметки из frontmatter.
	 * @returns {SemanticInspectorRecord} Нормализованная запись для UI инспектора.
	 */
	private normalizeRecord(
		item: VectorStoredContentRecord,
		fallbackOriginalId: string
	): SemanticInspectorRecord {
		const payload = this.ensureObject(item.payload);
		const metadata = this.readPayloadMetadata(payload);
		const content = this.readPayloadContent(payload);
		const title = this.readPayloadTitle(payload);
		const chunkId = this.readString(
			payload.chunkId,
			metadata.chunkId,
			metadata['chunk_id']
		);
		const originalId = this.readString(
			payload.originalId,
			metadata.originalId,
			metadata['original_id']
		);
		const contentType = this.readString(payload.contentType, payload.type);

		return {
			pointId: String(item.qdrantId ?? ''),
			originalId: originalId || fallbackOriginalId,
			chunkId: chunkId || 'unknown',
			contentType: contentType || 'unknown',
			title: title || 'Untitled record',
			content,
			preview: this.toPreview(content),
			metadata,
			payload,
		};
	}

	/**
	 * @description Преобразует сырой payload здоровья рантайма в стабильное состояние инспектора.
	 * @param {VectorHealthResponse} health - Сырой ответ `/vector_health`.
	 * @returns {SemanticInspectorBackendStatus} Нормализованный статус бэкенда для заголовка экрана.
	 */
	private normalizeBackendStatus(
		health: VectorHealthResponse
	): SemanticInspectorBackendStatus {
		const stats =
			health.stats && typeof health.stats === 'object' ? health.stats : null;

		return {
			status: health.status ?? 'error',
			backend: health.backend ?? stats?.backend ?? null,
			databasePath: health.databasePath ?? stats?.databasePath ?? null,
			embeddingModel: health.embeddingModel ?? null,
			embeddingBaseUrl: health.embeddingBaseUrl ?? null,
			totalPoints:
				typeof stats?.totalPoints === 'number' ? stats.totalPoints : 0,
			contentTypeBreakdown:
				stats?.contentTypeBreakdown &&
				typeof stats.contentTypeBreakdown === 'object'
					? stats.contentTypeBreakdown
					: {},
			error: health.error ?? null,
		};
	}

	/**
	 * @description Оценивает число обновлённых записей по ответам vectorize.
	 * @param {unknown} result - Сырой ответ endpoint vectorize.
	 * @returns {number} Число затронутых записей, если его можно вывести.
	 */
	private countVectorizeResult(result: unknown): number {
		if (!result || typeof result !== 'object') {
			return 0;
		}

		const candidate = result as Record<string, unknown>;
		if (typeof candidate.processed === 'number') {
			return candidate.processed;
		}

		if (Array.isArray(candidate.results)) {
			return candidate.results.length;
		}

		if (candidate.id || candidate.qdrantId || candidate.pointId) {
			return 1;
		}

		return 0;
	}

	/**
	 * @description Читает стабильный идентификатор заметки из frontmatter.
	 * @param {Record<string, unknown>} fm - Объект frontmatter.
	 * @returns {string} Значение originalId в поле `date created`.
	 */
	private getCreatedRawFromFrontmatter(fm: Record<string, unknown>): string {
		const created = fm['date created'];
		if (!created) {
			throw new Error('Note has no creation time in frontmatter.');
		}
		return String(created);
	}

	/**
	 * @description Возвращает первую непустую строку-кандидат.
	 * @param {...unknown[]} candidates - Возможные скалярные значения.
	 * @returns {string} Первая непустая нормализованная строка или пустая строка.
	 */
	private readString(...candidates: unknown[]): string {
		for (const candidate of candidates) {
			if (typeof candidate === 'string' && candidate.trim()) {
				return candidate.trim();
			}
			if (
				typeof candidate === 'number' ||
				typeof candidate === 'boolean' ||
				candidate instanceof Date
			) {
				return String(candidate);
			}
		}
		return '';
	}

	/**
	 * @description Приводит значение payload к простому объекту для безопасного доступа к полям.
	 * @param {unknown} value - Произвольное значение payload из ответа бэкенда.
	 * @returns {Record<string, unknown>} Простой объект или пустой объект по умолчанию.
	 */
	private ensureObject(value: unknown): Record<string, unknown> {
		return value && typeof value === 'object'
			? (value as Record<string, unknown>)
			: {};
	}

	/**
	 * @description Извлекает вложенные метаданные из payload бэкенда, сохраняя сырой объект.
	 * @param {Record<string, unknown>} payload - Сырой payload бэкенда.
	 * @returns {Record<string, unknown>} Вложенный объект `metadata`/`meta` или пустой объект.
	 */
	private readPayloadMetadata(
		payload: Record<string, unknown>
	): Record<string, unknown> {
		return this.ensureObject(payload.metadata ?? payload.meta);
	}

	/**
	 * @description Извлекает человекочитаемое тело контента из payload бэкенда.
	 * @param {Record<string, unknown>} payload - Сырой payload бэкенда.
	 * @returns {string} Сохранённое тело контента или пустая строка.
	 */
	private readPayloadContent(payload: Record<string, unknown>): string {
		return this.readString(payload.content, payload.contentRaw, payload.text);
	}

	/**
	 * @description Извлекает заголовок записи из payload бэкенда.
	 * @param {Record<string, unknown>} payload - Сырой payload бэкенда.
	 * @returns {string} Человекочитаемый заголовок или пустая строка.
	 */
	private readPayloadTitle(payload: Record<string, unknown>): string {
		const metadata = this.readPayloadMetadata(payload);
		const obsidian = this.ensureObject(metadata.obsidian);
		return this.readString(
			payload.title,
			metadata.title,
			obsidian.fileName,
			payload.chunkId
		);
	}

	/**
	 * @description Собирает компактное превью для строк списка, не скрывая сырой контент в деталях.
	 * @param {string} content - Полный контент записи.
	 * @returns {string} Однострочная строка превью.
	 */
	private toPreview(content: string): string {
		const normalized = content.replace(/\s+/g, ' ').trim();
		if (!normalized) {
			return 'Пустой контент';
		}
		return normalized.length > 180
			? `${normalized.slice(0, 177).trimEnd()}...`
			: normalized;
	}
}
