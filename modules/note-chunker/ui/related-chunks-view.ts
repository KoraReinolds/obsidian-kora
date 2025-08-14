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
  private lastActiveFile: TFile | null = null;

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
    // Only refresh when switching between different markdown files
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.handleLeafChange()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.handleFileOpen()));
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
      // Keep the last file reference if no markdown file is active
      container.createEl('div', { 
        text: this.lastActiveFile ? 
          `Related chunks for: ${this.lastActiveFile.basename}` :
          'Open a markdown note to see related chunks.',
        cls: 'related-chunks-placeholder'
      });
      // Don't return here if we have a last active file, so we can continue processing
      if (!this.lastActiveFile) {
        return;
      }
    } else {
      // Update the last active file when we have a valid markdown file
      this.lastActiveFile = active;
    }

    const fileToProcess = active && active instanceof TFile && active.extension === 'md' ? active : this.lastActiveFile;
    if (!fileToProcess) return;

    // Get chunks for the file to process
    const content = await this.app.vault.read(fileToProcess);
    const cache = this.app.metadataCache.getFileCache(fileToProcess);
    const fm = cache?.frontmatter || {};
    const tags = Array.isArray(fm?.tags) ? fm.tags : [];
    const aliases = Array.isArray(fm?.aliases) ? fm.aliases : [];
    const createdRaw = this.getCreatedRawFromFrontmatter(fm);
    const originalId = `${createdRaw}`;
    
    this.currentChunks = chunkNote(
      content, 
      { notePath: fileToProcess.path, originalId, frontmatter: fm, tags, aliases }, 
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
    if (!this.currentChunks.length || !this.lastActiveFile) return;
    
    // Only respond to cursor changes if we're in the same file we're tracking
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.path !== this.lastActiveFile.path) return;
    
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

      // Render related chunks with custom rendering for scores
      const relatedHeader = container.createEl('div', { text: `Found ${relatedChunks.length} related chunks:` });
      relatedHeader.style.cssText = 'margin:12px 0 8px 0;font-size:12px;color:var(--text-muted);';

      this.renderRelatedChunkList(container, relatedChunks);

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

  /**
   * Custom render for related chunks with weight indicators
   */
  private renderRelatedChunkList(container: HTMLElement, relatedChunks: RelatedChunk[]): void {
    const list = container.createEl('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;';
    list.dataset['koraRelatedChunkList'] = 'true';
    
    for (const chunk of relatedChunks) {
      const item = list.createEl('div');
      item.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px;background:var(--background-secondary);transition:background-color .15s,border-color .15s;';
      item.dataset['chunkId'] = chunk.chunkId;
      
      // Header with chunk info and score
      const top = item.createEl('div');
      top.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;gap:8px;';
      
      const left = top.createEl('span');
      left.textContent = `${chunk.chunkType} — ${chunk.headingsPath.join(' > ')}`;
      
      // Score container with weight indicator
      const scoreContainer = top.createEl('span');
      scoreContainer.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
      
      // Weight indicator (dots)
      const weightIndicator = this.createWeightIndicator(chunk.score);
      const score = Math.round(chunk.score * 100);
      weightIndicator.title = `Similarity strength: ${this.getStrengthLabel(chunk.score)} (${score}%)`;
      scoreContainer.appendChild(weightIndicator);
      
      // Score badge
      const badge = scoreContainer.createEl('span', { text: `${score}%` });
      badge.style.cssText = 'font-size:10px;border-radius:8px;padding:2px 6px;vertical-align:middle;border:1px solid var(--background-modifier-border);background:var(--background-modifier-hover);color:var(--text-muted);';
      
      // Content preview
      const preview = item.createEl('div', { text: chunk.contentRaw.slice(0, 220) + (chunk.contentRaw.length > 220 ? '…' : '') });
      preview.style.cssText = 'font-size:12px;margin-bottom:4px;';
      
      // Source file info
      if (chunk.sourceFile) {
        const sourceInfo = item.createEl('div', { text: `📄 ${chunk.sourceFile}` });
        sourceInfo.style.cssText = 'font-size:10px;color:var(--text-muted);';
      }
      
      // Diff mount placeholder
      const diffMount = item.createEl('div');
      diffMount.style.cssText = 'margin-top:8px;';
      diffMount.dataset['koraDiffMount'] = 'true';
    }
  }

  /**
   * Create a visual weight indicator (dots like Smart Connections)
   */
  private createWeightIndicator(score: number): HTMLElement {
    const container = document.createElement('span');
    container.style.cssText = 'display:inline-flex;gap:1px;';
    
    // Determine how many dots to show (1-5 based on score)
    const maxDots = 5;
    const filledDots = Math.max(1, Math.ceil(score * maxDots));
    
    for (let i = 0; i < maxDots; i++) {
      const dot = document.createElement('span');
      dot.style.cssText = `
        width: 4px;
        height: 4px;
        border-radius: 50%;
        display: inline-block;
        margin: 0 1px;
      `;
      
      if (i < filledDots) {
        // Filled dot - color based on strength
        let color = '';
        if (score >= 0.8) color = 'var(--color-green, #059669)'; // Very strong
        else if (score >= 0.6) color = 'var(--color-yellow, #d97706)'; // Strong  
        else if (score >= 0.4) color = 'var(--color-orange, #ea580c)'; // Medium
        else color = 'var(--text-muted)'; // Weak
        
        dot.style.backgroundColor = color;
        dot.style.border = `1px solid ${color}`;
      } else {
        // Empty dot
        dot.style.backgroundColor = 'transparent';
        dot.style.border = '1px solid var(--background-modifier-border)';
        dot.style.opacity = '0.3';
      }
      
      container.appendChild(dot);
    }
    
    return container;
  }

  /**
   * Get text label for similarity strength
   */
  private getStrengthLabel(score: number): string {
    if (score >= 0.8) return 'Very Strong';
    if (score >= 0.6) return 'Strong';
    if (score >= 0.4) return 'Medium';
    if (score >= 0.2) return 'Weak';
    return 'Very Weak';
  }

  private getCreatedRawFromFrontmatter(fm: any): string {
    if (!fm) throw new Error('Note has no frontmatter');
    const v = fm['date created'] ?? null;
    if (!v) throw new Error('Note has no creation time');
    return String(v);
  }

  /**
   * Handle leaf change - only refresh if it's a different markdown file
   */
  private handleLeafChange(): void {
    const activeFile = this.app.workspace.getActiveFile();
    
    // Only refresh if switching to a different markdown file
    if (this.shouldRefreshForFile(activeFile)) {
      this.scheduleRefresh(0);
    }
  }

  /**
   * Handle file open - only refresh if it's a different markdown file
   */
  private handleFileOpen(): void {
    const activeFile = this.app.workspace.getActiveFile();
    
    // Only refresh if opening a different markdown file
    if (this.shouldRefreshForFile(activeFile)) {
      this.scheduleRefresh(0);
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