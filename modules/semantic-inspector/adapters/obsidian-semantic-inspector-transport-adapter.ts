/**
 * @module semantic-inspector/adapters/obsidian-semantic-inspector-transport-adapter
 *
 * @description Obsidian-specific transport adapter for the semantic inspector.
 * It resolves the current markdown note, derives `originalId` from frontmatter,
 * and queries the runtime semantic backend through {@link VectorBridge}.
 */

import { App, MarkdownView, TFile } from 'obsidian';
import { ObsidianChunkTransportAdapter } from '../../chunking/adapters/obsidian-chunk-transport-adapter';
import type { ChunkFileContext } from '../../chunking/ports/chunk-transport-port';
import type {
	VectorHealthResponse,
	VectorStoredContentRecord,
} from '../../vector';
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
 * @description Resolves current-note semantic diagnostics for the inspector
 * without leaking Obsidian APIs into the Vue feature layer.
 */
export class ObsidianSemanticInspectorTransportAdapter
	implements SemanticInspectorTransportPort
{
	private lastMarkdownFilePath: string | null = null;
	private readonly chunkAdapter: ObsidianChunkTransportAdapter;

	constructor(
		private readonly app: App,
		private readonly vectorBridge: VectorBridge
	) {
		this.chunkAdapter = new ObsidianChunkTransportAdapter(app, vectorBridge);
	}

	/**
	 * @async
	 * @description Delegates to {@link ObsidianChunkTransportAdapter.readActiveChunkContext}.
	 * @returns {Promise<ChunkFileContext | null>}
	 */
	async readLocalChunkContext(): Promise<ChunkFileContext | null> {
		return this.chunkAdapter.readActiveChunkContext();
	}

	/**
	 * @description Delegates to {@link ObsidianChunkTransportAdapter.getActiveCursorLine}.
	 * @returns {number}
	 */
	getActiveCursorLine(): number {
		return this.chunkAdapter.getActiveCursorLine();
	}

	/**
	 * @async
	 * @description Delegates to {@link ObsidianChunkTransportAdapter.syncContext}.
	 * @param {ChunkFileContext} context - Latest chunk context for delta sync.
	 * @returns {Promise<void>}
	 */
	async syncChunkDeltas(context: ChunkFileContext): Promise<void> {
		return this.chunkAdapter.syncContext(context);
	}

	/**
	 * @async
	 * @description Loads semantic index records for the current markdown note.
	 * @returns {Promise<SemanticInspectorNoteContext | null>} Note-scoped semantic context or `null` if there is no inspectable note.
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
	 * @description Reads full backend health state from the runtime vector service.
	 * @returns {Promise<SemanticInspectorBackendStatus>} Normalized runtime backend status.
	 */
	async getBackendStatus(): Promise<SemanticInspectorBackendStatus> {
		const health = await this.vectorBridge.getVectorHealthDetails();
		return this.normalizeBackendStatus(health);
	}

	/**
	 * @async
	 * @description Reindexes the current note via the shared vectorization pipeline.
	 * @returns {Promise<SemanticInspectorActionResult>} Summary of the completed reindex action.
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
	 * @description Deletes semantic index rows for the current note by `originalId`.
	 * @returns {Promise<SemanticInspectorActionResult>} Summary of the delete action.
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
	 * @description Resolves the current markdown note and prepares all fields
	 * needed for lookup/reindex/delete operations.
	 * @returns {Promise<ActiveNoteDescriptor | null>} Prepared note descriptor or `null` when there is no suitable markdown note.
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
	 * @description Finds the markdown note that should be inspected.
	 * The inspector can become the active leaf, so the adapter first checks the
	 * active file and then falls back to any open markdown leaf or the last seen path.
	 * @returns {TFile | null} Candidate markdown note or `null`.
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
	 * @description Extracts frontmatter object from an Obsidian metadata cache.
	 * @param {Record<string, unknown>} cache - Metadata cache returned by Obsidian.
	 * @returns {Record<string, unknown>} Plain frontmatter object.
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
	 * @description Normalizes backend payloads into view-friendly semantic records.
	 * @param {VectorStoredContentRecord} item - Raw record from `/content`.
	 * @param {string} fallbackOriginalId - Stable note identifier resolved from frontmatter.
	 * @returns {SemanticInspectorRecord} Normalized record for the inspector UI.
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
	 * @description Converts raw runtime health payload into stable inspector state.
	 * @param {VectorHealthResponse} health - Raw response from `/vector_health`.
	 * @returns {SemanticInspectorBackendStatus} Normalized backend status for the screen header.
	 */
	private normalizeBackendStatus(
		health: VectorHealthResponse
	): SemanticInspectorBackendStatus {
		const stats =
			health.stats && typeof health.stats === 'object' ? health.stats : null;

		return {
			status: health.status ?? 'error',
			backend: health.backend ?? stats?.backend ?? null,
			collection: health.collection ?? stats?.collection ?? null,
			databasePath: health.databasePath ?? stats?.databasePath ?? null,
			qdrantUrl: health.qdrantUrl ?? stats?.qdrantUrl ?? null,
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
	 * @description Estimates the number of updated records from vectorize responses.
	 * @param {unknown} result - Raw response from vectorize endpoints.
	 * @returns {number} Affected record count when it can be inferred.
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
	 * @description Reads the stable note identifier from frontmatter.
	 * @param {Record<string, unknown>} fm - Frontmatter object.
	 * @returns {string} Stable originalId value stored in `date created`.
	 */
	private getCreatedRawFromFrontmatter(fm: Record<string, unknown>): string {
		const created = fm['date created'];
		if (!created) {
			throw new Error('Note has no creation time in frontmatter.');
		}
		return String(created);
	}

	/**
	 * @description Returns the first non-empty string candidate.
	 * @param {...unknown[]} candidates - Possible scalar values.
	 * @returns {string} First non-empty normalized string or an empty string.
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
	 * @description Normalizes a payload value into a plain object for safe property access.
	 * @param {unknown} value - Arbitrary payload value from backend response.
	 * @returns {Record<string, unknown>} Plain object or empty object fallback.
	 */
	private ensureObject(value: unknown): Record<string, unknown> {
		return value && typeof value === 'object'
			? (value as Record<string, unknown>)
			: {};
	}

	/**
	 * @description Extracts nested metadata from a backend payload while preserving the raw object.
	 * @param {Record<string, unknown>} payload - Raw backend payload.
	 * @returns {Record<string, unknown>} Nested `metadata`/`meta` object or empty object.
	 */
	private readPayloadMetadata(
		payload: Record<string, unknown>
	): Record<string, unknown> {
		return this.ensureObject(payload.metadata ?? payload.meta);
	}

	/**
	 * @description Extracts human-readable content body from a backend payload.
	 * @param {Record<string, unknown>} payload - Raw backend payload.
	 * @returns {string} Stored content body or empty string.
	 */
	private readPayloadContent(payload: Record<string, unknown>): string {
		return this.readString(payload.content, payload.contentRaw, payload.text);
	}

	/**
	 * @description Extracts a record title from a backend payload.
	 * @param {Record<string, unknown>} payload - Raw backend payload.
	 * @returns {string} Human-readable title or empty string.
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
	 * @description Builds a compact preview for list rows without hiding the raw content in details.
	 * @param {string} content - Full record content.
	 * @returns {string} One-line preview string.
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
