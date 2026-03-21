/**
 * @module chunking/adapters/obsidian-chunk-transport-adapter
 *
 * @description Адаптер Obsidian и VectorBridge для Vue-экранов chunking.
 */
import { App, MarkdownView, TFile } from 'obsidian';
import { chunkNote, type Chunk } from '..';
import { getMarkdownFiles } from '../../obsidian';
import type { VectorBridge, VectorSearchOptionsProvider } from '../../vector';
import { loadBaselineForChunksByOriginalId } from '../ui/chunk-compare';
import type {
	ChunkDisplayItem,
	ChunkFileContext,
	ChunkTransportPort,
	RelatedChunkResult,
	UnsyncedNoteRef,
} from '../ports/chunk-transport-port';

/**
 * @description Сравнение путей vault без учёта `\` vs `/` (Windows).
 * @param {string} a - Путь из контекста редактора.
 * @param {string} b - Путь из payload индекса.
 * @returns {boolean} Совпадение после нормализации.
 */
function vaultPathsEqual(a: string, b: string): boolean {
	if (!a || !b) return false;
	const norm = (p: string) => p.replace(/\\/g, '/');
	return norm(a) === norm(b);
}

/**
 * @description Адаптер инфраструктуры Obsidian и vector backend к feature-порту.
 */
export class ObsidianChunkTransportAdapter implements ChunkTransportPort {
	private lastMarkdownFilePath: string | null = null;

	constructor(
		private readonly app: App,
		private readonly vectorBridge: VectorBridge,
		private readonly getVectorSearchOptions?: VectorSearchOptionsProvider
	) {}

	/**
	 * @description Читает активный markdown файл и возвращает контекст для chunking UI.
	 * @returns {Promise<ChunkFileContext | null>} Контекст или null, если активный файл не markdown.
	 */
	async readActiveChunkContext(): Promise<ChunkFileContext | null> {
		const activeFile = this.app.workspace.getActiveFile();
		if (
			activeFile &&
			activeFile instanceof TFile &&
			activeFile.extension === 'md'
		) {
			this.lastMarkdownFilePath = activeFile.path;
		}

		const file =
			activeFile && activeFile instanceof TFile && activeFile.extension === 'md'
				? activeFile
				: this.lastMarkdownFilePath
					? (this.app.vault.getAbstractFileByPath(
							this.lastMarkdownFilePath
						) as TFile)
					: null;
		if (!file || !(file instanceof TFile) || file.extension !== 'md') {
			return null;
		}
		const content = await this.app.vault.read(file);
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter || {};
		const tags = Array.isArray(fm?.tags) ? fm.tags : [];
		const aliases = Array.isArray(fm?.aliases) ? fm.aliases : [];
		const originalId = this.getCreatedRawFromFrontmatter(fm);

		const chunks: Chunk[] = chunkNote(
			content,
			{
				notePath: file.path,
				originalId,
				frontmatter: fm,
				tags,
				aliases,
			},
			{},
			cache as any
		);

		let baselineByChunkId = new Map<string, string>();
		let statusByChunkId = new Map<
			string,
			'new' | 'deleted' | 'modified' | 'unchanged'
		>();
		try {
			const baseline = await loadBaselineForChunksByOriginalId(
				this.vectorBridge,
				originalId,
				chunks
			);
			baselineByChunkId = baseline.baselineByChunkId;
			statusByChunkId = baseline.statusByChunkId;
		} catch {
			// Keep chunk list usable even when vector backend is temporarily unavailable.
			for (const chunk of chunks) {
				statusByChunkId.set(chunk.chunkId, 'new');
			}
		}

		const displayItems: ChunkDisplayItem[] = chunks.map(chunk => ({
			chunkId: chunk.chunkId,
			status: statusByChunkId.get(chunk.chunkId) || 'new',
			content: chunk.contentRaw || '',
			previousContent: baselineByChunkId.get(chunk.chunkId) || '',
			chunk,
		}));

		for (const [chunkId, previousContent] of Array.from(
			baselineByChunkId.entries()
		)) {
			if (statusByChunkId.get(chunkId) === 'deleted') {
				displayItems.push({
					chunkId,
					status: 'deleted',
					content: previousContent,
					previousContent,
					chunk: null,
				});
			}
		}

		return {
			filePath: file.path,
			fileName: file.basename,
			originalId,
			chunks,
			displayItems,
		};
	}

