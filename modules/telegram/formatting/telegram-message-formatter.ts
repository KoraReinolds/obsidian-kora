/**
 * Pure Telegram message formatter without Obsidian dependencies
 * Handles message formatting, custom emojis, and markdown conversion
 */

import { TELEGRAM_CONSTANTS } from '../core/constants';
import {
	MarkdownToTelegramConverter,
	type ConversionOptions,
	type ConversionResult,
} from './markdown-to-telegram-converter';
import { LinkParser, type ProcessedLink } from './link-parser';
import { TelegramValidator } from '../utils';
import { App } from 'obsidian';

export interface EmojiMapping {
	standard: string; // Standard emoji (e.g., "📝")
	customId: string; // Custom emoji ID
	description?: string; // Description for UI
}

export interface MessageEntity {
	type: string;
	offset: number;
	length: number;
	custom_emoji_id?: string;
}

export interface InlineButton {
	text: string;
	url?: string;
	data?: string;
}

/**
 * Pure Telegram message formatter
 * Does not depend on Obsidian APIs - only handles text processing
 */
export class TelegramMessageFormatter {
	private customEmojis: EmojiMapping[];
	private useCustomEmojis: boolean;
	private markdownConverter: MarkdownToTelegramConverter;
	private linkParser: LinkParser;

	constructor(
		app: App,
		customEmojis: EmojiMapping[] = [],
		useCustomEmojis = false
	) {
		this.customEmojis = customEmojis;
		this.useCustomEmojis = useCustomEmojis;
		this.markdownConverter = new MarkdownToTelegramConverter();
		this.linkParser = new LinkParser(app);
	}

	/**
	 * Format message for Telegram with file name header
	 */
	formatMessage(fileName: string, content: string): string {
		const escapedFileName = this.escapeMarkdownV2(fileName);
		const escapedContent = this.escapeMarkdownV2(content);

		return `📝 *${escapedFileName}*\n\n${escapedContent}`;
	}

	/**
	 * Escape special characters for MarkdownV2
	 */
	escapeMarkdownV2(text: string): string {
		let escaped = text;

		TELEGRAM_CONSTANTS.MARKDOWN_V2_ESCAPE_CHARS.forEach(char => {
			escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
		});

		return escaped;
	}

	/**
	 * Process custom emojis in text
	 */
	processCustomEmojis(text: string): {
		processedText: string;
		entities: MessageEntity[];
	} {
		if (
			!this.useCustomEmojis ||
			!this.customEmojis ||
			this.customEmojis.length === 0
		) {
			return { processedText: text, entities: [] };
		}

		const processedText = text;
		const entities: MessageEntity[] = [];

		// Process all configured mappings
		this.customEmojis.forEach(mapping => {
			const regex = new RegExp(this.escapeRegExp(mapping.standard), 'g');
			let match;

			// Find all occurrences of standard emoji
			while ((match = regex.exec(text)) !== null) {
				entities.push({
					type: 'custom_emoji',
					offset: match.index,
					length: mapping.standard.length,
					custom_emoji_id: mapping.customId,
				});
			}
		});

		// Sort entities by offset for correct processing
		entities.sort((a, b) => a.offset - b.offset);

		return { processedText, entities };
	}

	/**
	 * Convert markdown to Telegram format
	 */
	convertMarkdownToTelegram(
		markdownContent: string,
		options?: ConversionOptions
	): ConversionResult {
		return this.markdownConverter.convert(markdownContent, options);
	}

	/**
	 * Convert markdown note with processed Obsidian links
	 */
	convertMarkdownNoteWithLinks(
		markdownContent: string,
		processedLinks: ProcessedLink[],
		options?: ConversionOptions
	): ConversionResult {
		// Remove frontmatter first
		const contentWithoutFrontmatter =
			this.markdownConverter.removeFrontmatter(markdownContent);

		// Replace Obsidian links with Telegram URLs
		const processedContent = this.linkParser.replaceObsidianLinksWithMarkdown(
			contentWithoutFrontmatter,
			processedLinks
		);

		// Convert markdown to telegram format
		return this.markdownConverter.convert(processedContent, options);
	}

	/**
	 * Create inline buttons from processed links
	 */
	createInlineButtons(processedLinks: ProcessedLink[]): InlineButton[] {
		return processedLinks.map(link => ({
			text: link.displayText,
			url: link.telegramUrl,
		}));
	}

	/**
	 * Update emoji settings
	 */
	updateEmojiSettings(
		customEmojis: EmojiMapping[],
		useCustomEmojis: boolean
	): void {
		this.customEmojis = customEmojis;
		this.useCustomEmojis = useCustomEmojis;
	}

	/**
	 * Get all custom emoji mappings
	 */
	getCustomEmojiMappings(): EmojiMapping[] {
		return this.customEmojis || [];
	}

	/**
	 * Add custom emoji mapping
	 */
	addCustomEmojiMapping(
		standard: string,
		customId: string,
		description?: string
	): void {
		if (!this.customEmojis) {
			this.customEmojis = [];
		}

		// Check if mapping already exists
		const existingIndex = this.customEmojis.findIndex(
			m => m.standard === standard
		);

		if (existingIndex !== -1) {
			// Update existing
			this.customEmojis[existingIndex] = { standard, customId, description };
		} else {
			// Add new
			this.customEmojis.push({ standard, customId, description });
		}
	}

	/**
	 * Remove custom emoji mapping
	 */
	removeCustomEmojiMapping(standard: string): void {
		if (!this.customEmojis) return;
		this.customEmojis = this.customEmojis.filter(m => m.standard !== standard);
	}

	/**
	 * Get markdown converter instance for direct access
	 */
	getMarkdownConverter(): MarkdownToTelegramConverter {
		return this.markdownConverter;
	}

	/**
	 * Escape characters for RegExp
	 */
	private escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/**
	 * Validate text for Telegram constraints
	 */
	validateForTelegram(text: string): { valid: boolean; issues: string[] } {
		return TelegramValidator.validateText(text);
	}
}
