/**
 * Grouping
 * Description: Group short list items into list_group blocks.
 */

import type { ChunkOptions } from './types.js';
import type { ParsedBlock } from './parser-types.js';

export function groupShortListItems(blocks: ParsedBlock[], options: Required<ChunkOptions>): ParsedBlock[] {
  const result: ParsedBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== 'list_item' || (b.text?.length || 0) >= options.listShortCharThreshold) {
      result.push(b);
      continue;
    }
    const group: ParsedBlock[] = [b];
    let j = i + 1;
    while (
      j < blocks.length &&
      group.length < options.listGroupMax &&
      blocks[j].type === 'list_item' &&
      (blocks[j].text?.length || 0) < options.listShortCharThreshold &&
      JSON.stringify(blocks[j].headingPath) === JSON.stringify(b.headingPath) &&
      (blocks[j].listDepth || 0) === (b.listDepth || 0)
    ) {
      group.push(blocks[j]);
      j++;
    }

    if (group.length >= options.listGroupMin) {
      const mergedText = group.map(g => `• ${g.text}`).join('\n');
      const parent = group[0].parentItemText;
      result.push({
        type: 'list_group',
        text: mergedText,
        headingPath: [...(b.headingPath || [])],
        listDepth: b.listDepth,
        parentItemText: parent,
        itemIndex: group[0].itemIndex,
        position: {
          start: group[0].position.start,
          end: group[group.length - 1].position.end,
        } as any,
      } as ParsedBlock);
      i = j - 1;
    } else {
      result.push(b);
    }
  }
  return result;
}


