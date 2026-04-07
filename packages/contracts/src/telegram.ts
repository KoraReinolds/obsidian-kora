/**
 * @module packages/contracts/telegram
 * @description Общие типы Telegram для моста GramJS, plugin-слоя Obsidian и server runtime.
 * Единый источник правды для DTO и контрактов, используемых между клиентской и серверной частями Kora.
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
	integrationId?: string;
}

export interface EditMessageRequest {
	peer: string;
	messageId: number;
	message: string;
	entities?: MessageEntity[];
	buttons?: InlineButton[][];
	disableWebPagePreview?: boolean;
	integrationId?: string;
}

export interface SendFileRequest {
	peer: string;
	filePath: string;
	caption?: string;
	buttons?: InlineButton[][];
	parseMode?: string;
	integrationId?: string;
}

export interface GetMessagesRequest {
	peer: string;
	startDate?: string;
	endDate?: string;
	limit?: number;
	integrationId?: string;
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
	integrationId?: string;
}

/**
 * @description Тело запроса `POST /archive/import-desktop`: путь к папке экспорта Telegram Desktop.
 * Внутри ожидается `result.json` и, опционально, директории `files`, `photos`, `stickers`, `video_files`.
 */
export interface ArchiveDesktopImportRequest {
	folderPath?: string;
	folderLabel?: string;
	exportData?: Record<string, unknown>;
	resetChat?: boolean;
}

/**
 * @description Тело запроса `POST /archive/backfill` для догрузки более старой истории из Telegram.
 * @property {string} chatId - Идентификатор архивного чата.
 * @property {string} [peer] - Явный peer для Telegram API (если нужно переопределить сохраненный в архиве).
 * @property {number} [limit] - Размер одного шага догрузки.
 */
