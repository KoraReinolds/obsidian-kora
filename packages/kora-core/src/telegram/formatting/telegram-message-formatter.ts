/**
 * @description Чистый форматтер сообщений Telegram без зависимости от Obsidian.
 */

import { TELEGRAM_CONSTANTS } from '../core/constants.js';
import {
	MarkdownToTelegramConverter,
	type ConversionOptions,
	type ConversionResult,
} from './markdown-to-telegram-converter.js';
import {
	replaceObsidianLinksWithMarkdown,
	type ProcessedLink,
} from '../links/index.js';
import { TelegramValidator } from '../utils/validator.js';

export interface EmojiMapping {
	standard: string;
	customId: string;
	description?: string;
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

export class TelegramMessageFormatter {
	private customEmojis: EmojiMapping[];
	private useCustomEmojis: boolean;
	private markdownConverter: MarkdownToTelegramConverter;

	constructor(customEmojis: EmojiMapping[] = [], useCustomEmojis = false) {
		this.customEmojis = customEmojis;
		this.useCustomEmojis = useCustomEmojis;
		this.markdownConverter = new MarkdownToTelegramConverter();
	}

	formatMessage(fileName: string, content: string): string {
		const escapedFileName = this.escapeMarkdownV2(fileName);
		const escapedContent = this.escapeMarkdownV2(content);

		return `📝 *${escapedFileName}*\n\n${escapedContent}`;
	}

	escapeMarkdownV2(text: string): string {
		let escaped = text;

		TELEGRAM_CONSTANTS.MARKDOWN_V2_ESCAPE_CHARS.forEach(char => {
			escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
		});

		return escaped;
	}

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

		this.customEmojis.forEach(mapping => {
			const regex = new RegExp(this.escapeRegExp(mapping.standard), 'g');
			let match;

			while ((match = regex.exec(text)) !== null) {
				entities.push({
					type: 'custom_emoji',
					offset: match.index,
					length: mapping.standard.length,
					custom_emoji_id: mapping.customId,
				});
			}
		});

		entities.sort((a, b) => a.offset - b.offset);

		return { processedText, entities };
	}

	convertMarkdownToTelegram(
		markdownContent: string,
		options?: ConversionOptions
	): ConversionResult {
		return this.markdownConverter.convert(markdownContent, options);
	}

	convertMarkdownNoteWithLinks(
		markdownContent: string,
		processedLinks: ProcessedLink[],
		options?: ConversionOptions
	): ConversionResult {
		const contentWithoutFrontmatter =
			this.markdownConverter.removeFrontmatter(markdownContent);

		const processedContent = replaceObsidianLinksWithMarkdown(
			contentWithoutFrontmatter,
			processedLinks
		);

		return this.markdownConverter.convert(processedContent, options);
	}

	createInlineButtons(processedLinks: ProcessedLink[]): InlineButton[] {
		return processedLinks.map(link => ({
			text: link.displayText,
			url: link.telegramUrl,
		}));
	}

	updateEmojiSettings(
		customEmojis: EmojiMapping[],
		useCustomEmojis: boolean
	): void {
		this.customEmojis = customEmojis;
		this.useCustomEmojis = useCustomEmojis;
	}

	getCustomEmojiMappings(): EmojiMapping[] {
		return this.customEmojis || [];
	}

	addCustomEmojiMapping(
		standard: string,
		customId: string,
		description?: string
	): void {
		if (!this.customEmojis) {
			this.customEmojis = [];
		}

		const existingIndex = this.customEmojis.findIndex(
			m => m.standard === standard
		);

		if (existingIndex !== -1) {
			this.customEmojis[existingIndex] = { standard, customId, description };
		} else {
			this.customEmojis.push({ standard, customId, description });
		}
	}

	removeCustomEmojiMapping(standard: string): void {
		if (!this.customEmojis) {
			return;
		}

		this.customEmojis = this.customEmojis.filter(m => m.standard !== standard);
	}

	getMarkdownConverter(): MarkdownToTelegramConverter {
		return this.markdownConverter;
	}

	validateForTelegram(text: string): { valid: boolean; issues: string[] } {
		return TelegramValidator.validateText(text);
	}

	private escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
