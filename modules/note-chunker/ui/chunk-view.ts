/**
 * Chunk View
 * Description: Right-side panel that shows chunks for the active note and allows batch vectorization.
 */

import { App, ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import { chunkNote } from '..';
import type { Chunk } from '..';
import { renderChunkList, setActiveChunkItem } from './chunk-list';
import { findChunkIndexForLine, startCursorPolling } from './chunk-cursor';
import { VectorBridge } from '../../vector-bridge';
import { loadBaselineForChunksByOriginalId } from './chunk-compare';
import { createScrollableContainer } from './shared-container';

export const CHUNK_VIEW_TYPE = 'kora-chunks';

export class ChunkView extends ItemView {
	private vectorBridge: VectorBridge;
	private refreshTimer: number | null = null;
	private stopPolling: (() => void) | null = null;
	private lastActiveFile: TFile | null = null;
	private saveTimer: number | null = null;
	private lastModifyTime = 0;

	constructor(leaf: WorkspaceLeaf, app: App, vectorBridge: VectorBridge) {
		// @ts-ignore ItemView expects app from super(leaf)
		super(leaf);
		this.app = app;
		this.vectorBridge = vectorBridge;
	}

	getViewType(): string {
		return CHUNK_VIEW_TYPE;
	}
	getDisplayText(): string {
		return 'Kora Chunks';
	}
	getIcon(): string {
		return 'blocks';
	}

	async onOpen(): Promise<void> {
		// Only refresh when switching between different markdown files
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.handleLeafChange()));
		this.registerEvent(this.app.workspace.on('file-open', () => this.handleFileOpen()));
		// Listen to file modifications with debounced save detection
		this.registerEvent(
			this.app.vault.on('modify', file => {
				if (
					this.lastActiveFile &&
					file instanceof TFile &&
					file.path === this.lastActiveFile.path
				) {
					this.handleFileModification();
				}
			})
		);
		await this.renderForActiveFile();
		// Start listening to cursor after initial render
		if (!this.stopPolling) {
			this.stopPolling = startCursorPolling(this.app, line => this.highlightByCursorLine(line));
		}
	}

	/**
	 * Handle leaf change - only refresh if it's a different markdown file
	 */
	private handleLeafChange(): void {
		const activeFile = this.app.workspace.getActiveFile();

		// Only refresh if switching to a different markdown file
		if (this.shouldRefreshForFile(activeFile)) {
			this.scheduleRender(0);
		}
	}

	/**
	 * Handle file open - only refresh if it's a different markdown file
	 */
	private handleFileOpen(): void {
		const activeFile = this.app.workspace.getActiveFile();

		// Only refresh if opening a different markdown file
		if (this.shouldRefreshForFile(activeFile)) {
			this.scheduleRender(0);
		}
	}

	/**
	 * Check if we should refresh for this file
	 */
	private shouldRefreshForFile(file: TFile | null): boolean {
		// Don't refresh if no file or not markdown
		if (!file || file.extension !== 'md') {
			return false;
		}

		// Don't refresh if it's the same file as before
		if (this.lastActiveFile && this.lastActiveFile.path === file.path) {
			return false;
		}

		// This is a different markdown file, we should refresh
		return true;
	}

	async renderForActiveFile(): Promise<void> {
		const container = this.containerEl as HTMLElement;

		// Create shared scrollable container
		const wrapper = createScrollableContainer(container);
		const active = this.app.workspace.getActiveFile();

		if (!active || !(active instanceof TFile) || active.extension !== 'md') {
			// Keep the last file reference if no markdown file is active
			if (this.lastActiveFile) {
				wrapper.createEl('div', {
					text: `Chunks for: ${this.lastActiveFile.basename}`,
				});
				// Continue processing with the last active file
			} else {
				wrapper.createEl('div', {
					text: 'Open a markdown note to see chunks.',
				});
				return;
			}
		} else {
			// Update the last active file when we have a valid markdown file
			this.lastActiveFile = active;
		}

		const fileToProcess =
			active && active instanceof TFile && active.extension === 'md' ? active : this.lastActiveFile;
		if (!fileToProcess) return;

		const content = await this.app.vault.read(fileToProcess);
		const cache = this.app.metadataCache.getFileCache(fileToProcess);
		const fm = cache?.frontmatter || {};
		const tags = Array.isArray(fm?.tags) ? fm.tags : [];
		const aliases = Array.isArray(fm?.aliases) ? fm.aliases : [];
		const createdRaw = this.getCreatedRawFromFrontmatter(fm);
		const originalId = `${createdRaw}`;
		const chunks: Chunk[] = chunkNote(
			content,
			{
				notePath: fileToProcess.path,
				originalId,
				frontmatter: fm,
				tags,
				aliases,
			},
			{},
			cache as any
		);

		const header = wrapper.createEl('div', {
			text: `🧩 Chunks (${Math.min(chunks.length, 50)})`,
		});
		header.style.cssText =
			'display:flex;gap:8px;justify-content:space-between;align-items:center;font-weight:600;margin:8px 0;';
		const btn = header.createEl('button', {
			text: 'Vectorize chunks',
			cls: 'mod-cta',
		});
		btn.onclick = async () => {
			btn.disabled = true;
			btn.textContent = 'Synchronizing...';
			try {
				await this.syncChunks(originalId, fileToProcess, content, fm, tags, aliases, cache as any);
			} finally {
				btn.disabled = false;
				await this.renderForActiveFile();
			}
		};

		// Auto-compare and render diffs for visible chunks
		try {
			const { baselineByChunkId, statusByChunkId } = await loadBaselineForChunksByOriginalId(
				this.vectorBridge,
				originalId,
				chunks
			);

			// Collect all chunks to display (current + deleted)
			const allChunksToDisplay: Array<{
				chunk: Chunk | null;
				status: string;
				chunkId: string;
				content: string;
			}> = [];

			// Add current chunks
			for (const chunk of chunks) {
				const status = statusByChunkId.get(chunk.chunkId) || 'new';
				allChunksToDisplay.push({
					chunk,
					status,
					chunkId: chunk.chunkId,
					content: chunk.contentRaw || '',
				});
			}

			// Add deleted chunks (exist in baseline but not in current)
			for (const [chunkId, previousContent] of Array.from(baselineByChunkId.entries())) {
				if (statusByChunkId.get(chunkId) === 'deleted') {
					allChunksToDisplay.push({
						chunk: null,
						status: 'deleted',
						chunkId,
						content: previousContent,
					});
				}
			}

			// Limit display to 50 items
			const visibleItems = allChunksToDisplay.slice(0, 50);

			// Create visual chunks array for renderChunkList
			const visualChunks = visibleItems.map(item => {
				if (item.chunk) {
					return item.chunk;
				}
				// Create a proper chunk object for deleted items
				return {
					chunkId: item.chunkId,
					chunkType: 'paragraph' as const,
					headingsPath: ['[DELETED]'],
					section: '[DELETED]',
					contentRaw: item.content,
					meta: {
						originalId,
						chunkId: item.chunkId,
						noteHash: 'deleted',
						contentHash: 'deleted',
						contentType: 'obsidian_note' as const,
						chunkType: 'paragraph' as const,
						section: '[DELETED]',
						headingsPath: ['[DELETED]'],
						obsidian: {
							path: fileToProcess.path,
							tags,
							aliases,
						},
						createdAtTs: Date.now(),
						updatedAtTs: Date.now(),
					},
					position: undefined,
				} as Chunk;
			});

			const { root, items } = renderChunkList(wrapper, visualChunks as Chunk[]);
			root.dataset['koraChunkList'] = 'true';

			// Store refs for highlighting
			(this as any)._currentChunks = chunks;
			(this as any)._currentChunkItems = items.filter((_, i) => visibleItems[i].chunk !== null);

			// Check if there are any changes to sync
			const hasChanges = Array.from(statusByChunkId.values()).some(
				status => status !== 'unchanged'
			);

			// Update sync button state
			const syncBtn = header.querySelector('button') as HTMLButtonElement;
			if (syncBtn) {
				syncBtn.disabled = !hasChanges;
				syncBtn.textContent = hasChanges ? 'Vectorize chunks' : 'No changes to sync';
				if (!hasChanges) {
					syncBtn.style.opacity = '0.6';
				} else {
					syncBtn.style.opacity = '1';
				}
			}

			for (let i = 0; i < visibleItems.length; i++) {
				const displayItem = visibleItems[i];
				const item = items[i];
				const mount =
					(item?.querySelector(
						'div[data-kora-diff-mount], div[data-koraDiffMount], div[data-koradiffmount]'
					) as HTMLElement) || (item?.lastElementChild as HTMLElement);

				// Status badge
				const status = displayItem.status;
				const badge = document.createElement('span');
				badge.style.cssText =
					'font-size:10px;border-radius:8px;padding:2px 6px;margin-left:6px;vertical-align:middle;border:1px solid var(--background-modifier-border);';

				if (status === 'new') {
					badge.textContent = 'NEW';
					badge.style.background = 'rgba(16,185,129,0.15)';
					badge.style.color = 'var(--color-green,#059669)';
				}
				if (status === 'modified') {
					badge.textContent = 'CHANGED';
					badge.style.background = 'rgba(234,179,8,0.15)';
					badge.style.color = '#a16207';
				}
				if (status === 'unchanged') {
					badge.textContent = 'OK';
					badge.style.background = 'var(--background-modifier-hover)';
					badge.style.color = 'var(--text-muted)';
				}
				if (status === 'deleted') {
					badge.textContent = 'DELETED';
					badge.style.background = 'rgba(239,68,68,0.15)';
					badge.style.color = '#dc2626';
					// Make deleted items slightly transparent
					if (item) item.style.opacity = '0.7';
				}

				const headerEl = item.firstElementChild as HTMLElement;
				if (headerEl) headerEl.appendChild(badge);

				// Render inline diff for modified chunks
				if (item && mount && status === 'modified') {
					const previous = baselineByChunkId.get(displayItem.chunkId) || '';
					mount.empty();
					const view = document.createElement('div');
					view.style.cssText =
						'margin-top:4px;border:1px solid var(--background-modifier-border);border-radius:6px;padding:6px;';
					const diffEl = (await import('./inline-diff')).renderInlineDiff(
						previous,
						displayItem.content
					);
					view.appendChild(diffEl);
					mount.appendChild(view);
				} else if (mount) {
					mount.empty();
				}
			}
		} catch (e) {
			console.error('Chunk diff rendering failed', e);
			// Fallback to simple rendering
			const visibleChunks = chunks.slice(0, 50);
			const { root, items } = renderChunkList(wrapper, visibleChunks);
			root.dataset['koraChunkList'] = 'true';
			(this as any)._currentChunks = chunks;
			(this as any)._currentChunkItems = items;
		}
	}

	/**
	 * Extract created ISO from frontmatter keys like 'date created', 'created', 'dateCreated'.
	 */
	private getCreatedRawFromFrontmatter(fm: any): string {
		if (!fm) throw new Error('Note has no frontmatter');

		const v = fm['date created'] ?? null;

		if (!v) {
			throw new Error('Note has no creation time');
		}

		return String(v);
	}

	/**
	 * Handle file modification with debounced save detection
	 */
	private handleFileModification(): void {
		this.lastModifyTime = Date.now();

		// Clear existing save timer
		if (this.saveTimer) {
			window.clearTimeout(this.saveTimer);
		}

		// Set new timer - only update chunks after 3 seconds of no modifications (indicating save)
		this.saveTimer = window.setTimeout(() => {
			// Check if enough time has passed since last modification
			if (Date.now() - this.lastModifyTime >= 2900) {
				this.renderForActiveFile();
			}
		}, 3000);
	}

	private scheduleRender(delay: number) {
		if (this.refreshTimer) {
			window.clearTimeout(this.refreshTimer);
		}
		this.refreshTimer = window.setTimeout(
			() => {
				this.renderForActiveFile();
			},
			Math.max(0, delay)
		);
	}

	private highlightByCursorLine(line: number) {
		const chunks: Array<Chunk> = (this as any)._currentChunks || [];
		const items: HTMLElement[] = (this as any)._currentChunkItems || [];
		if (!chunks.length || !items.length || !this.lastActiveFile) return;

		// Only respond to cursor changes if we're in the same file we're tracking
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.path !== this.lastActiveFile.path) return;

		const idx = findChunkIndexForLine(chunks, line);
		if (idx >= 0) setActiveChunkItem(items, idx);
	}

	/**
	 * Incremental sync - only create/update/delete changed chunks
	 */
	private async syncChunks(
		originalId: string,
		file: any,
		content: string,
		fm: any,
		tags: string[],
		aliases: string[],
		cache: any
	): Promise<void> {
		const chunks: Chunk[] = chunkNote(
			content,
			{ notePath: file.path, originalId, frontmatter: fm, tags, aliases },
			{},
			cache
		);

		try {
			// Get current state from vector DB
			const { baselineByChunkId, statusByChunkId, qdrantIdByChunkId } =
				await loadBaselineForChunksByOriginalId(this.vectorBridge, originalId, chunks);

			// Collect chunks to create/update and delete
			const chunksToVectorize: any[] = [];
			const qdrantIdsToDelete: string[] = [];

			// Process current chunks
			for (const chunk of chunks) {
				const status = statusByChunkId.get(chunk.chunkId);
				if (status === 'new' || status === 'modified') {
					chunksToVectorize.push({
						id: `${originalId}#${chunk.chunkId}`,
						contentType: 'obsidian_note',
						title: file.basename,
						content: chunk.contentRaw,
						metadata: chunk.meta,
					});
				}
			}

			// Find deleted chunks (exist in baseline but not in current)
			// Use qdrantIds from the already loaded data
			for (const [chunkId] of Array.from(baselineByChunkId.entries())) {
				if (statusByChunkId.get(chunkId) === 'deleted') {
					const qdrantId = qdrantIdByChunkId.get(chunkId);
					if (qdrantId) {
						qdrantIdsToDelete.push(qdrantId);
					}
				}
			}

			// Perform batch operations
			let vectorizePromise = Promise.resolve();
			let deletePromise = Promise.resolve();

			if (chunksToVectorize.length > 0) {
				vectorizePromise = this.vectorBridge.batchVectorize(chunksToVectorize);
			}

			if (qdrantIdsToDelete.length > 0) {
				deletePromise = this.batchDeleteChunks(qdrantIdsToDelete);
			}

			await Promise.all([vectorizePromise, deletePromise]);
		} catch (error) {
			console.error('Error during incremental sync:', error);
			throw error;
		}
	}

	/**
	 * Delete multiple chunks by their IDs (auto-detects qdrantId vs chunkId)
	 */
	private async batchDeleteChunks(ids: string[]): Promise<void> {
		if (ids.length === 0) return;

		try {
			const result = await this.vectorBridge.batchDelete(ids);
			if (result.failed.length > 0) {
				console.warn(`Failed to delete ${result.failed.length} chunks:`, result.failed);
			}
			console.log(`Successfully deleted ${result.deleted} chunks`);
		} catch (error) {
			console.error('Error during batch delete:', error);
		}
	}

	async onClose(): Promise<void> {
		if (this.refreshTimer) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		if (this.saveTimer) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.stopPolling) {
			this.stopPolling();
			this.stopPolling = null;
		}
	}
}
