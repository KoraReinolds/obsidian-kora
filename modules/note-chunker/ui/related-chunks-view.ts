/**
 * Related Chunks View
 * Description: Panel that shows chunks related to the currently active chunk using vector similarity search.
 */

import { App, ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import { chunkNote } from '..';
import type { Chunk } from '..';
import { renderChunkList } from './chunk-list';
import { findChunkIndexForLine, startCursorPolling } from './chunk-cursor';
import { VectorBridge } from '../../vector-bridge';

export const RELATED_CHUNKS_VIEW_TYPE = 'kora-related-chunks';

interface RelatedChunk extends Chunk {
  score: number;
  sourceFile?: string;
}

export class RelatedChunksView extends ItemView {
  private vectorBridge: VectorBridge;
  private stopPolling: (() => void) | null = null;
  private currentActiveChunk: Chunk | null = null;
  private currentChunks: Chunk[] = [];
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, app: App, vectorBridge: VectorBridge) {
    // @ts-ignore ItemView expects app from super(leaf)
    super(leaf);
    this.app = app;
    this.vectorBridge = vectorBridge;
  }

  getViewType(): string { return RELATED_CHUNKS_VIEW_TYPE; }
  getDisplayText(): string { return 'Related Chunks'; }
  getIcon(): string { return 'git-branch'; }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scheduleRefresh(0)));
    this.registerEvent(this.app.workspace.on('file-open', () => this.scheduleRefresh(0)));
    this.registerEvent(this.app.vault.on('modify', (file) => {
      const active = this.app.workspace.getActiveFile();
      if (active && file instanceof TFile && file.path === active.path) {
        this.scheduleRefresh(300);
      }
    }));
    
    await this.initializeForActiveFile();
    
    // Start listening to cursor changes
    if (!this.stopPolling) {
      this.stopPolling = startCursorPolling(this.app, (line) => this.onCursorChange(line));
    }
  }

  private async initializeForActiveFile(): Promise<void> {
    const container = this.containerEl as HTMLElement;
    container.empty();
    
    const active = this.app.workspace.getActiveFile();
    if (!active || !(active instanceof TFile) || active.extension !== 'md') {
      container.createEl('div', { 
        text: 'Open a markdown note to see related chunks.',
        cls: 'related-chunks-placeholder'
      });
      return;
    }

    // Get chunks for the current file
    const content = await this.app.vault.read(active);
    const cache = this.app.metadataCache.getFileCache(active);
    const fm = cache?.frontmatter || {};
    const tags = Array.isArray(fm?.tags) ? fm.tags : [];
    const aliases = Array.isArray(fm?.aliases) ? fm.aliases : [];
    const createdRaw = this.getCreatedRawFromFrontmatter(fm);
    const originalId = `${createdRaw}`;
    
    this.currentChunks = chunkNote(
      content, 
      { notePath: active.path, originalId, frontmatter: fm, tags, aliases }, 
      {}, 
      cache as any
    );

    // Show initial placeholder
    const header = container.createEl('div', { text: '🔗 Related Chunks' });
    header.style.cssText = 'font-weight:600;margin:8px 0;';
    
    container.createEl('div', { 
      text: 'Position cursor on a chunk to see related content.',
      cls: 'related-chunks-instruction'
    });
  }

  private async onCursorChange(line: number): Promise<void> {
    if (!this.currentChunks.length) return;
    
    const chunkIndex = findChunkIndexForLine(this.currentChunks, line);
    if (chunkIndex >= 0) {
      const activeChunk = this.currentChunks[chunkIndex];
      if (this.currentActiveChunk?.chunkId !== activeChunk.chunkId) {
        this.currentActiveChunk = activeChunk;
        await this.findAndRenderRelatedChunks(activeChunk);
      }
    }
  }

  private async findAndRenderRelatedChunks(activeChunk: Chunk): Promise<void> {
    const container = this.containerEl as HTMLElement;
    container.empty();

    const header = container.createEl('div', { text: '🔗 Related Chunks' });
    header.style.cssText = 'font-weight:600;margin:8px 0;';

    // Show current chunk info
    const currentInfo = container.createEl('div');
    currentInfo.style.cssText = 'margin-bottom:12px;padding:8px;background:var(--background-modifier-hover);border-radius:6px;';
    
    const currentTitle = currentInfo.createEl('div', { text: 'Current:' });
    currentTitle.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:4px;';
    
    const currentContent = currentInfo.createEl('div', { text: this.truncateText(activeChunk.contentRaw || '', 100) });
    currentContent.style.cssText = 'font-size:12px;line-height:1.4;';

    try {
      // Check if vector service is available
      const isHealthy = await this.vectorBridge.isVectorServiceHealthy();
      if (!isHealthy) {
        container.createEl('div', { 
          text: 'Vector service unavailable. Start GramJS server with Qdrant and OpenAI configured.',
          cls: 'related-chunks-error'
        });
        return;
      }

      const loadingEl = container.createEl('div', { text: 'Finding related chunks...' });
      loadingEl.style.cssText = 'margin:12px 0;color:var(--text-muted);font-style:italic;';

      // Search for related chunks
      const searchResults = await this.vectorBridge.searchContent({
        query: activeChunk.contentRaw || '',
        limit: 10,
        contentTypes: ['obsidian_note'],
        scoreThreshold: 0.3
      });

      loadingEl.remove();

      if (searchResults.results.length === 0) {
        container.createEl('div', { 
          text: 'No related chunks found.',
          cls: 'related-chunks-empty'
        });
        return;
      }

      // Filter out the current chunk and convert to RelatedChunk format
      const relatedChunks: RelatedChunk[] = searchResults.results
        .filter(result => {
          // Exclude the current chunk itself
          const resultChunkId = result.content?.chunkId;
          return resultChunkId !== activeChunk.chunkId;
        })
        .map(result => this.convertSearchResultToChunk(result))
        .filter(chunk => chunk !== null) as RelatedChunk[];

      if (relatedChunks.length === 0) {
        container.createEl('div', { 
          text: 'No related chunks found (excluding current).',
          cls: 'related-chunks-empty'
        });
        return;
      }

      // Render related chunks
      const relatedHeader = container.createEl('div', { text: `Found ${relatedChunks.length} related chunks:` });
      relatedHeader.style.cssText = 'margin:12px 0 8px 0;font-size:12px;color:var(--text-muted);';

      const { root } = renderChunkList(container, relatedChunks);
      root.dataset['koraRelatedChunkList'] = 'true';

      // Add similarity scores to each chunk item
      const chunkItems = root.querySelectorAll('[data-chunk-id]');
      chunkItems.forEach((item, index) => {
        if (index < relatedChunks.length) {
          const chunk = relatedChunks[index];
          const score = Math.round(chunk.score * 100);
          
          // Add score badge
          const badge = document.createElement('span');
          badge.textContent = `${score}%`;
          badge.style.cssText = 'font-size:10px;border-radius:8px;padding:2px 6px;margin-left:6px;vertical-align:middle;border:1px solid var(--background-modifier-border);background:var(--background-modifier-hover);color:var(--text-muted);';
          
          const headerEl = item.firstElementChild as HTMLElement;
          if (headerEl) headerEl.appendChild(badge);

          // Add source file info if different from current file
          if (chunk.sourceFile) {
            const sourceInfo = document.createElement('div');
            sourceInfo.textContent = `📄 ${chunk.sourceFile}`;
            sourceInfo.style.cssText = 'font-size:10px;color:var(--text-muted);margin-top:4px;';
            
            const contentEl = item.querySelector('[data-kora-diff-mount], [data-koraDiffMount], [data-koradiffmount]') as HTMLElement || (item.lastElementChild as HTMLElement);
            if (contentEl) {
              contentEl.appendChild(sourceInfo);
            }
          }
        }
      });

    } catch (error) {
      console.error('Error finding related chunks:', error);
      const errorEl = container.createEl('div', { 
        text: `Error: ${error.message}`,
        cls: 'related-chunks-error'
      });
      errorEl.style.cssText = 'color:var(--text-error);margin:12px 0;';
    }
  }

  private convertSearchResultToChunk(result: any): RelatedChunk | null {
    try {
      const content = result.content;
      if (!content || !content.chunkId) return null;

      // Extract source file from metadata
      const sourceFile = content.obsidian?.path || content.meta?.obsidian?.path || 'Unknown file';
      
      const relatedChunk: RelatedChunk = {
        chunkId: content.chunkId,
        chunkType: content.chunkType || 'paragraph',
        headingsPath: content.headingsPath || [],
        section: content.section || 'Unknown section',
        contentRaw: content.content || content.contentRaw || '',
        meta: content.meta || content,
        position: undefined,
        score: result.score,
        sourceFile: sourceFile
      };

      return relatedChunk;
    } catch (error) {
      console.error('Error converting search result to chunk:', error);
      return null;
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private getCreatedRawFromFrontmatter(fm: any): string {
    if (!fm) throw new Error('Note has no frontmatter');
    const v = fm['date created'] ?? null;
    if (!v) throw new Error('Note has no creation time');
    return String(v);
  }

  private scheduleRefresh(delay: number): void {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.initializeForActiveFile();
      this.currentActiveChunk = null; // Reset to force refresh on next cursor change
    }, Math.max(0, delay));
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