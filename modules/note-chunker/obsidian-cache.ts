/**
 * Obsidian Cache Adapter
 * Description: Utilities to consume Obsidian's getFileCache and produce parsed blocks.
 */

import type { App, TFile } from 'obsidian';
import type { ParsedBlock } from './parser-types.js';
import { buildBlocksFromCache } from './cache-blocks.js';
import type { CachedMetadataLike } from './cache-types.js';

/**
 * Convenience: return both markdown and ParsedBlock[] from a file in one call.
 */
export async function getMarkdownAndBlocks(app: App, file: TFile): Promise<{ markdown: string; blocks: ParsedBlock[] }>{
  const markdown = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file) as unknown as CachedMetadataLike | null;
  const blocks = cache ? buildBlocksFromCache(markdown, cache) : (markdown.trim() ? [{ type: 'paragraph', text: markdown.trim(), headingPath: [] }] as ParsedBlock[] : []);
  return { markdown, blocks };
}



