/**
 * Note List Parser - extracts ordered notes from markdown lists
 */

import { App, TFile } from 'obsidian';
import { LinkParser } from '../formatting/link-parser';

export interface NoteLinkItem {
	fileName: string;
	displayText: string;
	position: number;
	sourceLineIndex: number;
	fullLine: string;
}

export class NoteListParser {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Extract ordered note links from markdown content
	 * Supports both unordered (-) and ordered (1.) lists
	 */
	parseNoteList(content: string): NoteLinkItem[] {
		const lines = content.split('\n');
		const noteItems: NoteLinkItem[] = [];
		let position = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();

			// Check if line is a list item (- or numbered)
			if (this.isListItem(trimmedLine)) {
				// Extract obsidian links from this list item
				const links = LinkParser.parseObsidianLinks(trimmedLine);

				for (const link of links) {
					noteItems.push({
						fileName: link.fileName,
						displayText: link.displayText,
						position: position,
						sourceLineIndex: i,
						fullLine: line,
					});
					position++;
				}
			}
		}

		return noteItems;
	}

	/**
	 * Check if a line is a list item
	 */
	private isListItem(line: string): boolean {
		// Unordered list: starts with - or * or +
		if (/^\s*[-*+]\s/.test(line)) {
			return true;
		}

		// Ordered list: starts with number followed by . or )
		if (/^\s*\d+[.)]\s/.test(line)) {
			return true;
		}

		return false;
	}

	/**
	 * Get file reference by filename
	 */
	getFileByName(fileName: string): TFile | null {
		const files = this.app.vault.getMarkdownFiles();

		// Try exact match first (with .md extension)
		let file = files.find(f => f.name === `${fileName}.md`);
		if (file) return file;

		// Try exact match without extension
		file = files.find(f => f.basename === fileName);
		if (file) return file;

		// Try partial match (case-insensitive)
		file = files.find(f =>
			f.basename.toLowerCase().includes(fileName.toLowerCase())
		);
		if (file) return file;

		return null;
	}

	/**
	 * Resolve all note items to actual files
	 */
	async resolveNoteFiles(noteItems: NoteLinkItem[]): Promise<
		Array<{
			noteItem: NoteLinkItem;
			file: TFile | null;
		}>
	> {
		return noteItems.map(noteItem => ({
			noteItem,
			file: this.getFileByName(noteItem.fileName),
		}));
	}

	/**
	 * Extract note list from a specific file
	 */
	async parseNoteListFromFile(file: TFile): Promise<NoteLinkItem[]> {
		const content = await this.app.vault.read(file);
		return this.parseNoteList(content);
	}

	/**
	 * Find all list sections in content
	 * Returns sections separated by non-list content
	 */
	findListSections(content: string): Array<{
		startLine: number;
		endLine: number;
		items: NoteLinkItem[];
	}> {
		const lines = content.split('\n');
		const sections: Array<{
			startLine: number;
			endLine: number;
			items: NoteLinkItem[];
		}> = [];

		let currentSection: {
			startLine: number;
			endLine: number;
			items: NoteLinkItem[];
		} | null = null;
		let position = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();

			if (this.isListItem(trimmedLine)) {
				// Start new section if needed
				if (!currentSection) {
					currentSection = {
						startLine: i,
						endLine: i,
						items: [],
					};
				}

				// Update end line
				currentSection.endLine = i;

				// Extract links from this list item
				const links = LinkParser.parseObsidianLinks(trimmedLine);
				for (const link of links) {
					currentSection.items.push({
						fileName: link.fileName,
						displayText: link.displayText,
						position: position,
						sourceLineIndex: i,
						fullLine: line,
					});
					position++;
				}
			} else if (trimmedLine === '' && currentSection) {
				// Empty line - continue current section
				continue;
			} else if (currentSection) {
				// Non-list line - end current section
				sections.push(currentSection);
				currentSection = null;
			}
		}

		// Add final section if exists
		if (currentSection) {
			sections.push(currentSection);
		}

		return sections;
	}
}
