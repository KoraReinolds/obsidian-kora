/**
 * Constants for Telegram module
 */

export const TELEGRAM_CONSTANTS = {
	// Telegram API limits
	MAX_MESSAGE_LENGTH: 4096,
	MAX_CAPTION_LENGTH: 1024,
	MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB

	// Default ports
	DEFAULT_GRAMJS_PORT: 8124,
	DEFAULT_HOST: '127.0.0.1',

	// HTTP
	DEFAULT_TIMEOUT: 10000,
	DEFAULT_HEADERS: {
		'Content-Type': 'application/json',
	} as const,

	// MarkdownV2 special characters that need escaping
	MARKDOWN_V2_ESCAPE_CHARS: [
		'_',
		'*',
		'[',
		']',
		'(',
		')',
		'~',
		'`',
		'>',
		'#',
		'+',
		'-',
		'=',
		'|',
		'{',
		'}',
		'.',
		'!',
	] as const,

	// Supported image formats for Telegram
	SUPPORTED_IMAGE_FORMATS: [
		'jpg',
		'jpeg',
		'png',
		'gif',
		'bmp',
		'webp',
	] as const,

	// Inline formatting patterns for markdown processing
	FORMATTING_PATTERNS: [
		{ regex: /\*\*(.*?)\*\*/g, type: 'bold', removedChars: 4 },
		{ regex: /__(.*?)__/g, type: 'bold', removedChars: 4 },
		{ regex: /(?<!\*)\*([^*]+?)\*(?!\*)/g, type: 'italic', removedChars: 2 },
		{ regex: /(?<!_)_([^_]+?)_(?!_)/g, type: 'italic', removedChars: 2 },
		{ regex: /`([^`]+?)`/g, type: 'code', removedChars: 2 },
		{ regex: /~~(.*?)~~/g, type: 'strikethrough', removedChars: 4 },
		{ regex: /\[([^\]]+?)\](?!\()/g, type: 'spoiler', removedChars: 2 },
	] as const,

	// Regular expressions
	REGEX: {
		FRONTMATTER: /^---\s*\n[\s\S]*?\n---\s*\n?/,
		H1_HEADERS: /^# .+$/gm,
		CODE_BLOCKS: /```(\w+)?\n([\s\S]*?)\n```/g,
		OBSIDIAN_LINKS: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
		MARKDOWN_LINKS: /\[([^\]]+?)\]\(([^)]+?)\)/g,
		BLOCKQUOTE_EXPANDABLE: /^>\[!\s*[^\]]*\](-?)\s*(.*)$/,
		BLOCKQUOTE_REGULAR: /^>\s*(.+)$/,
		HEADERS_H2_H6: /^#{2,6} (.+)$/gm,
		NUMERIC_CHANNEL_ID: /^-?\d+$/,
		BUTTONS_FRONTMATTER: /\[\[([^\]]+)\]\]/,
	} as const,

	// Text processing
	MAX_NEWLINES: 2,
	WORD_BOUNDARY_THRESHOLD: 0.8,
	TRUNCATION_SUFFIX: '...',
	TRUNCATION_RESERVE_CHARS: 3,

	// Placeholders
	CODE_BLOCK_PLACEHOLDER_PREFIX: '\x00CODEBLOCK',
	CODE_BLOCK_PLACEHOLDER_SUFFIX: '\x00',

	// Default conversion options
	DEFAULT_CONVERSION_OPTIONS: {
		removeFrontmatter: true,
		removeH1Headers: true,
		maxLength: 4096,
		preserveCodeBlocks: true,
		preserveLinks: true,
	} as const,
} as const;

// Type helpers
export type FormattingPattern =
	(typeof TELEGRAM_CONSTANTS.FORMATTING_PATTERNS)[number];
export type SupportedImageFormat =
	(typeof TELEGRAM_CONSTANTS.SUPPORTED_IMAGE_FORMATS)[number];
export type MarkdownV2EscapeChar =
	(typeof TELEGRAM_CONSTANTS.MARKDOWN_V2_ESCAPE_CHARS)[number];
