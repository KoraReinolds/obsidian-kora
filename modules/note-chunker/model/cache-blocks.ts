/**
 * Cache Blocks
 * Description: Build parsed blocks using Obsidian's getFileCache() metadata and raw markdown.
 */

import type { ParsedBlock } from './parser-types.js';
import type { CachedMetadataLike } from './cache-types.js';
import { buildHeadingPathResolver } from './cache-types.js';

function sliceByOffsets(text: string, startOffset: number, endOffset: number): string {
  return text.slice(startOffset, endOffset);
}

// heading path resolver moved to cache-types.ts

/**
 * Build ParsedBlock[] from markdown and cached metadata.
 */
export function buildBlocksFromCache(markdown: string, cache: CachedMetadataLike): ParsedBlock[] {
  const sections = (cache.sections || []).slice().sort((a, b) => a.position.start.offset - b.position.start.offset);
  const listItems = (cache.listItems || []).slice().sort((a, b) => a.position.start.offset - b.position.start.offset);
  const getHeadingPathForLine = buildHeadingPathResolver(cache);

  const lines = markdown.split('\n');
  const blocks: ParsedBlock[] = [];

  let listPtr = 0;
  for (const sec of sections) {
    const { type, position } = sec;
    const startLine = position.start.line;
    const endLine = position.end.line;
    const startOffset = position.start.offset;
    const endOffset = position.end.offset;

    if (type === 'heading' || type === 'yaml' || type === 'comment') {
      continue;
    }

    if (type === 'list') {
      const parentTextByDepth: string[] = [];
      const itemIndexByDepth: number[] = [];
      while (listPtr < listItems.length && listItems[listPtr].position.start.offset < endOffset) {
        const li = listItems[listPtr];
        if (li.position.start.offset < startOffset) { listPtr++; continue; }
        if (li.position.start.offset >= endOffset) break;

        const line = li.position.start.line;
        const lineText = lines[line] || '';
        const indent = (lineText.match(/^(\s*)/)?.[1]?.length) || 0;
        const depth = Math.floor(indent / 2);
        const itemRaw = sliceByOffsets(markdown, li.position.start.offset, li.position.end.offset);
        const itemText = itemRaw.replace(/^(\s*)([-*+]\s+|\d+\.[\)\s]+)/, '').trim();

        if (itemIndexByDepth.length <= depth) { itemIndexByDepth[depth] = 0; }
        itemIndexByDepth.splice(depth + 1);
        itemIndexByDepth[depth] = (itemIndexByDepth[depth] || 0) + 1;

        const parent = depth > 0 ? parentTextByDepth[depth - 1] : undefined;
        parentTextByDepth[depth] = itemText;
        parentTextByDepth.splice(depth + 1);

        blocks.push({
          type: 'list_item',
          text: itemText,
          headingPath: getHeadingPathForLine(line),
          listDepth: depth,
          parentItemText: parent,
          itemIndex: itemIndexByDepth[depth],
          position: li.position,
        });
        listPtr++;
      }
      continue;
    }

    if (type === 'paragraph') {
      const text = sliceByOffsets(markdown, startOffset, endOffset).trim();
      if (text) {
        blocks.push({
          type: 'paragraph', text, headingPath: getHeadingPathForLine(startLine),
          position: { start: { line: startLine, offset: startOffset }, end: { line: endLine, offset: endOffset } } as any,
        });
      }
      continue;
    }

    if (type === 'code' || type === 'table' || type === 'blockquote' || type === 'quote') {
      const text = sliceByOffsets(markdown, startOffset, endOffset);
      const mappedType = type === 'blockquote' ? 'quote' : (type as ParsedBlock['type']);
      blocks.push({
        type: mappedType, text, headingPath: getHeadingPathForLine(startLine),
        position: { start: { line: startLine, offset: startOffset }, end: { line: endLine, offset: endOffset } } as any,
      } as ParsedBlock);
      continue;
    }

    // Fallback: treat any other section as paragraph
    const text = sliceByOffsets(markdown, startOffset, endOffset).trim();
    if (text) blocks.push({
      type: 'paragraph', text, headingPath: getHeadingPathForLine(startLine),
      position: { start: { line: startLine, offset: startOffset }, end: { line: endLine, offset: endOffset } } as any,
    });
  }

  return blocks;
}


