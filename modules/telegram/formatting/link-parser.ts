/**
 * Universal link parser for Obsidian and Markdown links
 * Centralizes all link parsing logic used across telegram module
 */

import { TELEGRAM_CONSTANTS } from '../core/constants';

export interface ParsedLink {
	fileName: string;
	displayText: string;
	start: number;
	end: number;
	fullMatch: string;
}

export interface ParsedMarkdownLink {
	linkText: string;
	url: string;
	start: number;
	end: number;
	fullMatch: string;
}

export interface ProcessedLink {
	fileName: string;
	displayText: string;
	telegramUrl: string;
}

export class LinkParser {
	/**
	 * Parse all Obsidian links [[file|text]] from content
	 */
	static parseObsidianLinks(content: string): ParsedLink[] {
		const matches: ParsedLink[] = [];
		const regex = new RegExp(TELEGRAM_CONSTANTS.REGEX.OBSIDIAN_LINKS);
		let match: RegExpExecArray | null;

		while ((match = regex.exec(content)) !== null) {
			const fileName = match[1];
			const displayText = match[2] || fileName;

			matches.push({
				fileName,
				displayText,
				start: match.index,
				end: match.index + match[0].length,
				fullMatch: match[0],
			});
		}

		return matches;
	}

	/**
	 * Parse all Markdown links [text](url) from content
	 */
	static parseMarkdownLinks(content: string): ParsedMarkdownLink[] {
		const matches: ParsedMarkdownLink[] = [];
		const regex = new RegExp(TELEGRAM_CONSTANTS.REGEX.MARKDOWN_LINKS);
		let match: RegExpExecArray | null;

		while ((match = regex.exec(content)) !== null) {
			matches.push({
				linkText: match[1],
				url: match[2],
				start: match.index,
				end: match.index + match[0].length,
				fullMatch: match[0],
			});
		}

		return matches;
	}

	/**
	 * Replace Obsidian links with Markdown links in content
	 */
	static replaceObsidianLinksWithMarkdown(
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
	static parseButtonLines(
		lines: string[]
	): Array<Array<{ text: string; fileName: string }>> {
		const buttonRows: Array<Array<{ text: string; fileName: string }>> = [];

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) continue;

			const parsedLinks = this.parseObsidianLinks(trimmedLine);
			if (parsedLinks.length > 0) {
				const rowButtons = parsedLinks.map(link => ({
					text: link.displayText,
					fileName: link.fileName,
				}));
				buttonRows.push(rowButtons);
			}
		}

		return buttonRows;
	}

	/**
	 * Generate Telegram post URL from channel ID and message ID
	 */
	static generateTelegramPostUrl(channelId: string, messageId: number): string {
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
	static parseButtonsFromFrontmatter(frontmatterValue: string): string | null {
		const match = frontmatterValue.match(
			TELEGRAM_CONSTANTS.REGEX.BUTTONS_FRONTMATTER
		);
		return match ? match[1] : null;
	}

	/**
	 * Check if text contains any Obsidian links
	 */
	static hasObsidianLinks(content: string): boolean {
		return TELEGRAM_CONSTANTS.REGEX.OBSIDIAN_LINKS.test(content);
	}

	/**
	 * Check if text contains any Markdown links
	 */
	static hasMarkdownLinks(content: string): boolean {
		return TELEGRAM_CONSTANTS.REGEX.MARKDOWN_LINKS.test(content);
	}

	/**
	 * Count total links in content
	 */
	static countLinks(content: string): { obsidian: number; markdown: number } {
		const obsidianLinks = this.parseObsidianLinks(content);
		const markdownLinks = this.parseMarkdownLinks(content);

		return {
			obsidian: obsidianLinks.length,
			markdown: markdownLinks.length,
		};
	}
}
