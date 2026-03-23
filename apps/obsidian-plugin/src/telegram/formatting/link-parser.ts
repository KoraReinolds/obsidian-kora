/**
 * Universal link parser for Obsidian and Markdown links
 * Centralizes all link parsing logic used across telegram module
 */

import { App, TFile } from 'obsidian';
import {
	countLinks as countPureLinks,
	generateTelegramPostUrl as generatePureTelegramPostUrl,
	parseButtonLineMatches,
	parseButtonsFromFrontmatter as parseButtonsFromFrontmatterPure,
	parseMarkdownLinks as parsePureMarkdownLinks,
	parseObsidianLinkMatches,
	replaceObsidianLinksWithMarkdown as replacePureObsidianLinksWithMarkdown,
	type BaseParsedLink,
	type ParsedMarkdownLink,
	type ProcessedLink,
} from '../../../../../packages/kora-core/src/telegram/links/index.js';
import { getMarkdownFiles } from '../../obsidian';

export interface ParsedObsidianLink extends BaseParsedLink {
	type: 'obsidian';
	displayText: string;
	file: TFile | null;
	postId?: number;
}

export type ParsedLink = ParsedObsidianLink | ParsedMarkdownLink;

export type { BaseParsedLink, ParsedMarkdownLink, ProcessedLink };

export class LinkParser {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Universal link parser - handles both Obsidian and Markdown links
	 */
	parseLinks(
		content: string,
		type: 'obsidian' | 'markdown' | 'both' = 'both'
	): ParsedLink[] {
		const matches: ParsedLink[] = [];

		if (type === 'obsidian' || type === 'both') {
			const obsidianMatches = this.parseObsidianLinks(content);
			matches.push(...obsidianMatches);
		}

		if (type === 'markdown' || type === 'both') {
			const markdownMatches = this.parseMarkdownLinks(content);
			matches.push(...markdownMatches);
		}

		return matches.sort((a, b) => a.start - b.start);
	}

	/**
	 * Parse Obsidian links [[file|text]] from content
	 */
	parseObsidianLinks(content: string): ParsedObsidianLink[] {
		const rawLinks = parseObsidianLinkMatches(content);

		const fileNames = [...new Set(rawLinks.map(link => link.fileName))];
		const fileMap = this.findFilesByNames(fileNames);

		return rawLinks.map(link => ({
			type: 'obsidian' as const,
			displayText: link.displayText,
			file: fileMap.get(link.fileName) || null,
			start: link.start,
			end: link.end,
			fullMatch: link.fullMatch,
		}));
	}

	/**
	 * Parse Markdown links [text](url) from content
	 */
	parseMarkdownLinks(content: string): ParsedMarkdownLink[] {
		return parsePureMarkdownLinks(content);
	}

	/**
	 * Replace Obsidian links with Markdown links in content
	 */
	replaceObsidianLinksWithMarkdown(
		content: string,
		processedLinks: ProcessedLink[]
	): string {
		return replacePureObsidianLinksWithMarkdown(content, processedLinks);
	}

	/**
	 * Extract button links from content lines
	 * Processes each line separately and returns button rows
	 */
	parseButtonLines(
		lines: string[]
	): Array<Array<{ text: string; fileName: string; file: TFile | null }>> {
		const buttonRows = parseButtonLineMatches(lines);
		const fileNames = [
			...new Set(buttonRows.flat().map(button => button.fileName)),
		];
		const fileMap = this.findFilesByNames(fileNames);

		return buttonRows.map(row =>
			row.map(button => {
				const file = fileMap.get(button.fileName) || null;
				return {
					text: button.text,
					fileName: file?.name || '',
					file,
				};
			})
		);
	}

	/**
	 * Generate Telegram post URL from channel ID and message ID
	 */
	static generateTelegramPostUrl(channelId: string, messageId: number): string {
		return generatePureTelegramPostUrl(channelId, messageId);
	}

	/**
	 * Extract filename from buttons frontmatter value
	 * Parses [[filename]] format from frontmatter
	 */
	parseButtonsFromFrontmatter(frontmatterValue: string): string | null {
		return parseButtonsFromFrontmatterPure(frontmatterValue);
	}

	/**
	 * Count links with detailed breakdown
	 */
	countLinks(content: string): {
		obsidian: number;
		markdown: number;
		total: number;
	} {
		return countPureLinks(content);
	}

	/**
	 * Find files by names with fuzzy matching (batch operation)
	 */
	findFilesByNames(fileNames: string[]): Map<string, TFile | null> {
		const files = getMarkdownFiles(this.app);
		const result = new Map<string, TFile | null>();

		// Initialize all results as null
		fileNames.forEach(name => result.set(name, null));

		// Create lookup maps for efficient matching
		const exactNameMap = new Map<string, TFile>();
		const exactBaseMap = new Map<string, TFile>();
		const lowerBaseMap = new Map<string, TFile[]>();

		files.forEach(file => {
			// Map for exact name match (with .md)
			exactNameMap.set(file.name, file);

			// Map for exact basename match
			exactBaseMap.set(file.basename, file);

			// Map for case-insensitive partial matching
			const lowerBase = file.basename.toLowerCase();
			if (!lowerBaseMap.has(lowerBase)) {
				lowerBaseMap.set(lowerBase, []);
			}
			lowerBaseMap.get(lowerBase)?.push(file);
		});

		// Match each requested filename
		fileNames.forEach(fileName => {
			let file: TFile | null = null;

			// Try exact match first (with .md extension)
			file = exactNameMap.get(`${fileName}.md`) || null;
			if (file) {
				result.set(fileName, file);
				return;
			}

			// Try exact match without extension
			file = exactBaseMap.get(fileName) || null;
			if (file) {
				result.set(fileName, file);
				return;
			}

			// Try partial match (case-insensitive)
			const lowerFileName = fileName.toLowerCase();
			for (const [lowerBase, fileList] of lowerBaseMap.entries()) {
				if (lowerBase.includes(lowerFileName)) {
					result.set(fileName, fileList[0]); // Take first match
					break;
				}
			}
		});

		return result;
	}
}