	/**
	 * @description Возвращает текущую строку курсора в markdown editor.
	 * @returns {number} 0-based line или -1 если курсор недоступен.
	 */
	getActiveCursorLine(): number {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.editor.getCursor().line ?? -1;
	}

	/**
	 * @description Инкрементальная синхронизация чанков текущей заметки.
	 * @param {ChunkFileContext} context - Контекст файла для синхронизации.
	 * @returns {Promise<void>}
	 */
	async syncContext(context: ChunkFileContext): Promise<void> {
		const cache = this.app.metadataCache.getFileCache(
			this.app.vault.getAbstractFileByPath(context.filePath) as TFile
		);
		const file = this.app.vault.getAbstractFileByPath(
			context.filePath
		) as TFile;
		if (!file) {
			return;
		}
		const content = await this.app.vault.read(file);
		const fm = cache?.frontmatter || {};
		const tags = Array.isArray(fm?.tags) ? fm.tags : [];
		const aliases = Array.isArray(fm?.aliases) ? fm.aliases : [];
		const chunks: Chunk[] = chunkNote(
			content,
			{
				notePath: file.path,
				originalId: context.originalId,
				frontmatter: fm,
				tags,
				aliases,
			},
			{},
			cache as any
		);

		const { baselineByChunkId, statusByChunkId, storedPointIdByChunkId } =
			await loadBaselineForChunksByOriginalId(
				this.vectorBridge,
				context.originalId,
				chunks
			);

		const chunksToVectorize: Array<Record<string, unknown>> = [];
		const pointIdsToDelete: string[] = [];

		for (const chunk of chunks) {
			const status = statusByChunkId.get(chunk.chunkId);
			if (status === 'new' || status === 'modified') {
				chunksToVectorize.push({
					id: `${context.originalId}#${chunk.chunkId}`,
					contentType: 'obsidian_note',
					title: context.fileName,
					content: chunk.contentRaw,
					metadata: chunk.meta,
				});
			}
		}

		for (const [chunkId] of Array.from(baselineByChunkId.entries())) {
			if (statusByChunkId.get(chunkId) === 'deleted') {
				const storedPointId = storedPointIdByChunkId.get(chunkId);
				if (storedPointId) {
					pointIdsToDelete.push(storedPointId);
				}
			}
		}

		const vectorizePromise =
			chunksToVectorize.length > 0
				? this.vectorBridge.batchVectorize(chunksToVectorize as any)
				: Promise.resolve();
		const deletePromise =
			pointIdsToDelete.length > 0
				? this.vectorBridge.batchDelete(pointIdsToDelete)
				: Promise.resolve();

		await Promise.all([vectorizePromise, deletePromise]);
	}

	/**
	 * @description Проверяет доступность vector сервиса.
	 * @returns {Promise<boolean>}
	 */
	async isVectorHealthy(): Promise<boolean> {
		return this.vectorBridge.isVectorServiceHealthy();
	}

