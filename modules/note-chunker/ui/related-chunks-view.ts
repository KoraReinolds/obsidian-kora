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
import { createScrollableContainer } from './shared-container';

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
  private saveTimer: number | null = null;
  private lastModifyTime: number = 0;

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
    // Listen to file modifications with debounced save detection
    this.registerEvent(this.app.vault.on('modify', (file) => {
      const active = this.app.workspace.getActiveFile();
      if (active && file instanceof TFile && file.path === active.path) {
        this.handleFileModification();
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
    
    // Create shared scrollable container
    const wrapper = createScrollableContainer(container);
    
    const active = this.app.workspace.getActiveFile();
    if (!active || !(active instanceof TFile) || active.extension !== 'md') {
      // Keep the last file reference if no markdown file is active
      wrapper.createEl('div', { 
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
    const header = wrapper.createEl('div', { text: '🔗 Related Chunks' });
    header.style.cssText = 'font-weight:600;margin:8px 0;';
    
    wrapper.createEl('div', { 
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
    
    // Create shared scrollable container
    const wrapper = createScrollableContainer(container);

    const header = wrapper.createEl('div', { text: '🔗 Related Chunks' });
    header.style.cssText = 'font-weight:600;margin:8px 0;';

    // Show current chunk info
    const currentInfo = wrapper.createEl('div');
    currentInfo.style.cssText = 'margin-bottom:12px;padding:8px;background:var(--background-modifier-hover);border-radius:6px;';
    
    const currentTitle = currentInfo.createEl('div', { text: 'Current:' });
    currentTitle.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:4px;';
    
    const currentContent = currentInfo.createEl('div', { text: this.truncateText(activeChunk.contentRaw || '', 100) });
    currentContent.style.cssText = 'font-size:12px;line-height:1.4;';

    try {
      // Check if vector service is available
      const isHealthy = await this.vectorBridge.isVectorServiceHealthy();
      if (!isHealthy) {
        wrapper.createEl('div', { 
          text: 'Vector service unavailable. Start GramJS server with Qdrant and OpenAI configured.',
          cls: 'related-chunks-error'
        });
        return;
      }

      const loadingEl = wrapper.createEl('div', { text: 'Finding related chunks...' });
      loadingEl.style.cssText = 'margin:12px 0;color:var(--text-muted);font-style:italic;';

      // Search for related chunks
      const searchResults = await this.vectorBridge.searchContent({
        query: activeChunk.contentRaw || '',
        limit: 15, // Increased limit since we'll filter out current file
        contentTypes: ['obsidian_note'],
        scoreThreshold: 0.3
      });

      loadingEl.remove();

      if (searchResults.results.length === 0) {
        wrapper.createEl('div', { 
          text: 'No related chunks found.',
          cls: 'related-chunks-empty'
        });
        return;
      }

      // Get current file's originalId for filtering
      const currentOriginalId = activeChunk.meta?.originalId;

      // Filter out chunks from current file and current chunk itself
      const relatedChunks: RelatedChunk[] = searchResults.results
        .filter(result => {
          const resultChunkId = result.content?.chunkId;
          const resultOriginalId = result.content?.originalId || result.content?.meta?.originalId;
          
          // Exclude the current chunk itself
          if (resultChunkId === activeChunk.chunkId) {
            return false;
          }
          
          // Exclude chunks from the same file (same originalId)
          if (currentOriginalId && resultOriginalId === currentOriginalId) {
            return false;
          }
          
          return true;
        })
        .map(result => this.convertSearchResultToChunk(result))
        .filter(chunk => chunk !== null)
        .slice(0, 5) as RelatedChunk[]; // Limit to 10 after filtering

      if (relatedChunks.length === 0) {
        wrapper.createEl('div', { 
          text: 'No related chunks found in other files.',
          cls: 'related-chunks-empty'
        });
        return;
      }

      // Render related chunks with custom rendering for scores
      const relatedHeader = wrapper.createEl('div', { text: `Found ${relatedChunks.length} related chunks in other files:` });
      relatedHeader.style.cssText = 'margin:12px 0 8px 0;font-size:12px;color:var(--text-muted);';

      this.renderRelatedChunkList(wrapper, relatedChunks);


    } catch (error) {
      console.error('Error finding related chunks:', error);
      const errorEl = wrapper.createEl('div', { 
        text: `Error: ${error.message}`,
        cls: 'related-chunks-error'
      });
      errorEl.style.cssText = 'color:var(--text-error);margin:12px 0;';
    } finally {
      // Add unsynced notes section
      await this.renderUnsyncedNotes(wrapper);
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
      item.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px;background:var(--background-secondary);transition:background-color .15s,border-color .15s;cursor:pointer;';
      item.dataset['chunkId'] = chunk.chunkId;
      item.title = `Click to open ${chunk.sourceFile || 'this file'} and jump to this chunk`;
      
      // Add hover effect
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'var(--background-modifier-hover)';
        item.style.borderColor = 'var(--interactive-accent)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'var(--background-secondary)';
        item.style.borderColor = 'var(--background-modifier-border)';
      });
      
      // Add click handler to open the file
      item.addEventListener('click', async () => {
        await this.openChunkInEditor(chunk);
      });
      
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
      
      // Source file info with click indicator
      if (chunk.sourceFile) {
        const sourceInfo = item.createEl('div', { text: `📄 ${chunk.sourceFile} →` });
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

  /**
   * Render section with unsynced notes
   */
  private async renderUnsyncedNotes(wrapper: HTMLElement): Promise<void> {
    try {
      // Get all markdown files in vault
      const allFiles = this.app.vault.getMarkdownFiles();
      
      // Get all unique originalIds from vector database
      const vectorStats = await this.vectorBridge.getStats();
      
      // Get all vectorized content to check which originalIds exist
      const vectorizedContent = await this.vectorBridge.getContentBy({
        by: 'contentType',
        value: 'obsidian_note',
        multiple: true,
        limit: 10000
      });

      if (!vectorizedContent || !Array.isArray(vectorizedContent)) {
        return; // Skip if we can't get vectorized content
      }

      // Extract all existing originalIds from vectorized content
      const existingOriginalIds = new Set<string>();
      for (const item of vectorizedContent) {
        const originalId = item.payload?.originalId || item.payload?.meta?.originalId;
        if (originalId) {
          existingOriginalIds.add(originalId);
        }
      }

      // Find files that are not synced and are in /Organize folder
      const unsyncedFiles: TFile[] = [];
      for (const file of allFiles.sort((a, b) => Math.random() - 0.5)) {
        try {
          // Only include files that start with "Organize/"
          if (!file.path.startsWith('Organize/')) {
            continue;
          }
          
          const cache = this.app.metadataCache.getFileCache(file);
          const fm = cache?.frontmatter || {};
          const createdRaw = this.getCreatedRawFromFrontmatter(fm);
          const originalId = `${createdRaw}`;
          
          if (!existingOriginalIds.has(originalId)) {
            unsyncedFiles.push(file);
          }
        } catch (error) {
          // Skip files without proper frontmatter
          continue;
        }
      }

      if (unsyncedFiles.length === 0) {
        return; // Don't show section if all files are synced
      }

      // Render unsynced notes section
      const separator = wrapper.createEl('div');
      separator.style.cssText = 'height:1px;background:var(--background-modifier-border);margin:16px 0;';
      
      const unsyncedHeader = wrapper.createEl('div', { text: `📤 Unsynced Notes in /Organize (${unsyncedFiles.length})` });
      unsyncedHeader.style.cssText = 'font-weight:600;margin:8px 0;color:var(--text-muted);';
      
      const unsyncedSubheader = wrapper.createEl('div', { text: 'These notes from /Organize folder are not yet indexed for vector search:' });
      unsyncedSubheader.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:8px;';

      // Limit display to first 20 unsynced files
      const filesToShow = unsyncedFiles.slice(0, 20);
      const list = wrapper.createEl('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

      for (const file of filesToShow) {
        const item = list.createEl('div');
        item.style.cssText = 'padding:6px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-secondary);cursor:pointer;transition:background-color .15s,border-color .15s;font-size:12px;';
        item.textContent = `📄 ${file.basename}`;
        item.title = `Click to open ${file.name}`;

        // Add hover effect
        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = 'var(--background-modifier-hover)';
          item.style.borderColor = 'var(--interactive-accent)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'var(--background-secondary)';
          item.style.borderColor = 'var(--background-modifier-border)';
        });

        // Add click handler to open file
        item.addEventListener('click', async () => {
          await this.openFileInEditor(file);
        });
      }

      // Show "and X more" if there are more files
      if (unsyncedFiles.length > 20) {
        const moreText = wrapper.createEl('div', { text: `... and ${unsyncedFiles.length - 20} more files` });
        moreText.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:4px;font-style:italic;';
      }

    } catch (error) {
      console.error('Error rendering unsynced notes:', error);
      // Fail silently to not break the main functionality
    }
  }

  /**
   * Open a file in the editor
   */
  private async openFileInEditor(file: TFile): Promise<void> {
    try {
      const leaf = this.app.workspace.getUnpinnedLeaf();
      if (!leaf) return;
      await leaf.openFile(file);
    } catch (error) {
      console.error('Error opening file in editor:', error);
    }
  }

  /**
   * Open a chunk in the editor and scroll to its position
   */
  private async openChunkInEditor(chunk: RelatedChunk): Promise<void> {
    try {
      if (!chunk.sourceFile) {
        console.error('No source file information for chunk:', chunk.chunkId);
        return;
      }

      // Get the file from vault
      const file = this.app.vault.getAbstractFileByPath(chunk.sourceFile);
      if (!file || !(file instanceof TFile)) {
        console.error('File not found:', chunk.sourceFile);
        return;
      }

      // Open the file in the current active leaf or create a new one
      const leaf = this.app.workspace.getUnpinnedLeaf();
      if (!leaf) return;

      await leaf.openFile(file);

      // Try to scroll to the chunk position if we have position data
      if (chunk.position && chunk.position.start) {
        // Wait a bit for the file to load
        setTimeout(() => {
          const view = leaf.view;
          if (view && 'editor' in view) {
            const editor = (view as any).editor;
            if (editor && editor.setCursor) {
              // Move cursor to the chunk position
              const line = chunk.position?.start?.line || 0;
              editor.setCursor(line, 0);
              editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } });
            }
          }
        }, 100);
      } else {
        // Fallback: try to find the chunk content in the file
        setTimeout(async () => {
          const content = await this.app.vault.read(file);
          const lines = content.split('\n');
          const chunkContent = chunk.contentRaw.trim();
          
          // Find the line containing the chunk content
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().includes(chunkContent.substring(0, 50))) {
              const view = leaf.view;
              if (view && 'editor' in view) {
                const editor = (view as any).editor;
                if (editor && editor.setCursor) {
                  editor.setCursor(i, 0);
                  editor.scrollIntoView({ from: { line: i, ch: 0 }, to: { line: i, ch: 0 } });
                  break;
                }
              }
            }
          }
        }, 100);
      }

    } catch (error) {
      console.error('Error opening chunk in editor:', error);
    }
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
        this.initializeForActiveFile();
        this.currentActiveChunk = null; // Reset to force refresh on next cursor change
      }
    }, 3000);
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