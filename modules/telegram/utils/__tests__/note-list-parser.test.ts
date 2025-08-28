/**
 * Tests for NoteListParser
 */

import { NoteListParser } from '../note-list-parser';
import { describe, it, beforeEach, expect } from 'vitest';

// Mock Obsidian App
const mockApp = {
	vault: {
		getMarkdownFiles: () => [
			{ name: 'Пост 1.md', basename: 'Пост 1', path: 'Пост 1.md' },
			{ name: 'Пост 2.md', basename: 'Пост 2', path: 'Пост 2.md' },
			{ name: 'Пост 3.md', basename: 'Пост 3', path: 'Пост 3.md' },
		],
	},
} as any;

describe('NoteListParser', () => {
	let parser: NoteListParser;

	beforeEach(() => {
		parser = new NoteListParser(mockApp);
	});

	describe('parseNoteList', () => {
		it('should parse unordered list with obsidian links', () => {
			const content = `
# Test
- [[Пост 1]] - First post
- [[Пост 2|Custom display]] - Second post
- [[Пост 3]] - Third post
`;

			const result = parser.parseNoteList(content);

			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({
				fileName: 'Пост 1',
				displayText: 'Пост 1',
				position: 0,
				sourceLineIndex: 2,
				fullLine: '- [[Пост 1]] - First post',
			});
			expect(result[1]).toEqual({
				fileName: 'Пост 2',
				displayText: 'Custom display',
				position: 1,
				sourceLineIndex: 3,
				fullLine: '- [[Пост 2|Custom display]] - Second post',
			});
		});

		it('should parse ordered list with obsidian links', () => {
			const content = `
1. [[Пост 1]]
2. [[Пост 2]]
3. [[Пост 3]]
`;

			const result = parser.parseNoteList(content);

			expect(result).toHaveLength(3);
			expect(result[0].position).toBe(0);
			expect(result[1].position).toBe(1);
			expect(result[2].position).toBe(2);
		});

		it('should handle multiple links in one list item', () => {
			const content = `
- [[Пост 1]] and [[Пост 2]]
`;

			const result = parser.parseNoteList(content);

			expect(result).toHaveLength(2);
			expect(result[0].fileName).toBe('Пост 1');
			expect(result[1].fileName).toBe('Пост 2');
			expect(result[0].position).toBe(0);
			expect(result[1].position).toBe(1);
		});

		it('should ignore non-list lines', () => {
			const content = `
# Header
Some text
- [[Пост 1]]
More text
- [[Пост 2]]
`;

			const result = parser.parseNoteList(content);

			expect(result).toHaveLength(2);
			expect(result[0].fileName).toBe('Пост 1');
			expect(result[1].fileName).toBe('Пост 2');
		});

		it('should return empty array for content without lists', () => {
			const content = `
# Header
Just some text without any lists.
[[Пост 1]] - this is not in a list
`;

			const result = parser.parseNoteList(content);

			expect(result).toHaveLength(0);
		});
	});

	describe('getFileByName', () => {
		it('should find file by exact name with extension', () => {
			const file = parser.getFileByName('Пост 1');
			expect(file).toBeTruthy();
			expect(file?.basename).toBe('Пост 1');
		});

		it('should return null for non-existent file', () => {
			const file = parser.getFileByName('Несуществующий файл');
			expect(file).toBeNull();
		});
	});

	describe('findListSections', () => {
		it('should identify separate list sections', () => {
			const content = `
# First section
- [[Пост 1]]
- [[Пост 2]]

Some text in between

# Second section  
- [[Пост 3]]
- [[Пост 4]]
`;

			const sections = parser.findListSections(content);

			expect(sections).toHaveLength(2);
			expect(sections[0].items).toHaveLength(2);
			expect(sections[1].items).toHaveLength(2);
			expect(sections[0].startLine).toBe(2);
			expect(sections[1].startLine).toBe(7);
		});
	});
});
