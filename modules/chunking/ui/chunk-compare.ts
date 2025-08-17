/**
 * Chunk Compare
 * Description: Fetch previously indexed chunk content via VectorBridge and render inline diffs.
 */

import type { Chunk } from '..';
import type { VectorBridge } from '../../vector';
import { renderInlineDiff } from './inline-diff';

/** Result of a comparison operation. */
export interface ChunkCompareResult {
  exists: boolean;
  changed: boolean;
  previous?: string | null;
}

/**
 * Fetch stored content for a chunk.
 */
export async function fetchStoredChunkContent(vectorBridge: VectorBridge, id: string): Promise<string | null> {
  try {
    const content = await vectorBridge.getContentBy({ by: 'chunkId', value: id, multiple: false });
    if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
    return (content.payload?.content ?? content.payload?.text ?? null) as string | null;
  } catch {
    return null;
  }
}

/**
 * Compare a current chunk against stored content.
 */
export async function compareChunk(
  vectorBridge: VectorBridge,
  chunk: Chunk
): Promise<ChunkCompareResult> {
  const prev = await fetchStoredChunkContent(vectorBridge, chunk.chunkId);
  if (prev == null) return { exists: false, changed: true, previous: null };
  const changed = prev !== chunk.contentRaw;
  return { exists: true, changed, previous: prev };
}

/**
 * Load baseline stored content for a list of chunks.
 * Returns a Map keyed by chunkId with previous text or null if not indexed.
 */
export async function loadBaselineForChunksByOriginalId(
  vectorBridge: VectorBridge,
  originalId: string,
  currentChunks: Chunk[]
): Promise<{ baselineByChunkId: Map<string, string>, statusByChunkId: Map<string, 'new' | 'deleted' | 'modified' | 'unchanged'>, qdrantIdByChunkId: Map<string, string> }>{
  const res = await vectorBridge.getContentBy({ by: 'originalId', value: originalId, multiple: true, limit: 5000 });
  const points = Array.isArray(res) ? res : [];
  const baselineByChunkId = new Map<string, string>();
  const qdrantIdByChunkId = new Map<string, string>();
  
  for (const p of points) {
    const payload = p.payload || {};
    const meta = payload.metadata || payload.meta || {};
    const chunkId = meta.chunkId || payload.chunkId || null;
    const content = payload.content || payload.text || '';
    if (chunkId) {
      baselineByChunkId.set(String(chunkId), String(content));
      qdrantIdByChunkId.set(String(chunkId), p.qdrantId);
    }
  }
  
  // Determine statuses by comparing current vs baseline
  const statusByChunkId = new Map<string, 'new' | 'deleted' | 'modified' | 'unchanged'>();
  const currentIds = new Set(currentChunks.map(c => c.chunkId));
  for (const c of currentChunks) {
    const prev = baselineByChunkId.get(c.chunkId);
    if (prev == null) statusByChunkId.set(c.chunkId, 'new');
    else if (prev === c.contentRaw) statusByChunkId.set(c.chunkId, 'unchanged');
    else statusByChunkId.set(c.chunkId, 'modified');
  }
  // Mark deleted (present in baseline but not in current)
  for (const [chunkId] of Array.from(baselineByChunkId.entries())) {
    if (!currentIds.has(chunkId)) statusByChunkId.set(chunkId, 'deleted');
  }
  return { baselineByChunkId, statusByChunkId, qdrantIdByChunkId };
}

/**
 * Fetch and render inline diff for a chunk inside mount element.
 */
export async function fetchAndRenderChunkDiff(
  vectorBridge: VectorBridge,
  chunk: Chunk,
  mountEl: HTMLElement
): Promise<void> {
  mountEl.empty();
  const res = await compareChunk(vectorBridge, chunk);
  mountEl.empty();
  if (!res.exists || !res.changed) return;
  const view = renderInlineDiff(res.previous || '', chunk.contentRaw || '');
  view.style.cssText = 'margin-top:4px;border:1px solid var(--background-modifier-border);border-radius:6px;padding:6px;';
  mountEl.appendChild(view);
}


