/**
 * Edge cases and stress tests for MarkdownToTelegramConverter
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { MarkdownToTelegramConverter } from '../markdown-to-telegram-converter';

describe('MarkdownToTelegramConverter - Edge Cases', () => {
	let converter: MarkdownToTelegramConverter;

	beforeEach(() => {
		converter = new MarkdownToTelegramConverter();
	});

	describe('Performance Tests', () => {
		test('should handle large documents efficiently', () => {
			const largeContent = Array(1000)
				.fill('**Bold** text with *italic* and `code`')
				.join('\n');

			const startTime = Date.now();
			const result = converter.convert(largeContent);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
			expect(result.entities.length).toBeGreaterThan(0);
		});

		test('should handle deeply nested formatting', () => {
			const deeplyNested =
				'**Bold with *italic with `code with [spoiler]`* end**';
			const result = converter.convert(deeplyNested);

			expect(result.text).toBe('Bold with italic with code with spoiler end');
			expect(result.entities).toHaveLength(4); // bold, italic, code, spoiler
		});

		test('should handle many small entities', () => {
			const manyEntities = Array(100).fill('[s]').join(' ');
			const result = converter.convert(manyEntities);

			expect(result.entities).toHaveLength(100);
			expect(result.entities.every(e => e.type === 'spoiler')).toBe(true);
		});
	});

	describe('Unicode and Special Characters', () => {
		test('should handle emoji correctly', () => {
			const result = converter.convert('**🎉 Party** with *🎊 celebration*');
			expect(result.text).toBe('🎉 Party with 🎊 celebration');
			expect(result.entities).toHaveLength(2);
		});

		test('should handle multibyte characters', () => {
			const result = converter.convert('**Тест** на *русском* языке');
			expect(result.text).toBe('Тест на русском языке');
			expect(result.entities).toContainEqual({
				type: 'bold',
				offset: 0,
				length: 4,
			});
			expect(result.entities).toContainEqual({
				type: 'italic',
				offset: 8,
				length: 7,
			});
		});

		test('should handle Chinese characters', () => {
			const result = converter.convert('**中文** 测试 *格式*');
			expect(result.text).toBe('中文 测试 格式');
			expect(result.entities).toContainEqual({
				type: 'bold',
				offset: 0,
				length: 2,
			});
			expect(result.entities).toContainEqual({
				type: 'italic',
				offset: 6,
				length: 2,
			});
		});

		test('should handle Arabic RTL text', () => {
			const result = converter.convert('**مرحبا** بك في *البرنامج*');
			expect(result.text).toBe('مرحبا بك في البرنامج');
			expect(result.entities).toHaveLength(2);
		});
	});

	describe('Malformed Markdown', () => {
		test('should handle unmatched formatting', () => {
			const result = converter.convert('**Unclosed bold *and italic');
			expect(result.text).toBe('**Unclosed bold *and italic');
			expect(result.entities).toEqual([]);
		});

		test('should handle mixed quotation marks', () => {
			const result = converter.convert(
				'**"Mixed quotes"** and *\'single quotes\'*'
			);
			expect(result.text).toBe('"Mixed quotes" and \'single quotes\'');
			expect(result.entities).toHaveLength(2);
		});

		test('should handle escaped characters', () => {
			const result = converter.convert(
				'\\*\\*Not bold\\*\\* and \\[not spoiler\\]'
			);
			// Note: This behavior depends on implementation - might need adjustment
			expect(result.text).toContain('*');
			expect(result.text).toContain('[');
		});

		test('should handle empty formatting', () => {
			const result = converter.convert('**** __ ** ** [] ``');
			expect(result.entities).toEqual([]);
		});
	});

	describe('Boundary Conditions', () => {
		test('should handle formatting at text boundaries', () => {
			const result = converter.convert('**Start** middle **end**');
			expect(result.text).toBe('Start middle end');
			expect(result.entities).toHaveLength(2);
			expect(result.entities[0]).toEqual({
				type: 'bold',
				offset: 0,
				length: 5,
			});
			expect(result.entities[1]).toEqual({
				type: 'bold',
				offset: 13,
				length: 3,
			});
		});

		test('should handle single character formatting', () => {
			const result = converter.convert('**a** *b* `c` [d]');
			expect(result.text).toBe('a b c d');
			expect(result.entities).toHaveLength(4);
		});

		test('should handle newlines in formatting', () => {
			const result = converter.convert('**Bold\nwith\nnewlines**');
			expect(result.text).toBe('Bold\nwith\nnewlines');
			expect(result.entities).toContainEqual({
				type: 'bold',
				offset: 0,
				length: 17,
			});
		});
	});

	describe('Complex Blockquote Scenarios', () => {
		test('should handle empty blockquotes', () => {
			const result = converter.convert('>[! note]-\n>\n>');
			expect(result.text).toBe('\n');
			expect(result.entities).toHaveLength(1);
			expect(result.entities[0].type).toBe('expandable_blockquote');
		});

		test('should handle blockquotes with only formatting', () => {
			const result = converter.convert('>[! note]-\n>**Bold only**');
			expect(result.text).toBe('Bold only');
			expect(result.entities).toHaveLength(2); // blockquote + bold
		});

		test('should handle nested blockquote-like syntax', () => {
			const result = converter.convert(
				'>[! outer]-\n>> Inner quote\n>Normal line'
			);
			expect(result.text).toBe('> Inner quote\nNormal line');
			expect(result.entities).toHaveLength(1);
			expect(result.entities[0].type).toBe('expandable_blockquote');
		});

		test('should handle blockquotes mixed with code blocks', () => {
			const markdown = `> Quote before

\`\`\`
code block
\`\`\`

> Quote after`;

			const result = converter.convert(markdown);
			expect(result.text).toBe('Quote before\n\ncode block\n\nQuote after');
			expect(result.entities).toHaveLength(3); // 2 blockquotes + 1 code block
		});
	});

	describe('Memory and Resource Tests', () => {
		test('should handle repeated patterns without memory leaks', () => {
			const pattern = '**bold** *italic* `code` [spoiler] ';
			const repeated = pattern.repeat(50);

			const result = converter.convert(repeated);
			expect(result.entities).toHaveLength(200); // 4 entities * 50 repetitions
		});

		test('should handle alternating patterns', () => {
			const alternating = Array(100)
				.fill(null)
				.map((_, i) => (i % 2 === 0 ? '**bold**' : '*italic*'))
				.join(' ');

			const result = converter.convert(alternating);
			expect(result.entities).toHaveLength(100);
			expect(result.entities.filter(e => e.type === 'bold')).toHaveLength(50);
			expect(result.entities.filter(e => e.type === 'italic')).toHaveLength(50);
		});
	});

	describe('Real-world Scenarios', () => {
		test('should handle typical Obsidian note', () => {
			const obsidianNote = `---
title: Meeting Notes
tags: [meeting, project-x]
---

# Meeting with Team Alpha

## Action Items

>[! todo]- Tasks for this week
>- [ ] **Review** the *pull request* #123
>- [ ] Update \`config.json\` file
>- [ ] Test [spoiler alert] the new feature

## Code Examples

\`\`\`javascript
function example() {
  console.log("Hello World");
}
\`\`\`

## Links

Check [GitHub](https://github.com) and [Slack](https://slack.com) for updates.`;

			const result = converter.convert(obsidianNote);

			expect(result.text).not.toContain('---');
			expect(result.text).not.toContain('# Meeting with Team Alpha');
			expect(result.entities.length).toBeGreaterThan(5);
			expect(
				result.entities.some(e => e.type === 'expandable_blockquote')
			).toBe(true);
			expect(result.entities.some(e => e.type === 'pre')).toBe(true);
			expect(result.entities.some(e => e.type === 'text_link')).toBe(true);
		});

		test('should handle documentation with multiple sections', () => {
			const documentation = `## API Reference

### Authentication

Use \`Bearer\` token:

\`\`\`http
Authorization: Bearer [your-token]
\`\`\`

>[! warning]- Security Note
>Never expose your **API key** in [client-side] code

### Examples

**GET** request:
*Returns* user data`;

			const result = converter.convert(documentation);
			expect(result.entities.length).toBeGreaterThan(0);
			expect(result.text).toContain('API Reference');
		});
	});

	describe('Error Handling', () => {
		test('should handle null input gracefully', () => {
			// @ts-expect-error Testing null input
			expect(() => converter.convert(null)).not.toThrow();
		});

		test('should handle undefined input gracefully', () => {
			// @ts-expect-error Testing undefined input
			expect(() => converter.convert(undefined)).not.toThrow();
		});

		test('should handle extremely long single words', () => {
			const longWord = 'A'.repeat(10000);
			const result = converter.convert(`**${longWord}**`, { maxLength: 4096 });

			expect(result.truncated).toBe(true);
			expect(result.text.length).toBeLessThanOrEqual(4096);
		});
	});

	describe('Consistency Tests', () => {
		test('should produce same results for identical input', () => {
			const input = '**Bold** *italic* `code` [spoiler]';

			const result1 = converter.convert(input);
			const result2 = converter.convert(input);

			expect(result1).toEqual(result2);
		});

		test('should handle whitespace consistently', () => {
			const inputs = ['**bold**', ' **bold** ', '  **bold**  ', '\n**bold**\n'];

			inputs.forEach(input => {
				const result = converter.convert(input);
				expect(result.text.trim()).toBe('bold');
				expect(result.entities).toHaveLength(1);
				expect(result.entities[0].type).toBe('bold');
			});
		});
	});
});
