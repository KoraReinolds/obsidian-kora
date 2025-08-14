/**
 * Chunker tests
 * Description: Validates chunk splitting rules to guard against regressions.
 */

import { describe, it, expect } from 'vitest';
import { chunkNote } from '../model/chunker.js';
import { makeCacheFromMarkdown } from './cache-fixtures';
import { readFixture } from './helpers';

const baseContext = {
  notePath: 'Data/Notes/test.md',
  originalId: 'obsidian:Data/Notes/test.md',
  frontmatter: {},
  tags: ['tag1'],
  aliases: ['alias1'],
};

describe('chunkNote', () => {
  it('splits by paragraphs and preserves headingsPath', () => {
    const md = readFixture('simple.md');
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, undefined, cache);
    const texts = chunks.map(c => c.contentRaw);
    expect(texts).toContain('Olive oil is healthy.');
    expect(texts).toContain('Eggs are complete.');
    const fats = chunks.find(c => c.contentRaw.includes('Olive oil'))!;
    expect(fats.headingsPath).toEqual(['Food', 'Fats']);
  });

  it('does not mix content across headings', () => {
    const md = `# H1\npara1\n\n## H2\npara2`;
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, undefined, cache);
    const h1Para = chunks.find(c => c.headingsPath.join('>') === 'H1');
    const h2Para = chunks.find(c => c.headingsPath.join('>') === 'H1>H2');
    expect(h1Para?.contentRaw).toBe('para1');
    expect(h2Para?.contentRaw).toBe('para2');
  });

  it('creates separate chunks for code and table', () => {
    const md = '```js\nconsole.log(1)\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, undefined, cache);
    expect(chunks.find(c => c.chunkType === 'code')).toBeTruthy();
    expect(chunks.find(c => c.chunkType === 'table')).toBeTruthy();
  });

  it('groups short list items and keeps long items separate', () => {
    const md = readFixture('list.md');
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, { listShortCharThreshold: 10, listGroupMin: 3, listGroupMax: 7 }, cache);
    const group = chunks.find(c => c.chunkType === 'list_group');
    const longItem = chunks.find(c => c.chunkType === 'list_item' && c.contentRaw.startsWith('this is a considerably'));
    expect(group).toBeTruthy();
    expect(group?.contentRaw.split('\n').length).toBeGreaterThanOrEqual(3);
    expect(longItem).toBeTruthy();
  });

  it('splits long paragraphs by sentences with overlap', () => {
    const md = `# Long\n${'Sentence. '.repeat(120)}`; // keep synthetic for volume
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, { longParagraphWordThreshold: 10 }, cache);
    const parts = chunks.filter(c => c.chunkType === 'paragraph');
    expect(parts.length).toBeGreaterThan(1);
    // Ensure overlap: there should be repeated substring between consecutive chunks
    const overlapFound = parts.some((c, i) => i > 0 && parts[i - 1].contentRaw.split('.').slice(-2).join('.') && c.contentRaw.includes(parts[i - 1].contentRaw.split('.').slice(-2).join('.')));
    expect(overlapFound).toBe(true);
  });

  it('adds required prefixes to embedding text', () => {
    const md = `# A\n## B\nParent intro:\n- child item\n`;
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, undefined, cache);
    const list = chunks.find(c => c.chunkType === 'list_item')!;
    // Import buildEmbeddingText to test the embedding functionality
    const { buildEmbeddingText } = require('../model/id');
    const embeddingText = buildEmbeddingText(list.headingsPath, list.parentItemText, list.contentRaw);
    expect(embeddingText.startsWith('H: A > B.'))
      .toBe(true);
  });

  it('uses block id when present', () => {
    const md = `para1 ^(abc123)`;
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, undefined, cache);
    expect(chunks[0].chunkId).toContain('^(');
  });

  it('uses uuid when no block id', () => {
    const md = `para2`;
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, undefined, cache);
    expect(chunks[0].chunkId).not.toContain('^(');
    expect(chunks[0].chunkId).toMatch(/[0-9a-fA-F-]{36}/);
  });

  it('caps at maxChunksSoft', () => {
    const md = `# Many\n` + Array.from({ length: 200 }, (_, i) => `para ${i}`).join('\n\n');
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, { maxChunksSoft: 50 }, cache);
    expect(chunks.length).toBeLessThanOrEqual(50);
    expect(chunks.length).toBeGreaterThan(0);
  });
});


