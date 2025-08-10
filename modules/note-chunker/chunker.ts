/**
 * Obsidian Note Chunker
 * Description: High-level function that composes parsing, grouping, splitting and builds final chunks.
 */

import type { CachedMetadataLike } from './cache-types.js';
import { groupShortListItems } from './grouping.js';
import { splitLongParagraphs } from './splitting.js';
import { extractBlockId, toHash, buildEmbeddingText } from './id.js';
import { normalizeMarkdown, sha256 } from './utils.js';
import type { Chunk, ChunkOptions, ChunkNoteContext, ChunkPayloadMeta } from './types.js';
import { buildBlocksFromCache } from './cache-blocks.js';

/**
 * Chunk a markdown note according to the specification.
 */
export function chunkNote(markdown: string, context: ChunkNoteContext, options: ChunkOptions = {}, cache: CachedMetadataLike): Chunk[] {
  const merged: Required<ChunkOptions> = {
    longParagraphWordThreshold: 300,
    listShortCharThreshold: 120,
    listGroupMin: 3,
    listGroupMax: 7,
    maxChunksSoft: 50,
    ...options
  };

  // Use original markdown for cache-based parsing (positions/offsets must match original).
  const blocks = buildBlocksFromCache(markdown, cache);
  // Normalize only for hashing/embedding text.
  const normalized = normalizeMarkdown(markdown);
  const grouped = groupShortListItems(blocks, merged);
  const splitted = splitLongParagraphs(grouped, merged);

  const noteHash = toHash(normalized);

  const chunks: Chunk[] = [];
  for (let i = 0; i < splitted.length; i++) {
    const b = splitted[i];
    const contentForEmbedding = buildEmbeddingText(
      b.headingPath || [],
      (b as any).parentItemText,
      normalizeMarkdown(b.text)
    );
    const explicitBlockId = extractBlockId(b.text);
    const chunkId = explicitBlockId || toHash(contentForEmbedding);
    const contentHash = toHash(b.text);
    const section = (b.headingPath || []).slice(-1)[0] || '';
 

    const meta: ChunkPayloadMeta = {
      originalId: context.originalId,
      chunkId,
      noteHash,
      contentHash,
      contentType: 'obsidian_note',
      chunkType: b.type as any,
      chunkIndex: i,
      section,
      headingsPath: b.headingPath || [],
      listDepth: (b as any).listDepth,
      itemIndex: (b as any).itemIndex,
      obsidian: {
        path: context.notePath,
        tags: context.tags || [],
        aliases: context.aliases || []
      },
      createdAtTs: Date.now(),
      updatedAtTs: Date.now(),
      language: context.frontmatter?.language || undefined,
    };

    chunks.push({
      chunkId,
      chunkType: b.type as any,
      headingsPath: b.headingPath || [],
      section,
      listDepth: (b as any).listDepth,
      itemIndex: (b as any).itemIndex,
      contentRaw: b.text,
      contentForEmbedding,
      meta,
    });
  }

  for (let i = 0; i < chunks.length; i++) {
    chunks[i].meta.prevChunkId = i > 0 ? chunks[i - 1].chunkId : null;
    chunks[i].meta.nextChunkId = i < chunks.length - 1 ? chunks[i + 1].chunkId : null;
  }

  return chunks.length > merged.maxChunksSoft ? chunks.slice(0, merged.maxChunksSoft) : chunks;
}


