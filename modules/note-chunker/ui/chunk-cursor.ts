/**
 * Chunk Cursor Utilities
 * Description: Helpers to watch editor cursor line and map it to a chunk index.
 */

import { App, MarkdownView } from 'obsidian';
import type { Chunk } from '..';

/**
 * Find the index of the chunk that contains the given cursor line.
 * Accepts chunks augmented with startLine/endLine.
 */
export function findChunkIndexForLine(chunks: Array<Chunk & { position?: { start: { line: number }, end: { line: number } } }>, line: number): number {
  for (let i = 0; i < chunks.length; i++) {
    const c: any = chunks[i];
    const start = c.position?.start?.line;
    const end = c.position?.end?.line;
    if (typeof start === 'number' && typeof end === 'number') {
      if (line >= start && line <= end) return i;
    }
  }
  return -1;
}

/**
 * Start polling the active editor cursor line. Calls callback when line changes.
 * Returns a cleanup function to stop polling.
 */
export function startCursorPolling(app: App, onLineChange: (line: number) => void, intervalMs = 200): () => void {
  let lastLine = -1;
  const timer = window.setInterval(() => {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    const line = view?.editor.getCursor().line ?? -1;
    if (line !== lastLine) {
      lastLine = line;
      if (line >= 0) onLineChange(line);
    }
  }, Math.max(50, intervalMs));
  return () => window.clearInterval(timer);
}


