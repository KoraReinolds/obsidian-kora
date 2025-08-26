/**
 * Shared Telegram Types for GramJS Bridge and Server
 *
 * This is the single source of truth for all Telegram-related types
 * used across both the Obsidian plugin and the GramJS server.
 *
 * Import from this file using relative paths:
 * - From modules/: '../../../telegram-types'
 * - From gramjs-server/src/: '../../telegram-types'
 */

// Base interfaces for messages and entities
export interface MessageEntity {
	type: string;
	offset: number;
	length: number;
	custom_emoji_id?: string;
}

export interface MessageEntityEmoji {
	offset: number;
	length: number;
	custom_emoji_id: string;
}

export interface InlineButton {
	text: string;
	url?: string;
	data?: string;
}

// Request interfaces for API calls
export interface SendMessageRequest {
	peer: string;
	message: string;
	entities?: MessageEntity[];
	parseMode?: string;
	buttons?: InlineButton[][];
	disableWebPagePreview?: boolean;
	fileName?: string;
}

export interface EditMessageRequest {
	peer: string;
	messageId: number;
	message: string;
	entities?: MessageEntity[];
	buttons?: InlineButton[][];
	disableWebPagePreview?: boolean;
}

export interface SendFileRequest {
	peer: string;
	filePath: string;
	caption?: string;
	buttons?: InlineButton[][];
	parseMode?: string;
}

export interface GetMessagesRequest {
	peer: string;
	startDate?: string;
	endDate?: string;
	limit?: number;
}

// Response interfaces
export interface SendMessageResponse {
	success: boolean;
	messageId?: number;
	message?: string;
	mode?: string;
	result?: {
		messageId?: number;
		id?: number;
		[key: string]: unknown;
	};
	conversionInfo?: {
		[key: string]: unknown;
	};
}

export interface ApiResponse<T = unknown> {
	success: boolean;
	error?: string;
	data?: T;
	message?: string;
	mode?: string;
}

// Channel/Dialog interfaces
export interface Channel {
	id: string;
	title: string;
	username?: string;
	type: 'channel' | 'group' | 'chat';
	participantsCount?: number;
	isChannel: boolean;
	isGroup: boolean;
	isUser: boolean;
	accessHash?: string;
	date: Date;
}

export interface ChannelsResponse {
	success: boolean;
	channels: Channel[];
	total: number;
	mode: string;
	strategyInfo?: {
		[key: string]: unknown;
	};
	note?: string;
	error?: string;
}

// Message interfaces
export interface Message {
	id: number;
	message?: string;
	date: string;
	fromId?: string;
	peerId: {
		[key: string]: unknown;
	};
	out: boolean;
	mentioned?: boolean;
	mediaUnread?: boolean;
	silent?: boolean;
	post?: boolean;
	fromScheduled?: boolean;
	legacy?: boolean;
	editHide?: boolean;
	pinned?: boolean;
	noforwards?: boolean;
	media?: MessageMedia;
	views?: number;
	forwards?: number;
	replies?: {
		[key: string]: unknown;
	};
	editDate?: string;
	postAuthor?: string;
	groupedId?: string;
}

export interface MessageMedia {
	className?: string;
	document?: {
		id?: string;
		mimeType?: string;
		size?: number;
	};
	photo?: {
		id?: string;
		hasStickers?: boolean;
	};
}

export interface MessagesResponse {
	success: boolean;
	messages: Message[];
	total: number;
	peer: string;
	mode: string;
	dateRange: {
		start: string | null;
		end: string | null;
	};
}

// Configuration interfaces
export interface GramJSConfig {
	mode?: 'bot' | 'userbot';
	botToken?: string;
	apiId?: number;
	apiHash?: string;
	stringSession?: string;
}

export interface ConfigResponse {
	success: boolean;
	currentConfig?: GramJSConfig;
	message?: string;
}

// Bridge configuration
export interface GramJSBridgeConfig {
	host: string;
	port: number;
	timeout: number;
}

// Server message options (for internal server use)
export interface MessageOptions {
	message?: string;
	entities?: MessageEntityEmoji[];
	buttons?: InlineButton[][];
	parseMode?: string;
	replyMarkup?: {
		[key: string]: unknown;
	};
	formattingEntities?: Array<{
		[key: string]: unknown;
	}>;
	disableWebPagePreview?: boolean;
	[key: string]: unknown;
}

// Server file options (for internal server use)
export interface FileOptions {
	file: string;
	caption?: string;
	buttons?: InlineButton[][];
	parseMode?: string;
	replyMarkup?: {
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

// User info interface
export interface UserInfo {
	id: string;
	username?: string;
	firstName?: string;
	lastName?: string;
	phone?: string;
	verified?: boolean;
	premium?: boolean;
	[key: string]: unknown;
}

// Health check response
export interface HealthResponse {
	status: 'ok' | 'error';
	timestamp: string;
	mode?: string;
	version?: string;
}
