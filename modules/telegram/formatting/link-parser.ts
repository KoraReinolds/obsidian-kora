/**
 * Universal link parser for Obsidian and Markdown links
 * Centralizes all link parsing logic used across telegram module
 */

import { App, TFile } from 'obsidian';
import { TELEGRAM_CONSTANTS } from '../core/constants';
import { getMarkdownFiles } from '../../obsidian/file-operations';

// Base interface for all parsed links
export interface BaseParsedLink {
	start: number;
	end: number;
	fullMatch: string;
}

export interface ParsedObsidianLink extends BaseParsedLink {
	type: 'obsidian';
	displayText: string;
	file: TFile | null;
}

export interface ParsedMarkdownLink extends BaseParsedLink {
	type: 'markdown';
	linkText: string;
	url: string;
}

export type ParsedLink = ParsedObsidianLink | ParsedMarkdownLink;

export interface ProcessedLink {
	fileName: string;
	displayText: string;
	telegramUrl: string;
}

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
		// First, parse all links to get file names
		const rawLinks = this.parseWithRegex(
			content,
			TELEGRAM_CONSTANTS.REGEX.OBSIDIAN_LINKS,
			match => ({
				fileName: match[1],
				displayText: match[2] || match[1],
				start: match.index ?? 0,
				end: (match.index ?? 0) + match[0].length,
				fullMatch: match[0],
			})
		);

		// Get all unique file names
		const fileNames = [...new Set(rawLinks.map(link => link.fileName))];

		// Get files in one batch operation
		const fileMap = this.findFilesByNames(fileNames);

		// Map files back to parsed links
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
		return this.parseWithRegex(
			content,
			TELEGRAM_CONSTANTS.REGEX.MARKDOWN_LINKS,
			(match): ParsedMarkdownLink => ({
				type: 'markdown',
				linkText: match[1],
				url: match[2],
				start: match.index ?? 0,
				end: (match.index ?? 0) + match[0].length,
				fullMatch: match[0],
			})
		);
	}

	/**
	 * Generic regex parser helper
	 */
	private parseWithRegex<T>(
		content: string,
		regex: RegExp,
		transformer: (match: RegExpExecArray) => T
	): T[] {
		const matches: T[] = [];
		const globalRegex = new RegExp(
			regex.source,
			regex.flags.includes('g') ? regex.flags : regex.flags + 'g'
		);
		let match: RegExpExecArray | null;

		while ((match = globalRegex.exec(content)) !== null) {
			matches.push(transformer(match));
		}

		return matches;
	}

	/**
	 * Replace Obsidian links with Markdown links in content
	 */
	replaceObsidianLinksWithMarkdown(
		content: string,
		processedLinks: ProcessedLink[]
	): string {
		const parsedLinks = this.parseObsidianLinks(content);
		let result = content;

		// Process in reverse order to maintain correct indices
		const reversedLinks = [...parsedLinks].reverse();
		const reversedProcessed = [...processedLinks].reverse();

		reversedLinks.forEach((link, index) => {
			const processedLink = reversedProcessed[index];
			if (processedLink) {
				const markdownLink = `[${processedLink.displayText}](${processedLink.telegramUrl})`;
				result =
					result.substring(0, link.start) +
					markdownLink +
					result.substring(link.end);
			}
		});

		return result;
	}

	/**
	 * Extract button links from content lines
	 * Processes each line separately and returns button rows
	 */
	parseButtonLines(
		lines: string[]
	): Array<Array<{ text: string; fileName: string; file: TFile | null }>> {
		const buttonRows: Array<
			Array<{ text: string; fileName: string; file: TFile | null }>
		> = [];

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) continue;

			const parsedLinks = this.parseObsidianLinks(trimmedLine);
			if (parsedLinks.length > 0) {
				const rowButtons = parsedLinks.map(link => ({
					text: link.displayText,
					fileName: link.file?.name || '',
					file: link.file,
				}));
				buttonRows.push(rowButtons);
			}
		}

		return buttonRows;
	}

	/**
	 * Generate Telegram post URL from channel ID and message ID
	 */
	generateTelegramPostUrl(channelId: string, messageId: number): string {
		if (TELEGRAM_CONSTANTS.REGEX.NUMERIC_CHANNEL_ID.test(channelId)) {
			let numericId = `${channelId}`;
			if (numericId.startsWith('-100')) {
				numericId = numericId.slice(4); // Remove '-100' prefix
			} else if (numericId.startsWith('-')) {
				numericId = numericId.slice(1); // Remove just '-' prefix
			}
			return `https://t.me/c/${numericId}/${messageId}`;
		} else {
			throw new Error('Unknown channel format');
		}
	}

	/**
	 * Extract filename from buttons frontmatter value
	 * Parses [[filename]] format from frontmatter
	 */
	parseButtonsFromFrontmatter(frontmatterValue: string): string | null {
		const match = frontmatterValue.match(
			TELEGRAM_CONSTANTS.REGEX.BUTTONS_FRONTMATTER
		);
		return match ? match[1] : null;
	}

	/**
	 * Check if content contains links of specified type
	 */
	hasLinks(
		content: string,
		type: 'obsidian' | 'markdown' | 'any' = 'any'
	): boolean {
		switch (type) {
			case 'obsidian':
				return TELEGRAM_CONSTANTS.REGEX.OBSIDIAN_LINKS.test(content);
			case 'markdown':
				return TELEGRAM_CONSTANTS.REGEX.MARKDOWN_LINKS.test(content);
			case 'any':
				return (
					this.hasLinks(content, 'obsidian') ||
					this.hasLinks(content, 'markdown')
				);
		}
	}

	/**
	 * Backward compatibility methods
	 */
	hasObsidianLinks(content: string): boolean {
		return this.hasLinks(content, 'obsidian');
	}

	hasMarkdownLinks(content: string): boolean {
		return this.hasLinks(content, 'markdown');
	}

	/**
	 * Count links with detailed breakdown
	 */
	countLinks(content: string): {
		obsidian: number;
		markdown: number;
		total: number;
	} {
		const obsidianCount = this.parseObsidianLinks(content).length;
		const markdownCount = this.parseMarkdownLinks(content).length;

		return {
			obsidian: obsidianCount,
			markdown: markdownCount,
			total: obsidianCount + markdownCount,
		};
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
