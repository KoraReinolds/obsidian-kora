/**
 * Chunk Compare
 * Description: Fetch previously indexed chunk content via VectorBridge and render inline diffs.
 */

import type { Chunk } from '..';
import type { VectorBridge } from '../../vector-bridge';
import { renderInlineDiff } from './inline-diff';

/** Result of a comparison operation. */
export interface ChunkCompareResult {
  exists: boolean;
  changed: boolean;
  previous?: string | null;
}

/**
 * Build vector content id for a chunk.
 */
export function buildChunkContentId(originalId: string, chunk: Chunk): string {
  return `${originalId}#${chunk.chunkId}`;
}

/**
 * Fetch stored content for a chunk.
 */
export async function fetchStoredChunkContent(vectorBridge: VectorBridge, id: string): Promise<string | null> {
  try {
    const content = await vectorBridge.getContent(id);
    if (!content || typeof content !== 'object') {
      // Some servers may return raw string
      return typeof content === 'string' ? content : null;
    }
    // Expect payload shape { content: string } or similar
    return (content.content ?? content.text ?? null) as string | null;
  } catch {
    return null;
  }
}

/**
 * Compare a current chunk against stored content.
 */
export async function compareChunk(
  vectorBridge: VectorBridge,
  originalId: string,
  chunk: Chunk
): Promise<ChunkCompareResult> {
  const id = buildChunkContentId(originalId, chunk);
  const prev = await fetchStoredChunkContent(vectorBridge, id);
  if (prev == null) return { exists: false, changed: true, previous: null };
  const changed = prev !== chunk.contentRaw;
  return { exists: true, changed, previous: prev };
}

/**
 * Load baseline stored content for a list of chunks.
 * Returns a Map keyed by chunkId with previous text or null if not indexed.
 */
export async function loadBaselineForChunks(
  vectorBridge: VectorBridge,
  originalId: string,
  chunks: Chunk[]
): Promise<Map<string, string | null>> {
  const entries = await Promise.all(
    chunks.map(async (c) => {
      const id = buildChunkContentId(originalId, c);
      const prev = await fetchStoredChunkContent(vectorBridge, id);
      return [c.chunkId, prev] as const;
    })
  );
  return new Map(entries);
}

/**
 * Fetch and render inline diff for a chunk inside mount element.
 */
export async function fetchAndRenderChunkDiff(
  vectorBridge: VectorBridge,
  originalId: string,
  chunk: Chunk,
  mountEl: HTMLElement
): Promise<void> {
  mountEl.empty();
  const spinner = mountEl.createEl('div', { text: 'Comparing…' });
  spinner.className = 'text-[11px] text-muted';
  const res = await compareChunk(vectorBridge, originalId, chunk);
  mountEl.empty();
  if (!res.exists) {
    mountEl.createEl('div', { text: 'No indexed content yet.' }).className = 'text-[11px] text-muted';
    return;
  }
  if (!res.changed) {
    mountEl.createEl('div', { text: 'No changes.' }).className = 'text-[11px] text-green-500';
    return;
  }
  const view = renderInlineDiff(res.previous || '', chunk.contentRaw || '');
  view.classList.add('mt-1', 'rounded', 'p-2', 'border', 'border-[var(--background-modifier-border)]');
  mountEl.appendChild(view);
}


