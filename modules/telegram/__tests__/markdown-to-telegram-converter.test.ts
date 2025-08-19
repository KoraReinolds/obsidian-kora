/**
 * Unit tests for MarkdownToTelegramConverter
 * Comprehensive test coverage for all markdown conversion features
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { MarkdownToTelegramConverter, ConversionOptions, TelegramMessageEntity } from '../markdown-to-telegram-converter';

describe('MarkdownToTelegramConverter', () => {
  let converter: MarkdownToTelegramConverter;

  beforeEach(() => {
    converter = new MarkdownToTelegramConverter();
    // Mock console.log to avoid cluttering test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Functionality', () => {
    test('should handle empty string', () => {
      const result = converter.convert('');
      expect(result.text).toBe('');
      expect(result.entities).toEqual([]);
      expect(result.truncated).toBe(false);
    });

    test('should handle plain text without markdown', () => {
      const text = 'This is plain text without any formatting.';
      const result = converter.convert(text);
      expect(result.text).toBe(text);
      expect(result.entities).toEqual([]);
    });

    test('should handle whitespace normalization', () => {
      const result = converter.convert('  \n\n\nHello\n\n\n\nWorld\n\n\n  ');
      expect(result.text).toBe('Hello\n\nWorld');
    });
  });

  describe('Frontmatter Removal', () => {
    test('should remove YAML frontmatter by default', () => {
      const markdown = `---
title: Test
author: User
---

Content here`;
      const result = converter.convert(markdown);
      expect(result.text).toBe('Content here');
    });

    test('should preserve frontmatter when disabled', () => {
      const markdown = `---
title: Test
---

Content`;
      const result = converter.convert(markdown, { removeFrontmatter: false });
      expect(result.text).toContain('---\ntitle: Test\n---');
    });

    test('should handle malformed frontmatter', () => {
      const markdown = `---
title: Test
Content without closing`;
      const result = converter.convert(markdown);
      expect(result.text).toContain('title: Test');
    });
  });

  describe('H1 Headers', () => {
    test('should remove H1 headers by default', () => {
      const markdown = `# Main Title

Content here`;
      const result = converter.convert(markdown);
      expect(result.text).toBe('Content here');
    });

    test('should preserve H1 headers when disabled', () => {
      const markdown = `# Main Title

Content`;
      const result = converter.convert(markdown, { removeH1Headers: false });
      expect(result.text).toContain('# Main Title');
    });

    test('should handle multiple H1 headers', () => {
      const markdown = `# First Title
# Second Title

Content`;
      const result = converter.convert(markdown);
      expect(result.text).toBe('Content');
    });
  });

  describe('Bold Formatting', () => {
    test('should convert **bold** to entity', () => {
      const result = converter.convert('This is **bold** text');
      expect(result.text).toBe('This is bold text');
      expect(result.entities).toContainEqual({
        type: 'bold',
        offset: 8,
        length: 4
      });
    });

    test('should convert __bold__ to entity', () => {
      const result = converter.convert('This is __bold__ text');
      expect(result.text).toBe('This is bold text');
      expect(result.entities).toContainEqual({
        type: 'bold',
        offset: 8,
        length: 4
      });
    });

    test('should handle multiple bold sections', () => {
      const result = converter.convert('**First** and **second** bold');
      expect(result.text).toBe('First and second bold');
      expect(result.entities).toHaveLength(2);
      expect(result.entities[0]).toEqual({ type: 'bold', offset: 0, length: 5 });
      expect(result.entities[1]).toEqual({ type: 'bold', offset: 10, length: 6 });
    });

    test('should handle nested formatting with bold', () => {
      const result = converter.convert('**Bold with *italic* inside**');
      expect(result.text).toBe('Bold with italic inside');
      expect(result.entities).toContainEqual({ type: 'bold', offset: 0, length: 23 });
      expect(result.entities).toContainEqual({ type: 'italic', offset: 10, length: 6 });
    });
  });

  describe('Italic Formatting', () => {
    test('should convert *italic* to entity', () => {
      const result = converter.convert('This is *italic* text');
      expect(result.text).toBe('This is italic text');
      expect(result.entities).toContainEqual({
        type: 'italic',
        offset: 8,
        length: 6
      });
    });

    test('should convert _italic_ to entity', () => {
      const result = converter.convert('This is _italic_ text');
      expect(result.text).toBe('This is italic text');
      expect(result.entities).toContainEqual({
        type: 'italic',
        offset: 8,
        length: 6
      });
    });

    test('should not interfere with bold asterisks', () => {
      const result = converter.convert('**bold** and *italic*');
      expect(result.text).toBe('bold and italic');
      expect(result.entities).toHaveLength(2);
      expect(result.entities).toContainEqual({ type: 'bold', offset: 0, length: 4 });
      expect(result.entities).toContainEqual({ type: 'italic', offset: 9, length: 6 });
    });
  });

  describe('Code Formatting', () => {
    test('should convert inline code', () => {
      const result = converter.convert('Use `console.log()` function');
      expect(result.text).toBe('Use console.log() function');
      expect(result.entities).toContainEqual({
        type: 'code',
        offset: 4,
        length: 13
      });
    });

    test('should convert code blocks', () => {
      const markdown = `\`\`\`javascript
console.log('Hello');
\`\`\``;
      const result = converter.convert(markdown);
      expect(result.text).toBe("console.log('Hello');");
      expect(result.entities).toContainEqual({
        type: 'pre',
        offset: 0,
        length: 21,
        language: 'javascript'
      });
    });

    test('should handle code blocks without language', () => {
      const markdown = `\`\`\`
some code
\`\`\``;
      const result = converter.convert(markdown);
      expect(result.text).toBe('some code');
      expect(result.entities).toContainEqual({
        type: 'pre',
        offset: 0,
        length: 9,
        language: 'text'
      });
    });

    test('should protect code blocks from other formatting', () => {
      const markdown = `\`\`\`
**this should not be bold**
\`\`\``;
      const result = converter.convert(markdown);
      expect(result.text).toBe('**this should not be bold**');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].type).toBe('pre');
    });
  });

  describe('Strikethrough Formatting', () => {
    test('should convert ~~strikethrough~~', () => {
      const result = converter.convert('This is ~~crossed out~~ text');
      expect(result.text).toBe('This is crossed out text');
      expect(result.entities).toContainEqual({
        type: 'strikethrough',
        offset: 8,
        length: 11
      });
    });
  });

  describe('Spoiler Formatting', () => {
    test('should convert [spoiler] to spoiler entity', () => {
      const result = converter.convert('This is [hidden] text');
      expect(result.text).toBe('This is hidden text');
      expect(result.entities).toContainEqual({
        type: 'spoiler',
        offset: 8,
        length: 6
      });
    });

    test('should not conflict with links', () => {
      const result = converter.convert('This is [link](url) and [spoiler]');
      expect(result.text).toBe('This is link and spoiler');
      expect(result.entities).toContainEqual({ type: 'text_link', offset: 8, length: 4, url: 'url' });
      expect(result.entities).toContainEqual({ type: 'spoiler', offset: 17, length: 7 });
    });

    test('should handle multiple spoilers', () => {
      const result = converter.convert('[First] and [second] spoilers');
      expect(result.text).toBe('First and second spoilers');
      expect(result.entities).toHaveLength(2);
      expect(result.entities[0]).toEqual({ type: 'spoiler', offset: 0, length: 5 });
      expect(result.entities[1]).toEqual({ type: 'spoiler', offset: 10, length: 6 });
    });
  });

  describe('Links', () => {
    test('should convert markdown links', () => {
      const result = converter.convert('Visit [Google](https://google.com) for search');
      expect(result.text).toBe('Visit Google for search');
      expect(result.entities).toContainEqual({
        type: 'text_link',
        offset: 6,
        length: 6,
        url: 'https://google.com'
      });
    });

    test('should remove links when preserveLinks is false', () => {
      const result = converter.convert('Visit [Google](https://google.com)', { preserveLinks: false });
      expect(result.text).toBe('Visit Google');
      expect(result.entities).toEqual([]);
    });

    test('should handle multiple links', () => {
      const result = converter.convert('[First](url1) and [second](url2) links');
      expect(result.text).toBe('First and second links');
      expect(result.entities).toHaveLength(2);
      expect(result.entities[0]).toEqual({ type: 'text_link', offset: 0, length: 5, url: 'url1' });
      expect(result.entities[1]).toEqual({ type: 'text_link', offset: 10, length: 6, url: 'url2' });
    });
  });

  describe('Headers (H2-H6)', () => {
    test('should convert headers to bold text', () => {
      const result = converter.convert('## Section\n### Subsection');
      expect(result.text).toBe('*Section*\n*Subsection*');
      // Note: The * characters will be processed as italic entities
      expect(result.entities).toHaveLength(2);
    });
  });

  describe('Blockquotes', () => {
    test('should handle simple blockquote', () => {
      const result = converter.convert('> This is a quote\n> Second line');
      expect(result.text).toBe('This is a quote\nSecond line');
      expect(result.entities).toContainEqual({
        type: 'blockquote',
        offset: 0,
        length: 27
      });
    });

    test('should handle expandable blockquote (collapsed)', () => {
      const result = converter.convert('>[! note]- Collapsed note\n>Content here\n>More content');
      expect(result.text).toBe('Collapsed note\nContent here\nMore content');
      expect(result.entities).toContainEqual({
        type: 'expandable_blockquote',
        offset: 0,
        length: 43
      });
    });

    test('should handle expandable blockquote (expanded)', () => {
      const result = converter.convert('>[! note] Expanded note\n>Content here');
      expect(result.text).toBe('Expanded note\nContent here');
      expect(result.entities).toContainEqual({
        type: 'blockquote',
        offset: 0,
        length: 25
      });
    });

    test('should handle formatting within blockquotes', () => {
      const result = converter.convert('>[! note]-\n>**Bold** and *italic*\n>Normal text');
      expect(result.text).toBe('Bold and italic\nNormal text');
      
      // Should have blockquote entity
      expect(result.entities).toContainEqual({
        type: 'expandable_blockquote',
        offset: 0,
        length: 27
      });
      
      // Should have bold entity within blockquote
      expect(result.entities).toContainEqual({
        type: 'bold',
        offset: 0,
        length: 4
      });
      
      // Should have italic entity within blockquote
      expect(result.entities).toContainEqual({
        type: 'italic',
        offset: 9,
        length: 6
      });
    });

    test('should handle multiple separate blockquotes', () => {
      const result = converter.convert('> First quote\n\nRegular text\n\n> Second quote');
      expect(result.text).toBe('First quote\n\nRegular text\n\nSecond quote');
      expect(result.entities).toHaveLength(2);
      expect(result.entities[0]).toEqual({ type: 'blockquote', offset: 0, length: 11 });
      expect(result.entities[1]).toEqual({ type: 'blockquote', offset: 26, length: 12 });
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle text with code blocks and spoilers', () => {
      const markdown = `\`\`\`
codeblock1
\`\`\`

\`\`\`
codeblock2
\`\`\`

text with [spoiler] here`;

      const result = converter.convert(markdown);
      expect(result.text).toBe('codeblock1\n\ncodeblock2\n\ntext with spoiler here');
      
      // Should have 2 code blocks and 1 spoiler
      expect(result.entities).toHaveLength(3);
      expect(result.entities.filter(e => e.type === 'pre')).toHaveLength(2);
      expect(result.entities.filter(e => e.type === 'spoiler')).toHaveLength(1);
      
      // Spoiler should be at correct position
      const spoilerEntity = result.entities.find(e => e.type === 'spoiler');
      expect(spoilerEntity?.offset).toBe(34); // After the two code blocks
      expect(spoilerEntity?.length).toBe(7);
    });

    test('should handle mixed formatting outside blockquotes', () => {
      const result = converter.convert('**Bold** *italic* `code` [spoiler] and ~~strike~~');
      expect(result.text).toBe('Bold italic code spoiler and strike');
      expect(result.entities).toHaveLength(5);
      
      expect(result.entities).toContainEqual({ type: 'bold', offset: 0, length: 4 });
      expect(result.entities).toContainEqual({ type: 'italic', offset: 5, length: 6 });
      expect(result.entities).toContainEqual({ type: 'code', offset: 12, length: 4 });
      expect(result.entities).toContainEqual({ type: 'spoiler', offset: 17, length: 7 });
      expect(result.entities).toContainEqual({ type: 'strikethrough', offset: 29, length: 6 });
    });

    test('should handle frontmatter, headers, and content', () => {
      const markdown = `---
title: Test
---

# Main Title

## Section

**Bold text** in section`;

      const result = converter.convert(markdown);
      expect(result.text).toBe('*Section*\n\nBold text in section');
      
      // Should have italic from header conversion and bold
      expect(result.entities).toHaveLength(2);
    });

    test('should preserve formatting order and nesting', () => {
      const result = converter.convert('**Bold with *nested italic* and `code`**');
      expect(result.text).toBe('Bold with nested italic and code');
      
      // All should be within the bold entity
      const boldEntity = result.entities.find(e => e.type === 'bold');
      const italicEntity = result.entities.find(e => e.type === 'italic');
      const codeEntity = result.entities.find(e => e.type === 'code');
      
      expect(boldEntity).toEqual({ type: 'bold', offset: 0, length: 32 });
      expect(italicEntity?.offset).toBeGreaterThanOrEqual(0);
      expect(italicEntity?.offset + italicEntity?.length).toBeLessThanOrEqual(32);
      expect(codeEntity?.offset).toBeGreaterThanOrEqual(0);
      expect(codeEntity?.offset + codeEntity?.length).toBeLessThanOrEqual(32);
    });
  });

  describe('Length Limits', () => {
    test('should truncate text when over maxLength', () => {
      const longText = 'A'.repeat(5000);
      const result = converter.convert(longText, { maxLength: 4096 });
      
      expect(result.truncated).toBe(true);
      expect(result.text.length).toBeLessThanOrEqual(4096);
      expect(result.originalLength).toBe(5000);
      expect(result.text).toMatch(/\.\.\.$/);  
    });

    test('should truncate at word boundary when possible', () => {
      const text = 'A'.repeat(4000) + ' ' + 'B'.repeat(200);
      const result = converter.convert(text, { maxLength: 4096 });
      
      expect(result.truncated).toBe(true);
      expect(result.text).not.toContain('B');
      expect(result.text).toMatch(/\.\.\.$/);  
    });

    test('should filter entities for truncated text', () => {
      const text = '**Bold1** ' + 'A'.repeat(4000) + ' **Bold2**';
      const result = converter.convert(text, { maxLength: 4096 });
      
      expect(result.truncated).toBe(true);
      
      // Only entities within the truncated text should remain
      result.entities.forEach(entity => {
        expect(entity.offset + entity.length).toBeLessThanOrEqual(result.text.length);
      });
    });
  });

  describe('Validation', () => {
    test('should validate text length', () => {
      const validation = converter.validateForTelegram('A'.repeat(5000));
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('Text too long: 5000 characters (max 4096)');
    });

    test('should validate empty text', () => {
      const validation = converter.validateForTelegram('   \n\n   ');
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('Text is empty after conversion');
    });

    test('should validate normal text', () => {
      const validation = converter.validateForTelegram('Normal text');
      expect(validation.valid).toBe(true);
      expect(validation.issues).toEqual([]);
    });
  });

  describe('Options', () => {
    test('should respect all conversion options', () => {
      const markdown = `---
title: Test
---

# Title

**Bold** text`;

      const options: ConversionOptions = {
        removeFrontmatter: false,
        removeH1Headers: false,
        maxLength: 50,
        preserveCodeBlocks: false,
        preserveLinks: false
      };

      const result = converter.convert(markdown, options);
      
      expect(result.text).toContain('---');
      expect(result.text).toContain('# Title');
      expect(result.text.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty markdown constructs', () => {
      const result = converter.convert('****  ____ ```` []()\n\n\n');
      expect(result.text.trim()).toBe('');
      expect(result.entities).toEqual([]);
    });

    test('should handle unclosed markdown', () => {
      const result = converter.convert('**Unclosed bold and *unclosed italic');
      // Should not create entities for unclosed markdown
      expect(result.entities).toEqual([]);
    });

    test('should handle special characters', () => {
      const result = converter.convert('Text with émojis 🎉 and símböls');
      expect(result.text).toBe('Text with émojis 🎉 and símböls');
    });

    test('should handle only whitespace', () => {
      const result = converter.convert('   \n\n\t\t   \n  ');
      expect(result.text).toBe('');
    });

    test('should handle malformed blockquotes', () => {
      const result = converter.convert('>[! malformed\n>Missing closing bracket');
      // Should still process as regular blockquote
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].type).toBe('blockquote');
    });
  });

  describe('Entity Sorting and Positioning', () => {
    test('should sort entities by offset', () => {
      const result = converter.convert('`code` **bold** *italic*');
      
      // Entities should be in order of appearance
      expect(result.entities[0].offset).toBeLessThan(result.entities[1].offset);
      expect(result.entities[1].offset).toBeLessThan(result.entities[2].offset);
    });

    test('should handle overlapping entities correctly', () => {
      const result = converter.convert('**Bold with *italic* inside**');
      
      const boldEntity = result.entities.find(e => e.type === 'bold');
      const italicEntity = result.entities.find(e => e.type === 'italic');
      
      // Italic should be contained within bold
      expect(italicEntity?.offset).toBeGreaterThanOrEqual(boldEntity?.offset || 0);
      expect((italicEntity?.offset || 0) + (italicEntity?.length || 0))
        .toBeLessThanOrEqual((boldEntity?.offset || 0) + (boldEntity?.length || 0));
    });
  });
});
