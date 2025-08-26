/**
 * Types: Shared HTTP request options and Telegram message/file options.
 * Everything here is strictly related to API shape and reused by routes.
 *
 * @deprecated Use types from '../../../telegram-types.js' instead for consistency
 */

// Re-export from root telegram types for backward compatibility
export type {
	MessageEntityEmoji,
	MessageOptions,
	FileOptions,
	InlineButton,
	MessageEntity,
	SendMessageRequest,
	EditMessageRequest,
	SendFileRequest,
	SendMessageResponse,
	Channel,
	ChannelsResponse,
	Message,
	MessagesResponse,
	GramJSConfig,
	ConfigResponse,
	UserInfo,
	HealthResponse,
} from '../../../telegram-types.js';
