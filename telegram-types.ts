/**
 * @module telegram-types
 * @description Общие типы Telegram для моста GramJS и сервера.
 * Единый источник правды для типов, используемых плагином Obsidian и gramjs-server.
 *
 * Импорт относительными путями:
 * - из `modules/`: `../../../telegram-types`
 * - из `gramjs-server/src/`: `../../telegram-types`
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

/**
 * @description Тело запроса `POST /archive/sync`: peer и параметры одного прогона синхронизации.
 * @property {string} peer - Username, ссылка t.me или числовой id чата (как в GramJS).
 * @property {number} [limit] - Сколько сообщений забрать за проход (bootstrap / окно).
 * @property {boolean} [forceFull] - При true можно сбросить курсор (если сервер это поддерживает).
 */
export interface ArchiveSyncRequest {
	peer: string;
	limit?: number;
	forceFull?: boolean;
}

/**
 * @description Запрос страницы архивных сообщений для одного чата (`GET /archive/messages`).
 * @property {string} chatId - Стабильный id чата в архиве (как в SQLite).
 * @property {number} [limit] - Размер страницы.
 * @property {number} [offset] - Смещение для пагинации.
 */
export interface GetArchivedMessagesRequest {
	chatId: string;
	limit?: number;
	offset?: number;
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

/**
 * @description Метаданные архивного чата для списка в UI / API.
 * @property {string} chatId - Ключ чата в архиве.
 * @property {string} title - Отображаемое имя.
 * @property {string | null} [username] - @username, если есть.
 */
export interface ArchiveChat {
	chatId: string;
	title: string;
	username?: string | null;
	type: 'channel' | 'group' | 'chat' | 'unknown';
	lastSyncedAt?: string | null;
	messageCount: number;
	extra?: Record<string, unknown> | null;
}

/**
 * @description Нормализованная запись сообщения в SQLite-архиве.
 * @property {string} messagePk - Стабильный первичный ключ строки в БД.
 * @property {string} contentHash - Хэш содержимого для дедупликации / смены текста.
 */
export interface ArchiveMessage {
	messagePk: string;
	chatId: string;
	messageId: number;
	senderId?: string | null;
	timestampUtc: string;
	editTimestampUtc?: string | null;
	replyToMessageId?: number | null;
	threadId?: string | null;
	textRaw?: string | null;
	textNormalized?: string | null;
	reactions?: Record<string, unknown> | null;
	entities?: Record<string, unknown> | null;
	forward?: Record<string, unknown> | null;
	service?: Record<string, unknown> | null;
	contentHash: string;
}

/**
 * @description Курсор и статус последней синхронизации по чату.
 */
export interface ArchiveSyncState {
	chatId: string;
	lastMessageId?: number | null;
	lastSyncStartedAt?: string | null;
	lastSyncFinishedAt?: string | null;
	status: 'idle' | 'running' | 'success' | 'error';
	errorText?: string | null;
}

/**
 * @description Итог одного прогона `sync` для ответа клиенту.
 */
export interface ArchiveSyncResult {
	chatId: string;
	peer: string;
	inserted: number;
	updated: number;
	skipped: number;
	totalProcessed: number;
	lastMessageId?: number | null;
	mode: string;
}

/**
 * @description Ответ `POST /archive/sync`.
 */
export interface ArchiveSyncResponse {
	success: boolean;
	result?: ArchiveSyncResult;
	error?: string;
}

/**
 * @description Ответ `GET /archive/chats`.
 */
export interface ArchiveChatsResponse {
	success: boolean;
	chats: ArchiveChat[];
	total: number;
}

/**
 * @description Ответ `GET /archive/messages` с пагинацией.
 */
export interface ArchiveMessagesResponse {
	success: boolean;
	chatId: string;
	messages: ArchiveMessage[];
	total: number;
	offset: number;
	limit: number;
}

/**
 * @description Ответ `GET /archive/message/:id`.
 */
export interface ArchiveMessageResponse {
	success: boolean;
	message?: ArchiveMessage | null;
}

/**
 * @description Ответ `GET /archive/sync_state` (один чат или список).
 */
export interface ArchiveSyncStateResponse {
	success: boolean;
	state?: ArchiveSyncState | null;
	states?: ArchiveSyncState[];
}

/**
 * @description Конфигурация GramJS на сервере.
 * @property {string} [archiveDatabasePath] — путь к файлу SQLite-архива на хосте gramjs-server.
 */
export interface GramJSConfig {
	mode?: 'bot' | 'userbot';
	botToken?: string;
	apiId?: number;
	apiHash?: string;
	stringSession?: string;
	archiveDatabasePath?: string;
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