export interface ArchiveBackfillRequest {
	chatId: string;
	peer?: string;
	limit?: number;
	integrationId?: string;
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
	source?: string | null;
	messageType?: string | null;
	senderId?: string | null;
	senderName?: string | null;
	senderDisplayName?: string | null;
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
	media?: Record<string, unknown> | null;
	metadata?: Record<string, unknown> | null;
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
 * @description Итог одного backfill-запроса в сторону старых сообщений.
 */
export interface ArchiveBackfillResult {
	chatId: string;
	peer: string;
	inserted: number;
	updated: number;
	skipped: number;
	totalProcessed: number;
	oldestMessageId?: number | null;
	hasMoreOlder: boolean;
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
 * @description Итог импорта Telegram Desktop export.
 */
export interface ArchiveDesktopImportResult {
	chatId: string;
	title: string;
	source: 'telegram-desktop-export';
	inserted: number;
	updated: number;
	skipped: number;
	totalProcessed: number;
	messagesInExport: number;
	exportedAt?: string | null;
	folderPath: string;
	mode: 'desktop-export';
}

/**
 * @description Ответ `POST /archive/import-desktop`.
 */
export interface ArchiveDesktopImportResponse {
	success: boolean;
	result?: ArchiveDesktopImportResult;
	error?: string;
}

/**
 * @description Ответ `POST /archive/backfill`.
 */
export interface ArchiveBackfillResponse {
	success: boolean;
	result?: ArchiveBackfillResult;
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
 * @description Ответ `DELETE /archive/chat/:chatId` — удаление чата и связанных данных из локального SQLite-архива.
 */
export interface ArchiveDeleteChatResponse {
	success: boolean;
	deleted?: boolean;
	chatId?: string;
	error?: string;
}

export type ArchivePipelineStepKey = 'normalize' | 'chunk' | 'embed';

export type ArchivePipelineSelectionScope =
	| 'chat'
	| 'paged-chat'
	| 'message-ids';

/**
 * @description Селектор подмножества архивных данных для ручного запуска pipeline-шага.
 */
export interface ArchivePipelineSelection {
	scope: ArchivePipelineSelectionScope;
	chatId: string;
	offset?: number;
	limit?: number;
	messageIds?: number[];
}

/**
 * @description Краткое описание шага pipeline для UI управления архивной обработкой.
 */
export interface ArchivePipelineStepDescriptor {
	key: ArchivePipelineStepKey;
	title: string;
	description: string;
	supportsScopes: ArchivePipelineSelectionScope[];
}

/**
 * @description Статистика выполнения одного pipeline-шага.
 */
export interface ArchivePipelineStepStats {
	selected: number;
	processed: number;
	skipped: number;
	failed: number;
}

/**
 * @description Небольшой preview-артефакт для ручной проверки результата шага.
 */
export interface ArchivePipelinePreviewItem {
	id: string;
	title: string;
	summary: string;
	details?: string;
}

/**
 * @description Результат одного ручного запуска pipeline-шага.
 */
export interface ArchivePipelineRunRecord {
	runId: string;
	step: ArchivePipelineStepKey;
	selection: ArchivePipelineSelection;
	status: 'running' | 'success' | 'partial' | 'error';
	startedAt: string;
	finishedAt?: string | null;
	stats: ArchivePipelineStepStats;
	warnings: string[];
	error?: string | null;
	preview: ArchivePipelinePreviewItem[];
}

export interface ArchivePipelineStepsResponse {
	success: boolean;
	steps: ArchivePipelineStepDescriptor[];
	error?: string;
}

export interface ArchivePipelineRunRequest {
	step: ArchivePipelineStepKey;
	selection: ArchivePipelineSelection;
}

export interface ArchivePipelineRunResponse {
	success: boolean;
	run?: ArchivePipelineRunRecord;
	error?: string;
}

export interface ArchivePipelineRunsResponse {
	success: boolean;
	runs: ArchivePipelineRunRecord[];
	error?: string;
}

/**
 * @description Ответ `GET /archive/messages` с пагинацией.
 * Сортировка сообщений фиксирована: от новых к старым (`messageId DESC`), а `offset` считается именно в этом порядке.
 */
export interface ArchiveMessagesResponse {
	success: boolean;
	chatId: string;
	messages: ArchiveMessage[];
	total: number;
	offset: number;
	limit: number;
	/**
	 * @description Временной диапазон всех сообщений чата, присутствующих в локальной SQLite БД.
	 */
	fullRange: {
		oldestTimestampUtc: string | null;
		newestTimestampUtc: string | null;
	};
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
 * @property {string} [archiveDatabasePath] — путь к файлу SQLite-архива на хосте kora-server.
 * @property {'sqlite'} [semanticBackend] — активный semantic backend на стороне kora-server.
 * @property {string} [semanticDatabasePath] — путь к SQLite-файлу semantic index-а, если используется sqlite backend.
 * @property {string} [openaiApiKey] — API key для embeddings provider (совместимо с OpenRouter/OpenAI).
 * @property {string} [embeddingModel] — model id для embeddings API.
 * @property {string} [embeddingBaseUrl] — base URL OpenAI-compatible embeddings endpoint.
 */
export interface GramJSConfig {
	mode?: 'bot' | 'userbot';
	botToken?: string;
	apiId?: number;
	apiHash?: string;
	stringSession?: string;
	archiveDatabasePath?: string;
	semanticBackend?: 'sqlite';
	semanticDatabasePath?: string;
	openaiApiKey?: string;
	embeddingModel?: string;
	embeddingBaseUrl?: string;
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
/**
 * @description Разрешения Telegram integration account, которые нужны UI для
 * выбора аккаунта под publish/archive сценарии.
 */
export interface IntegrationAccountCapabilities {
	sendText: boolean;
	editText: boolean;
	sendFiles: boolean;
	readHistory: boolean;
}

/**
 * @description Безопасное публичное описание одного Telegram integration
 * account, доступного Kora server. Секреты и runtime-конфиг наружу не отдаются.
 */
export interface IntegrationAccount {
	id: string;
	provider: 'telegram' | string;
	source: 'openclaw' | 'kora' | string;
	transport: 'bot' | 'userbot' | string;
	accountId: string;
	title: string;
	enabled: boolean;
	isDefault: boolean;
	capabilities: IntegrationAccountCapabilities;
}

/**
 * @description Ответ на GET /integrations/accounts и POST /integrations/reload.
 */
export interface IntegrationAccountsResponse {
	success: boolean;
	accounts: IntegrationAccount[];
	error?: string;
}
