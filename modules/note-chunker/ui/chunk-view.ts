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
import { fetchAndRenderChunkDiff, loadBaselineForChunksByOriginalId } from './chunk-compare';

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
      const { baselineByChunkId, statusByChunkId } = await loadBaselineForChunksByOriginalId(this.vectorBridge, originalId, chunks);

      for (let i = 0; i < visibleChunks.length; i++) {
        const chunk = visibleChunks[i];
        const item = items[i];
        const mount = item?.querySelector('div[data-kora-diff-mount], div[data-koraDiffMount], div[data-koradiffmount]') as HTMLElement || (item?.lastElementChild as HTMLElement);
        // Status badge
        const status = statusByChunkId.get(chunk.chunkId) || 'new';
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:10px;border-radius:8px;padding:2px 6px;margin-left:6px;vertical-align:middle;border:1px solid var(--background-modifier-border);';
        if (status === 'new') { badge.textContent = 'NEW'; badge.style.background = 'rgba(16,185,129,0.15)'; badge.style.color = 'var(--color-green,#059669)'; }
        if (status === 'modified') { badge.textContent = 'CHANGED'; badge.style.background = 'rgba(234,179,8,0.15)'; badge.style.color = '#a16207'; }
        if (status === 'unchanged') { badge.textContent = 'OK'; badge.style.background = 'var(--background-modifier-hover)'; badge.style.color = 'var(--text-muted)'; }
        const headerEl = item.firstElementChild as HTMLElement;
        if (headerEl) headerEl.appendChild(badge);
        // Render inline diff only for modified
        if (item && mount && status === 'modified') {
          const previous = baselineByChunkId.get(chunk.chunkId) || '';
          mount.empty();
          const view = document.createElement('div');
          view.style.cssText = 'margin-top:4px;border:1px solid var(--background-modifier-border);border-radius:6px;padding:6px;';
          const diffEl = (await import('./inline-diff')).renderInlineDiff(previous, chunk.contentRaw || '');
          view.appendChild(diffEl);
          mount.appendChild(view);
        } else if (mount) {
          mount.empty();
        }
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


