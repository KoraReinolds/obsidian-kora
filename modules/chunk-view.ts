/**
 * Chunk View
 * Description: Right-side panel that shows chunks for the active note and allows batch vectorization.
 */

import { App, ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import { chunkNote } from './note-chunker';
import type { Chunk } from './note-chunker';
import { renderChunkList, setActiveChunkItem } from './chunk-list';
import { findChunkIndexForLine, startCursorPolling } from './chunk-cursor';
import { VectorBridge } from './vector-bridge';

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
    const originalId = `obsidian:${file.path}`;
    const chunks: Chunk[] = chunkNote(content, { notePath: file.path, originalId, frontmatter: fm, tags, aliases }, {}, cache as any);

    const header = container.createEl('div', { text: `🧩 Chunks (${Math.min(chunks.length, 50)})` });
    header.style.cssText = 'font-weight:600;margin:8px 0;';

    const actions = container.createEl('div');
    const btn = actions.createEl('button', { text: 'Vectorize chunks', cls: 'mod-cta' });
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Vectorizing...';
      try {
        const batch = chunks.slice(0, 50).map(c => ({
          id: `${originalId}#${c.chunkId}`,
          contentType: 'obsidian_note',
          title: file.basename,
          content: c.contentRaw,
          metadata: c.meta,
        }));
        await this.vectorBridge.batchVectorize(batch as any);
      } finally {
        btn.disabled = false; btn.textContent = 'Vectorize chunks';
      }
    };

    const { root, items } = renderChunkList(container, chunks.slice(0, 50));
    root.dataset['koraChunkList'] = 'true';
    // Store refs for highlighting
    (this as any)._currentChunks = chunks;
    (this as any)._currentChunkItems = items;
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


