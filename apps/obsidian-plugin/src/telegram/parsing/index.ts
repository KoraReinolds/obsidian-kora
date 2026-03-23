/**
 * Telegram Parsing Module
 * Handles parsing of channel files, posts, and related data structures
 */

// Base parser infrastructure
export {
	FileParser,
	type BaseFileData,
	type ValidationResult as FileValidationResult,
} from './base-file-parser';

// Specific parsers
export { ChannelFileParser, type ChannelFileData } from './channel-file-parser';
export { PostFileParser, type PostFileData } from './post-file-parser';
