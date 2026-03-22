/**
 * @description Публичный API shared Telegram-formatting без Obsidian-интеграции.
 */
export {
	InlineFormatter,
	type FormattingMatch,
	type ProcessedFormatting,
} from './inline-formatter.js';
export {
	MarkdownToTelegramConverter,
	markdownToTelegramConverter,
	type ConversionOptions,
	type ConversionResult,
	type TelegramMessageEntity,
} from './markdown-to-telegram-converter.js';
export {
	TelegramMessageFormatter,
	type EmojiMapping,
	type InlineButton,
	type MessageEntity,
} from './telegram-message-formatter.js';
