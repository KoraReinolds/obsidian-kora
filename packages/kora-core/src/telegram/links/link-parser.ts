/**
 * @description Чистые helper-функции для разбора ссылок без зависимости от Obsidian.
 */

import { TELEGRAM_CONSTANTS } from '../core/constants.js';

export interface BaseParsedLink {
	start: number;
	end: number;
	fullMatch: string;
}

export interface ParsedObsidianLinkMatch extends BaseParsedLink {
	type: 'obsidian';
	fileName: string;
	displayText: string;
}

export interface ParsedMarkdownLink extends BaseParsedLink {
	type: 'markdown';
	linkText: string;
	url: string;
}

export type ParsedLinkMatch = ParsedObsidianLinkMatch | ParsedMarkdownLink;

export interface ProcessedLink {
	fileName: string;
	displayText: string;
	telegramUrl: string;
}

export interface ParsedButtonLink {
	text: string;
	fileName: string;
}

export interface LinkCounts {
	obsidian: number;
	markdown: number;
	total: number;
}

type LinkParseType = 'obsidian' | 'markdown' | 'both';

function parseWithRegex<T>(
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

export function parseObsidianLinkMatches(
	content: string
): ParsedObsidianLinkMatch[] {
	return parseWithRegex(
		content,
		TELEGRAM_CONSTANTS.REGEX.OBSIDIAN_LINKS,
		(match): ParsedObsidianLinkMatch => ({
			type: 'obsidian',
			fileName: match[1],
			displayText: match[2] || match[1],
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			fullMatch: match[0],
		})
	);
}

export function parseMarkdownLinks(content: string): ParsedMarkdownLink[] {
	return parseWithRegex(
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

export function parseLinks(
	content: string,
	type: LinkParseType = 'both'
): ParsedLinkMatch[] {
	const matches: ParsedLinkMatch[] = [];

	if (type === 'obsidian' || type === 'both') {
		matches.push(...parseObsidianLinkMatches(content));
	}

	if (type === 'markdown' || type === 'both') {
		matches.push(...parseMarkdownLinks(content));
	}

	return matches.sort((a, b) => a.start - b.start);
}

export function replaceObsidianLinksWithMarkdown(
	content: string,
	processedLinks: ProcessedLink[]
): string {
	const parsedLinks = parseObsidianLinkMatches(content);
	let result = content;

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

export function parseButtonLineMatches(lines: string[]): ParsedButtonLink[][] {
	const buttonRows: ParsedButtonLink[][] = [];

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) {
			continue;
		}

		const parsedLinks = parseObsidianLinkMatches(trimmedLine);
		if (parsedLinks.length > 0) {
			buttonRows.push(
				parsedLinks.map(link => ({
					text: link.displayText,
					fileName: link.fileName,
				}))
			);
		}
	}

	return buttonRows;
}

export function parseButtonsFromFrontmatter(
	frontmatterValue: string
): string | null {
	const match = frontmatterValue.match(
		TELEGRAM_CONSTANTS.REGEX.BUTTONS_FRONTMATTER
	);
	return match ? match[1] : null;
}

export function countLinks(content: string): LinkCounts {
	const obsidian = parseObsidianLinkMatches(content).length;
	const markdown = parseMarkdownLinks(content).length;

	return {
		obsidian,
		markdown,
		total: obsidian + markdown,
	};
}

export function generateTelegramPostUrl(
	channelId: string,
	messageId: number
): string {
	if (!TELEGRAM_CONSTANTS.REGEX.NUMERIC_CHANNEL_ID.test(channelId)) {
		throw new Error('Unknown channel format');
	}

	let numericId = `${channelId}`;
	if (numericId.startsWith('-100')) {
		numericId = numericId.slice(4);
	} else if (numericId.startsWith('-')) {
		numericId = numericId.slice(1);
	}

	return `https://t.me/c/${numericId}/${messageId}`;
}
