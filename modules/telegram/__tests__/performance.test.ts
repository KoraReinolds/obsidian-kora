/**
 * Performance and benchmark tests for MarkdownToTelegramConverter
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { MarkdownToTelegramConverter } from '../markdown-to-telegram-converter';

describe('MarkdownToTelegramConverter - Performance Tests', () => {
	let converter: MarkdownToTelegramConverter;

	beforeEach(() => {
		converter = new MarkdownToTelegramConverter();
	});

	describe('Benchmarks', () => {
		test('should handle small content quickly', () => {
			const content = '**Bold** *italic* `code` [spoiler]';

			const start = performance.now();
			const result = converter.convert(content);
			const end = performance.now();

			expect(end - start).toBeLessThan(10); // Under 10ms
			expect(result.entities).toHaveLength(4);
		});

		test('should handle medium content efficiently', () => {
			const content = Array(100)
				.fill('**Bold** *italic* `code` [spoiler] text')
				.join('\n');

			const start = performance.now();
			const result = converter.convert(content);
			const end = performance.now();

			expect(end - start).toBeLessThan(100); // Under 100ms
			expect(result.entities.length).toBe(400); // 4 entities * 100 lines
		});

		test('should handle large content within time limit', () => {
			const content = Array(1000)
				.fill('**Bold** text with *formatting*')
				.join('\n');

			const start = performance.now();
			const result = converter.convert(content);
			const end = performance.now();

			expect(end - start).toBeLessThan(1000); // Under 1 second
			expect(result.entities.length).toBe(2000); // 2 entities * 1000 lines
		});

		test('should scale linearly with content size', () => {
			const baseLine = '**Bold** *italic* text';
			const times: number[] = [];
			const sizes = [50, 100, 200, 400];

			sizes.forEach(size => {
				const content = Array(size).fill(baseLine).join('\n');

				const start = performance.now();
				converter.convert(content);
				const end = performance.now();

				times.push(end - start);
			});

			// Should scale roughly linearly (within 3x factor)
			const growthRatio = times[3] / times[0];
			const expectedRatio = sizes[3] / sizes[0]; // 8x

			expect(growthRatio).toBeLessThan(expectedRatio * 3);
		});
	});

	describe('Memory Efficiency', () => {
		test('should not leak memory with repeated conversions', () => {
			const content = '**Bold** *italic* `code` and >quote text';

			// Warm up
			for (let i = 0; i < 10; i++) {
				converter.convert(content);
			}

			// Measure baseline
			const baseline = process.memoryUsage().heapUsed;

			// Perform many conversions
			for (let i = 0; i < 1000; i++) {
				converter.convert(content);
			}

			// Force garbage collection if available
			if (global.gc) {
				global.gc();
			}

			const afterTest = process.memoryUsage().heapUsed;
			const growth = afterTest - baseline;

			// Memory growth should be minimal (less than 10MB)
			expect(growth).toBeLessThan(10 * 1024 * 1024);
		});

		test('should handle large strings without excessive memory usage', () => {
			const largeString = 'A'.repeat(100000) + '**Bold**' + 'B'.repeat(100000);

			const beforeMem = process.memoryUsage().heapUsed;
			const result = converter.convert(largeString);
			const afterMem = process.memoryUsage().heapUsed;

			const memoryUsed = afterMem - beforeMem;

			// Should not use more than 4x the input size in memory
			expect(memoryUsed).toBeLessThan(largeString.length * 4);
			expect(result.entities).toHaveLength(1);
		});
	});

	describe('Complex Document Performance', () => {
		test('should handle realistic Obsidian note quickly', () => {
			const obsidianNote = `---
title: Complex Note
tags: [test, performance]
---

# Main Title

## Section 1

This is a paragraph with **bold**, *italic*, \`code\`, and [spoiler] text.

>[! info]- Expandable Note
>This contains **nested formatting** and *multiple lines*
>With \`code snippets\` and [hidden content]

### Subsection

\`\`\`javascript
function complexExample() {
  const data = {
    items: ['one', 'two', 'three'],
    process: (item) => item.toUpperCase()
  };
  return data.items.map(data.process);
}
\`\`\`

Another paragraph with links to [GitHub](https://github.com) and **important** notes.

>[! warning] Security Note
>Never share your **API keys** in [public repositories]

## Lists and Tasks

- [x] Completed task with **bold** text
- [ ] Pending task with *italic* text
- [ ] Another task with \`code\`

### More Content

1. **First** item with ~~strikethrough~~
2. *Second* item with [spoiler content]
3. Third item with \`inline code\`

>[! quote]- Long Quote
>This is a longer quote that spans multiple lines
>and contains various **formatting** elements including
>*italic text*, \`code snippets\`, and [hidden parts].
>
>It also has line breaks and continues for several
>lines to test the blockquote processing performance.

## Final Section

Text with mixed **bold *italic* code** formatting.

\`\`\`python
def final_example():
    """A final code example"""
    return "performance test complete"
\`\`\``;

			const start = performance.now();
			const result = converter.convert(obsidianNote);
			const end = performance.now();

			expect(end - start).toBeLessThan(50); // Under 50ms for realistic note
			expect(result.entities.length).toBeGreaterThan(20);
			expect(result.text.length).toBeGreaterThan(500);
		});

		test('should handle documentation with many code blocks', () => {
			const documentation = Array(20)
				.fill(
					`
### API Endpoint

\`\`\`http
GET /api/users/{id}
\`\`\`

**Description**: Get user by ID

**Parameters**:
- \`id\`: User identifier (*required*)

**Response**:
\`\`\`json
{
  "id": 123,
  "name": "John Doe",
  "email": "john@example.com"
}
\`\`\`

>[! note] Important
>This endpoint requires **authentication** via [API key]
      `
				)
				.join('\n');

			const start = performance.now();
			const result = converter.convert(documentation);
			const end = performance.now();

			expect(end - start).toBeLessThan(200); // Under 200ms

			// Should have many code blocks
			const codeBlocks = result.entities.filter(e => e.type === 'pre');
			expect(codeBlocks.length).toBe(40); // 2 per section * 20 sections
		});
	});

	describe('Edge Case Performance', () => {
		test('should handle many small entities efficiently', () => {
			const manySmallEntities = Array(1000).fill('[s]').join(' ');

			const start = performance.now();
			const result = converter.convert(manySmallEntities);
			const end = performance.now();

			expect(end - start).toBeLessThan(500); // Under 500ms
			expect(result.entities).toHaveLength(1000);
		});

		test('should handle deeply nested formatting', () => {
			let nested = 'text';
			for (let i = 0; i < 10; i++) {
				nested = `**bold ${nested} bold**`;
				nested = `*italic ${nested} italic*`;
			}

			const start = performance.now();
			const result = converter.convert(nested);
			const end = performance.now();

			expect(end - start).toBeLessThan(100); // Under 100ms
			expect(result.entities.length).toBeGreaterThan(0);
		});

		test('should handle very long blockquotes', () => {
			const longLines = Array(100)
				.fill('>Long line with **bold** and *italic* text')
				.join('\n');

			const start = performance.now();
			const result = converter.convert(longLines);
			const end = performance.now();

			expect(end - start).toBeLessThan(200); // Under 200ms
			expect(result.entities).toHaveLength(201); // 1 blockquote + 200 formatting entities
		});

		test('should handle mixed content types efficiently', () => {
			const mixedContent = `
# Header

**Bold** and *italic* text.

\`\`\`javascript
// Code block
const x = 42;
\`\`\`

>[! note]- Collapsible
>With **nested** formatting

Regular text with [spoiler] and \`code\`.

>[! warning] Warning
>Important **message** here

More text and [link](url).

\`\`\`python
# Another code block
def func():
    return True
\`\`\`
      `.repeat(50);

			const start = performance.now();
			const result = converter.convert(mixedContent);
			const end = performance.now();

			expect(end - start).toBeLessThan(500); // Under 500ms
			expect(result.entities.length).toBeGreaterThan(100);
		});
	});

	describe('Regression Tests', () => {
		test('should maintain performance with unicode content', () => {
			const unicodeContent = Array(500)
				.fill('**粗体** *斜体* `代码` [剧透] 🎉')
				.join('\n');

			const start = performance.now();
			const result = converter.convert(unicodeContent);
			const end = performance.now();

			expect(end - start).toBeLessThan(300); // Under 300ms
			expect(result.entities).toHaveLength(2000); // 4 per line * 500 lines
		});

		test('should handle truncation efficiently', () => {
			const longContent = Array(10000).fill('**Bold text**').join(' ');

			const start = performance.now();
			const result = converter.convert(longContent, { maxLength: 4096 });
			const end = performance.now();

			expect(end - start).toBeLessThan(200); // Under 200ms
			expect(result.truncated).toBe(true);
			expect(result.text.length).toBeLessThanOrEqual(4096);
		});
	});

	describe('Comparative Performance', () => {
		test('should perform consistently across different content types', () => {
			const testCases = [
				{ name: 'Plain text', content: 'A'.repeat(10000) },
				{ name: 'Bold only', content: Array(1000).fill('**bold**').join(' ') },
				{
					name: 'Mixed inline',
					content: Array(500).fill('**bold** *italic* `code`').join(' '),
				},
				{
					name: 'Code blocks',
					content: Array(100).fill('```\ncode\n```').join('\n'),
				},
				{
					name: 'Blockquotes',
					content: Array(1000).fill('>quote line').join('\n'),
				},
			];

			const results = testCases.map(({ name, content }) => {
				const start = performance.now();
				converter.convert(content);
				const end = performance.now();

				return { name, time: end - start };
			});

			// All should complete within reasonable time
			results.forEach(({ name, time }) => {
				expect(time).toBeLessThan(1000); // Under 1 second
				console.log(`${name}: ${time.toFixed(2)}ms`);
			});

			// Performance should be relatively consistent
			const times = results.map(r => r.time);
			const maxTime = Math.max(...times);
			const minTime = Math.min(...times);

			// Max should not be more than 10x min (excluding outliers)
			expect(maxTime / minTime).toBeLessThan(10);
		});
	});
});