	/**
	 * @description Ищет связанные чанки через vector similarity.
	 * @param {string} query - Текст текущего чанка.
	 * @param {{ chunkId?: string; originalId?: string; filePath?: string }} exclude -
	 * Исключение текущего чанка и всей заметки: по chunkId, originalId, префиксу point id
	 * (`originalId#chunkId` на сервере) и пути `obsidian.path`.
	 * @returns {Promise<RelatedChunkResult[]>}
	 */
	async searchRelated(
		query: string,
		exclude: { chunkId?: string; originalId?: string; filePath?: string }
	): Promise<RelatedChunkResult[]> {
		const searchOpts = this.getVectorSearchOptions?.() ?? {
			scoreThreshold: 0.3,
			lexicalBoostWeight: 0.15,
		};
		const searchResults = await this.vectorBridge.searchContent({
			query,
			limit: 15,
			contentTypes: ['obsidian_note'],
			scoreThreshold: searchOpts.scoreThreshold,
			lexicalBoostWeight: searchOpts.lexicalBoostWeight,
		});

		return searchResults.results
			.filter(result => {
				const content = result.content || {};
				const resultChunkId = content.chunkId;
				const resultOriginalId = content.originalId || content.meta?.originalId;
				const resultPath =
					content.obsidian?.path || content.meta?.obsidian?.path || '';
				const pointId = typeof result.id === 'string' ? result.id : '';

				if (exclude.chunkId && resultChunkId === exclude.chunkId) return false;

				if (exclude.originalId) {
					if (resultOriginalId === exclude.originalId) return false;
					if (pointId.startsWith(`${exclude.originalId}#`)) return false;
				}

				if (
					exclude.filePath &&
					resultPath &&
					vaultPathsEqual(exclude.filePath, resultPath)
				) {
					return false;
				}

				return true;
			})
			.map(result => {
				const content = result.content ?? {};
				const sourceFile =
					content.obsidian?.path || content.meta?.obsidian?.path || '';
				return {
					chunkId: content.chunkId,
					chunkType: content.chunkType || 'paragraph',
					headingsPath: content.headingsPath || [],
					contentRaw: content.content || content.contentRaw || '',
					score: result.score,
					sourceFile,
					position: content.position,
				} as RelatedChunkResult;
			})
			.filter(item => Boolean(item.chunkId && item.sourceFile))
			.slice(0, 5);
	}

	/**
	 * @description Открывает файл и переводит курсор в позицию related чанка.
	 * @param {RelatedChunkResult} result - Результат similarity.
	 * @returns {Promise<void>}
	 */
	async openRelatedChunk(result: RelatedChunkResult): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(result.sourceFile);
		if (!file || !(file instanceof TFile)) return;

		const leaf = this.app.workspace.getUnpinnedLeaf();
		if (!leaf) return;
		await leaf.openFile(file);

		const view = leaf.view;
		if (view && 'editor' in view) {
			const editor = (view as any).editor;
			const line = result.position?.start?.line ?? 0;
			if (editor && editor.setCursor) {
				editor.setCursor(line, 0);
				editor.scrollIntoView({
					from: { line, ch: 0 },
					to: { line, ch: 0 },
				});
			}
		}
	}

	/**
	 * @description Возвращает заметки из /Organize, еще не векторизованные.
	 * @param {number} limit - Максимум файлов в ответе.
	 * @returns {Promise<UnsyncedNoteRef[]>}
	 */
	async getUnsyncedNotes(limit: number): Promise<UnsyncedNoteRef[]> {
		const organizeFiles = getMarkdownFiles(this.app, {
			include: ['Organize/**'],
			exclude: ['Organize/Output/**', 'Organize/Input/**', 'Organize/Maps/**'],
		});

		const vectorizedContent = await this.vectorBridge.getContentBy({
			by: 'contentType',
			value: 'obsidian_note',
			multiple: true,
			limit: 10000,
		});
		if (!Array.isArray(vectorizedContent)) return [];

		const existingOriginalIds = new Set<string>();
		for (const item of vectorizedContent) {
			const originalId =
				item.payload?.originalId || item.payload?.meta?.originalId;
			if (originalId) {
				existingOriginalIds.add(String(originalId));
			}
		}

		const unsynced: UnsyncedNoteRef[] = [];
		for (const file of organizeFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter || {};
			try {
				const originalId = this.getCreatedRawFromFrontmatter(fm);
				if (!existingOriginalIds.has(originalId)) {
					unsynced.push({ path: file.path, basename: file.basename });
				}
			} catch {
				continue;
			}
		}
		return unsynced.slice(0, Math.max(1, limit));
	}

	/**
	 * @description Извлекает стабильный originalId из frontmatter.
	 * @param {Record<string, unknown>} fm - Frontmatter заметки.
	 * @returns {string} Строковое значение даты создания.
	 */
	private getCreatedRawFromFrontmatter(fm: Record<string, unknown>): string {
		const created = fm['date created'];
		if (!created) {
			throw new Error('Note has no creation time');
		}
		return String(created);
	}
}
