/**
 * @module modules/personal-admin/archive/archive-types
 * @description Внутренние типы подсистемы архива Telegram. Описывают нормализованные
 * записи в SQLite до появления AI-слоёв (окна, суммаризации, векторы), производных
 * от архива.
 */

/**
 * @description Параметры открытия файла SQLite для {@link ArchiveDatabase}.
 */
export interface ArchiveDatabaseConfig {
	databasePath?: string;
}

/**
 * @description Строка таблицы `chats`: метаданные чата до сериализации в API-типы.
 */
export interface ArchiveChatRecord {
	chatId: string;
	title: string;
	username?: string | null;
	type: 'channel' | 'group' | 'chat' | 'unknown';
	lastSyncedAt?: string | null;
	extraJson?: string | null;
}

export interface ArchiveParticipantRecord {
	participantId: string;
	username?: string | null;
	displayName?: string | null;
	isBot: boolean;
	extraJson?: string | null;
}

/**
 * @description Строка таблицы `messages`: поля совпадают со схемой SQLite, JSON — в TEXT-колонках.
 */
export interface ArchiveMessageRecord {
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
	reactionsJson?: string | null;
	entitiesJson?: string | null;
	forwardJson?: string | null;
	serviceJson?: string | null;
	mediaJson?: string | null;
	metadataJson?: string | null;
	contentHash: string;
}

/**
 * @description Строка таблицы `sync_state`: курсор и статус последнего синка по чату.
 */
export interface ArchiveSyncStateRecord {
	chatId: string;
	lastMessageId?: number | null;
	lastSyncStartedAt?: string | null;
	lastSyncFinishedAt?: string | null;
	status: 'idle' | 'running' | 'success' | 'error';
	errorText?: string | null;
}

export interface ArchiveSyncRunRecord {
	chatId: string;
	peer: string;
	startedAt: string;
	finishedAt: string;
	status: 'success' | 'error';
	inserted: number;
	updated: number;
	skipped: number;
	totalProcessed: number;
	firstMessageId?: number | null;
	lastMessageId?: number | null;
	errorText?: string | null;
}

/**
 * @description Входные параметры одного вызова {@link ArchiveSyncService}.
 */
export interface ArchiveSyncOptions {
	peer: string;
	limit: number;
	forceFull?: boolean;
	integrationId?: string;
}

/**
 * @description Накопленные счётчики внутри одного прогона синка (вставки/обновления/пропуски).
 */
export interface ArchiveSyncCounters {
	inserted: number;
	updated: number;
	skipped: number;
}
