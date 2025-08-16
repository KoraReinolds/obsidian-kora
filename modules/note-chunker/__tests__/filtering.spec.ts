/**
 * Tests for chunk filtering rules
 */
import { describe, it, expect } from 'vitest';
import { chunkNote } from '../index.js';
import { makeCacheFromMarkdown } from './cache-fixtures.js';

const baseContext = {
  notePath: 'test.md',
  originalId: 'test-id',
  frontmatter: { 'date created': '2024-01-01' },
  tags: [],
  aliases: []
};

describe('Chunk Filtering', () => {
  it('should ignore code blocks', () => {
    const md = `# Heading

Normal paragraph.

\`\`\`javascript
console.log('This is a code block');
const test = 'Should be ignored';
\`\`\`

Another paragraph.`;
    
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, {}, cache);
    
    // Should have 2 chunks: "Normal paragraph." and "Another paragraph."
    // Code block should be ignored
    expect(chunks.length).toBe(2);
    expect(chunks[0].contentRaw).toBe('Normal paragraph.');
    expect(chunks[1].contentRaw).toBe('Another paragraph.');
    
    // Ensure no code chunks are present
    const codeChunks = chunks.filter(c => c.chunkType === 'code');
    expect(codeChunks.length).toBe(0);
  });

  it('should ignore embed blocks', () => {
    const md = `# Heading

Normal paragraph.

![[Home#^b68f46]]

Another paragraph.`;
    
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, {}, cache);
    
    // Should have 2 chunks: "Normal paragraph." and "Another paragraph."
    expect(chunks.length).toBe(2);
    expect(chunks[0].contentRaw).toBe('Normal paragraph.');
    expect(chunks[1].contentRaw).toBe('Another paragraph.');
  });

  it('should ignore horizontal separators', () => {
    const md = `# Heading

First paragraph.

---

Second paragraph.

-----

Third paragraph.`;
    
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, {}, cache);
    
    // Should have 3 chunks, no separators
    expect(chunks.length).toBe(3);
    expect(chunks[0].contentRaw).toBe('First paragraph.');
    expect(chunks[1].contentRaw).toBe('Second paragraph.');
    expect(chunks[2].contentRaw).toBe('Third paragraph.');
  });

  it('should ignore callout blocks', () => {
    const md = `# Heading

Normal paragraph.

> [!faq]+ Узнать больше об Усилиях
> - [[ACE]]
> - [[Почему усилия освобождают]]
> - [[4 вида усилий]]

Another paragraph.`;
    
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, {}, cache);
    
    // Should have 2 chunks: "Normal paragraph." and "Another paragraph."
    expect(chunks.length).toBe(2);
    expect(chunks[0].contentRaw).toBe('Normal paragraph.');
    expect(chunks[1].contentRaw).toBe('Another paragraph.');
  });

  it('should ignore different types of callouts', () => {
    const md = `# Heading

Text before.

> [!note] Simple note

> [!warning]+ Expandable warning
> Content here

> [!info]- Collapsed info
> More content

Text after.`;
    
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, {}, cache);
    
    // Should have 2 chunks: before and after text
    expect(chunks.length).toBe(2);
    expect(chunks[0].contentRaw).toBe('Text before.');
    expect(chunks[1].contentRaw).toBe('Text after.');
  });

  it('should process regular content normally', () => {
    const md = `# Heading

This is a normal paragraph.

## Subheading

- List item 1
- List item 2

Another paragraph with **bold** text.`;
    
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, {}, cache);
    
    // Should have normal chunks for regular content
    expect(chunks.length).toBeGreaterThan(0);
    
    // Check that normal content is preserved
    const hasNormalParagraph = chunks.some(c => c.contentRaw.includes('This is a normal paragraph.'));
    const hasBoldText = chunks.some(c => c.contentRaw.includes('Another paragraph with **bold** text.'));
    
    expect(hasNormalParagraph).toBe(true);
    expect(hasBoldText).toBe(true);
  });

  it('should handle complex mixed content with code blocks', () => {
    const md = `# Test Note

Regular intro paragraph.

![[SomeFile#heading]]

---

\`\`\`python
def hello_world():
    print("Hello, world!")
\`\`\`

> [!tip] This is a tip
> With some content
> And multiple lines

Normal content here.

\`\`\`bash
npm install
npm run build
\`\`\`

> [!warning]+ Warning
> - Point 1  
> - Point 2

Final paragraph.`;
    
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, {}, cache);
    
    // Should only have regular content, no embeds, separators, callouts, or code blocks
    expect(chunks.length).toBe(3);
    expect(chunks[0].contentRaw).toBe('Regular intro paragraph.');
    expect(chunks[1].contentRaw).toBe('Normal content here.');
    expect(chunks[2].contentRaw).toBe('Final paragraph.');
    
    // Ensure no code chunks are present
    const codeChunks = chunks.filter(c => c.chunkType === 'code');
    expect(codeChunks.length).toBe(0);
  });

  it('should handle complex mixed content', () => {
    const md = `# Test Note

Regular intro paragraph.

![[SomeFile#heading]]

---

> [!tip] This is a tip
> With some content
> And multiple lines

Normal content here.

> [!warning]+ Warning
> - Point 1  
> - Point 2

Final paragraph.`;
    
    const cache = makeCacheFromMarkdown(md);
    const chunks = chunkNote(md, baseContext, {}, cache);
    
    // Should only have regular content, no embeds, separators, or callouts
    expect(chunks.length).toBe(3);
    expect(chunks[0].contentRaw).toBe('Regular intro paragraph.');
    expect(chunks[1].contentRaw).toBe('Normal content here.');
    expect(chunks[2].contentRaw).toBe('Final paragraph.');
  });
});