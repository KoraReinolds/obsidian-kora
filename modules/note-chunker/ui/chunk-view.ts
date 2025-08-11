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
import { fetchAndRenderChunkDiff, loadBaselineForChunks } from './chunk-compare';

export const CHUNK_VIEW_TYPE = 'kora-chunks';

export class ChunkView extends ItemView {
  private vectorBridge: VectorBridge;
  private refreshTimer: number | null = null;
  private stopPolling: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, app: App, vectorBridge: VectorBridge) {
    // @ts-ignore ItemView expects app from super(leaf)
    super(leaf);
    this.app = app;
    this.vectorBridge = vectorBridge;
  }

  getViewType(): string { return CHUNK_VIEW_TYPE; }
  getDisplayText(): string { return 'Kora Chunks'; }
  getIcon(): string { return 'blocks'; }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scheduleRender(0)));
    this.registerEvent(this.app.workspace.on('file-open', () => this.scheduleRender(0)));
    this.registerEvent(this.app.vault.on('modify', (file) => {
      const active = this.app.workspace.getActiveFile();
      if (active && file instanceof TFile && file.path === active.path) {
        this.scheduleRender(200);
      }
    }));
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      const active = this.app.workspace.getActiveFile();
      if (active && file instanceof TFile && file.path === active.path) {
        this.scheduleRender(200);
      }
    }));
    await this.renderForActiveFile();
    // Start listening to cursor after initial render
    if (!this.stopPolling) {
      this.stopPolling = startCursorPolling(this.app, (line) => this.highlightByCursorLine(line));
    }
  }

  async renderForActiveFile(): Promise<void> {
    const container = this.containerEl as HTMLElement;
    container.empty();
    const active = this.app.workspace.getActiveFile();
    if (!active || !(active instanceof TFile) || active.extension !== 'md') {
      container.createEl('div', { text: 'Open a markdown note to see chunks.' });
      return;
    }
    const file = active as TFile;
    const content = await this.app.vault.read(file);
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    const tags = Array.isArray(fm?.tags) ? fm.tags : [];
    const aliases = Array.isArray(fm?.aliases) ? fm.aliases : [];
    const createdRaw = this.getCreatedRawFromFrontmatter(fm);
    const originalId = `${createdRaw}`;
    const chunks: Chunk[] = chunkNote(content, { notePath: file.path, originalId, frontmatter: fm, tags, aliases }, {}, cache as any);

    const header = container.createEl('div', { text: `🧩 Chunks (${Math.min(chunks.length, 50)})` });
    header.style.cssText = 'font-weight:600;margin:8px 0;';

    const actions = container.createEl('div');
    const btn = actions.createEl('button', { text: 'Vectorize chunks', cls: 'mod-cta' });
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Vectorizing...';
      try {
        await this.vectorBridge.vectorizeNote({
          originalId,
          path: file.path,
          content,
          title: file.basename,
          metadata: { frontmatter: fm, tags, aliases },
          cache: cache as any,
        });
      } finally {
        btn.disabled = false; btn.textContent = 'Vectorize chunks';
      }
    };

    const visibleChunks = chunks.slice(0, 50);
    const { root, items } = renderChunkList(container, visibleChunks);
    root.dataset['koraChunkList'] = 'true';
    // Store refs for highlighting
    (this as any)._currentChunks = chunks;
    (this as any)._currentChunkItems = items;
    // Auto-compare and render diffs for visible chunks
    try {
      await loadBaselineForChunks(this.vectorBridge, originalId, visibleChunks);
      for (let i = 0; i < visibleChunks.length; i++) {
        const item = items[i];
        const mount = item?.querySelector('div[data-kora-diff-mount], div[data-koraDiffMount], div[data-koradiffmount]') as HTMLElement || (item?.lastElementChild as HTMLElement);
        if (item && mount) await fetchAndRenderChunkDiff(this.vectorBridge, originalId, visibleChunks[i], mount);
      }
    } catch (e) {
      console.error('Chunk diff rendering failed', e);
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

  private scheduleRender(delay: number) {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.renderForActiveFile();
    }, Math.max(0, delay));
  }

  private highlightByCursorLine(line: number) {
    const chunks: Array<Chunk> = (this as any)._currentChunks || [];
    const items: HTMLElement[] = (this as any)._currentChunkItems || [];
    if (!chunks.length || !items.length) return;
    const idx = findChunkIndexForLine(chunks, line);
    if (idx >= 0) setActiveChunkItem(items, idx);
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.stopPolling) {
      this.stopPolling();
      this.stopPolling = null;
    }
  }
}


