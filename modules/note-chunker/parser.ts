/**
 * Parser
 * Description: Parse normalized markdown into structural blocks with heading context.
 */

import type { ChunkType } from './types';

export interface ParsedBlock {
  type: ChunkType;
  text: string;
  headingPath: string[];
  listDepth?: number;
  parentItemText?: string;
  itemIndex?: number;
}

/**
 * Parse markdown into blocks capturing headings, lists, code, table, quote, paragraphs.
 */
export function parseBlocks(markdown: string): ParsedBlock[] {
  const lines = markdown.split('\n');
  const headingPath: string[] = [];
  const blocks: ParsedBlock[] = [];

  let currentParagraph: string[] = [];
  let currentParent: string | undefined;
  let listItemCounterStack: number[] = [];
  let inCode = false; let codeFence = '';
  let tableBuffer: string[] = [];

  const flushParagraph = () => {
    const text = currentParagraph.join(' ').trim();
    if (text) blocks.push({ type: 'paragraph', text, headingPath: [...headingPath] });
    currentParagraph = [];
  };

  const pushListItem = (text: string, depth: number, parent: string | undefined, itemIndex: number) => {
    blocks.push({ type: 'list_item', text, headingPath: [...headingPath], listDepth: depth, parentItemText: parent, itemIndex });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fenceMatch = line.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      if (!inCode) {
        flushParagraph();
        inCode = true; codeFence = fence; tableBuffer = [];
        blocks.push({ type: 'code', text: line + '\n', headingPath: [...headingPath] });
      } else if (inCode && fence.startsWith(codeFence)) {
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'code') last.text += line + '\n';
        inCode = false; codeFence = '';
      } else {
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'code') last.text += line + '\n';
      }
      continue;
    }

    if (inCode) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'code') last.text += line + '\n';
      continue;
    }

    if (/^\|.*\|$/.test(line)) {
      flushParagraph();
      tableBuffer.push(line);
      const next = lines[i + 1] || '';
      if (!/^\|.*\|$/.test(next)) {
        const text = tableBuffer.join('\n');
        blocks.push({ type: 'table', text, headingPath: [...headingPath] });
        tableBuffer = [];
      }
      continue;
    } else if (tableBuffer.length > 0) {
      const text = tableBuffer.join('\n');
      blocks.push({ type: 'table', text, headingPath: [...headingPath] });
      tableBuffer = [];
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const title = heading[2].trim();
      headingPath.splice(level - 1);
      headingPath[level - 1] = title;
      currentParent = undefined;
      listItemCounterStack = listItemCounterStack.slice(0, level);
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      const quoteText = line.replace(/^>\s?/, '');
      blocks.push({ type: 'quote', text: quoteText, headingPath: [...headingPath] });
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*+]\s+|\d+\.[\)\s]+)/);
    if (listMatch) {
      flushParagraph();
      const indent = listMatch[1]?.length ?? 0;
      const depth = Math.floor(indent / 2);
      const itemText = line.replace(/^(\s*)([-*+]\s+|\d+\.[\)\s]+)/, '').trim();

      if (listItemCounterStack.length <= depth) {
        listItemCounterStack[depth] = 0;
      }
      listItemCounterStack = listItemCounterStack.slice(0, depth + 1);
      listItemCounterStack[depth] = (listItemCounterStack[depth] || 0) + 1;

      if (depth === 0) currentParent = undefined;
      const parent = depth > 0 ? currentParent : undefined;
      if (depth > 0 && !parent) currentParent = itemText;
      pushListItem(itemText, depth, parent, listItemCounterStack[depth]);
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushParagraph();
      continue;
    }

    currentParagraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
}


