/**
 * @module modules/personal-admin/archive/archive-repository
 *
 * @description Инкапсулирует весь доступ к SQLite архива Telegram: синхронизация,
 * HTTP-маршруты и будущие AI-слои опираются на один контракт данных, а не на
 * разрозненный SQL по файлам.
 */

import type Database from 'better-sqlite3';
import type {
	ArchiveChat,
	ArchiveMessage,
	ArchiveSyncState,
} from '../../../../../packages/contracts/src/telegram.js';
import type {
	ArchiveChatRecord,
	ArchiveMessageRecord,
	ArchiveParticipantRecord,
	ArchiveSyncRunRecord,
	ArchiveSyncStateRecord,
} from './archive-types.js';

/**
 * @description Фасад репозитория над схемой SQLite архива.
 */
export class ArchiveRepository {
	constructor(private readonly db: Database.Database) {}

	/**
	 * @description Upsert метаданных чата: у вставки сообщений всегда есть родительская
	 * строка чата, а UI может строить список архивных чатов без сканирования сырых диалогов.
	 * @param {ArchiveChatRecord} chat — нормализованные метаданные чата.
	 * @returns {void}
	 */
	upsertChat(chat: ArchiveChatRecord): void {
		this.db
			.prepare(
				`
				INSERT INTO chats (chat_id, title, username, type, last_synced_at, extra_json)
				VALUES (@chatId, @title, @username, @type, @lastSyncedAt, @extraJson)
				ON CONFLICT(chat_id) DO UPDATE SET
					title = excluded.title,
					username = excluded.username,
					type = excluded.type,
					last_synced_at = excluded.last_synced_at,
					extra_json = excluded.extra_json
			`
			)
			.run(chat);
	}

	/**
	 * @description Upsert метаданных отправителя как облегчённой записи участника.
	 * @param {ArchiveParticipantRecord | null} participant - Метаданные отправителя или null, если отправителя нет.
	 * @returns {void}
	 */
	upsertParticipant(participant: ArchiveParticipantRecord | null): void {
		if (!participant) {
			return;
		}

		this.db
			.prepare(
				`
				INSERT INTO participants (participant_id, username, display_name, is_bot, extra_json)
				VALUES (@participantId, @username, @displayName, @isBot, @extraJson)
				ON CONFLICT(participant_id) DO UPDATE SET
					username = excluded.username,
					display_name = excluded.display_name,
					is_bot = excluded.is_bot,
					extra_json = excluded.extra_json
			`
			)
			.run({
				...participant,
				isBot: participant.isBot ? 1 : 0,
			});
	}

	/**
	 * @description Вставляет или обновляет одно архивное сообщение и возвращает тип записи,
	 * чтобы метрики синка отличали insert от update и skip.
	 * @param {ArchiveMessageRecord} message — нормализованное сообщение архива.
	 * @returns {'inserted' | 'updated' | 'skipped'} итог операции с БД.
	 */
	upsertMessage(
		message: ArchiveMessageRecord
	): 'inserted' | 'updated' | 'skipped' {
		const existing = this.db
			.prepare(
				'SELECT content_hash, edit_timestamp_utc FROM messages WHERE message_pk = ?'
			)
			.get(message.messagePk) as
			| { content_hash: string; edit_timestamp_utc?: string | null }
			| undefined;

		if (
			existing &&
			existing.content_hash === message.contentHash &&
			(existing.edit_timestamp_utc ?? null) ===
				(message.editTimestampUtc ?? null)
		) {
			return 'skipped';
		}

		this.db
			.prepare(
				`
				INSERT INTO messages (
					message_pk,
					chat_id,
					message_id,
					sender_id,
					timestamp_utc,
					edit_timestamp_utc,
					reply_to_message_id,
					thread_id,
					text_raw,
					text_normalized,
					reactions_json,
					entities_json,
					forward_json,
					service_json,
					content_hash
				)
				VALUES (
					@messagePk,
					@chatId,
					@messageId,
					@senderId,
					@timestampUtc,
					@editTimestampUtc,
					@replyToMessageId,
					@threadId,
					@textRaw,
					@textNormalized,
					@reactionsJson,
					@entitiesJson,
					@forwardJson,
					@serviceJson,
					@contentHash
				)
				ON CONFLICT(message_pk) DO UPDATE SET
					sender_id = excluded.sender_id,
					timestamp_utc = excluded.timestamp_utc,
					edit_timestamp_utc = excluded.edit_timestamp_utc,
					reply_to_message_id = excluded.reply_to_message_id,
					thread_id = excluded.thread_id,
					text_raw = excluded.text_raw,
					text_normalized = excluded.text_normalized,
					reactions_json = excluded.reactions_json,
					entities_json = excluded.entities_json,
					forward_json = excluded.forward_json,
					service_json = excluded.service_json,
					content_hash = excluded.content_hash
			`
			)
			.run(message);

		return existing ? 'updated' : 'inserted';
	}

	/**
	 * @description Обновляет курсор и статус синхронизации чата.
	 * @param {ArchiveSyncStateRecord} state - Снимок состояния синка для сохранения.
	 * @returns {void}
	 */
	upsertSyncState(state: ArchiveSyncStateRecord): void {
		this.db
			.prepare(
				`
				INSERT INTO sync_state (
					chat_id,
					last_message_id,
					last_sync_started_at,
					last_sync_finished_at,
					status,
					error_text
				)
				VALUES (
					@chatId,
					@lastMessageId,
					@lastSyncStartedAt,
					@lastSyncFinishedAt,
					@status,
					@errorText
				)
				ON CONFLICT(chat_id) DO UPDATE SET
					last_message_id = excluded.last_message_id,
					last_sync_started_at = excluded.last_sync_started_at,
					last_sync_finished_at = excluded.last_sync_finished_at,
					status = excluded.status,
					error_text = excluded.error_text
			`
			)
			.run(state);
	}

	/**
	 * @description Сохраняет строку аудита для каждого запуска синхронизации архива,
	 * чтобы UI показывал историю даже после сдвига курсора вперёд.
	 * @param {ArchiveSyncRunRecord} syncRun - Завершённая строка аудита синка.
	 * @returns {void}
	 */
	insertSyncRun(syncRun: ArchiveSyncRunRecord): void {
		this.db
			.prepare(
				`
				INSERT INTO sync_runs (
					chat_id,
					peer,
					started_at,
					finished_at,
					status,
					inserted,
					updated,
					skipped,
					total_processed,
					first_message_id,
					last_message_id,
					error_text
				)
				VALUES (
					@chatId,
					@peer,
					@startedAt,
					@finishedAt,
					@status,
					@inserted,
					@updated,
					@skipped,
					@totalProcessed,
					@firstMessageId,
					@lastMessageId,
					@errorText
				)
			`
			)
			.run(syncRun);
	}

	/**
	 * @description Читает все архивные чаты с количеством сообщений для UI архива.
	 * @param {number} limit - Максимум строк.
	 * @returns {ArchiveChat[]} Чаты, отсортированные по времени последнего синка.
	 */
	listChats(limit = 100): ArchiveChat[] {
		const rows = this.db
			.prepare(
				`
				SELECT
					c.chat_id,
					c.title,
					c.username,
					c.type,
					c.last_synced_at,
					c.extra_json,
					COUNT(m.message_pk) AS message_count
				FROM chats c
				LEFT JOIN messages m ON m.chat_id = c.chat_id
				GROUP BY c.chat_id
				ORDER BY COALESCE(c.last_synced_at, '') DESC, c.title ASC
				LIMIT ?
			`
			)
			.all(limit) as Array<{
			chat_id: string;
			title: string;
			username?: string | null;
			type: 'channel' | 'group' | 'chat' | 'unknown';
			last_synced_at?: string | null;
			extra_json?: string | null;
			message_count: number;
		}>;

		return rows.map(row => ({
			chatId: row.chat_id,
			title: row.title,
			username: row.username,
			type: row.type,
			lastSyncedAt: row.last_synced_at,
			messageCount: Number(row.message_count || 0),
			extra: this.parseJson(row.extra_json),
		}));
	}

	/**
	 * @description Читает архивные сообщения чата от новых к старым.
	 * @param {string} chatId - Идентификатор чата в архиве.
	 * @param {number} limit - Максимум сообщений.
	 * @param {number} offset - Смещение пагинации.
	 * @returns {ArchiveMessage[]} Страница сообщений.
	 */
	listMessages(chatId: string, limit = 100, offset = 0): ArchiveMessage[] {
		const rows = this.db
			.prepare(
				`
				SELECT *
				FROM messages
				WHERE chat_id = ?
				ORDER BY message_id DESC
				LIMIT ? OFFSET ?
			`
			)
			.all(chatId, limit, offset) as any[];

		return rows.map(row => this.mapMessageRow(row));
	}

	/**
	 * @description Возвращает число сообщений в одном архивном чате.
	 * @param {string} chatId - Идентификатор чата.
	 * @returns {number} Количество сохранённых сообщений.
	 */
	countMessages(chatId: string): number {
		const row = this.db
			.prepare('SELECT COUNT(*) AS count FROM messages WHERE chat_id = ?')
			.get(chatId) as { count: number };

		return Number(row?.count || 0);
	}

	/**
	 * @description Возвращает полный временной диапазон сообщений чата в локальной БД.
	 * @param {string} chatId - Идентификатор чата.
	 * @returns {{ oldestTimestampUtc: string | null; newestTimestampUtc: string | null }} Временные границы по всей таблице сообщений чата.
	 */
	getMessagesTimeRange(chatId: string): {
		oldestTimestampUtc: string | null;
		newestTimestampUtc: string | null;
	} {
		const row = this.db
			.prepare(
				`
				SELECT
					MIN(timestamp_utc) AS oldest_timestamp_utc,
					MAX(timestamp_utc) AS newest_timestamp_utc
				FROM messages
				WHERE chat_id = ?
			`
			)
			.get(chatId) as
			| {
					oldest_timestamp_utc?: string | null;
					newest_timestamp_utc?: string | null;
			  }
			| undefined;
		return {
			oldestTimestampUtc: row?.oldest_timestamp_utc ?? null,
			newestTimestampUtc: row?.newest_timestamp_utc ?? null,
		};
	}

	/**
	 * @description Возвращает минимальный `message_id` в архиве чата как курсор для backfill через Telegram `maxId`.
	 * @param {string} chatId - Идентификатор чата.
	 * @returns {number | null} Самый старый id сообщения или null, если архив пуст.
	 */
	getOldestMessageId(chatId: string): number | null {
		const row = this.db
			.prepare(
				'SELECT MIN(message_id) AS oldest_message_id FROM messages WHERE chat_id = ?'
			)
			.get(chatId) as { oldest_message_id?: number | null } | undefined;
		return row?.oldest_message_id ?? null;
	}

	/**
	 * @description Читает метаданные чата из локального архива, чтобы выбрать корректный peer для Telegram API.
	 * @param {string} chatId - Идентификатор чата.
	 * @returns {ArchiveChat | null} Чат или null.
	 */
	getChat(chatId: string): ArchiveChat | null {
		const row = this.db
			.prepare(
				`
				SELECT c.chat_id, c.title, c.username, c.type, c.last_synced_at, c.extra_json,
				       COUNT(m.message_pk) AS message_count
				FROM chats c
				LEFT JOIN messages m ON m.chat_id = c.chat_id
				WHERE c.chat_id = ?
				GROUP BY c.chat_id
			`
			)
			.get(chatId) as
			| {
					chat_id: string;
					title: string;
					username?: string | null;
					type: 'channel' | 'group' | 'chat' | 'unknown';
					last_synced_at?: string | null;
					extra_json?: string | null;
					message_count: number;
			  }
			| undefined;

		if (!row) {
			return null;
		}

		return {
			chatId: row.chat_id,
			title: row.title,
			username: row.username,
			type: row.type,
			lastSyncedAt: row.last_synced_at,
			messageCount: Number(row.message_count || 0),
			extra: this.parseJson(row.extra_json),
		};
	}

	/**
	 * @description Удаляет чат из архива: каскадно уходят сообщения, sync_state и sync_runs (см. схему SQLite).
	 * @param {string} chatId - Идентификатор чата в архиве.
	 * @returns {{ deleted: boolean }} deleted — была ли удалена хотя бы одна строка в `chats`.
	 */
	deleteChat(chatId: string): { deleted: boolean } {
		const result = this.db
			.prepare('DELETE FROM chats WHERE chat_id = ?')
			.run(chatId);

		return { deleted: result.changes > 0 };
	}

	/**
	 * @description Возвращает одно архивное сообщение по стабильному первичному ключу.
	 * @param {string} messagePk - Стабильный ключ сообщения (например `telegram:...`).
	 * @returns {ArchiveMessage | null} Сообщение или null, если не найдено.
	 */
	getMessage(messagePk: string): ArchiveMessage | null {
		const row = this.db
			.prepare('SELECT * FROM messages WHERE message_pk = ?')
			.get(messagePk) as any;

		return row ? this.mapMessageRow(row) : null;
	}

	/**
	 * @description Возвращает состояние синхронизации для одного чата или всех чатов,
	 * если `chatId` не передан.
	 * @param {string | undefined} chatId - Опциональный фильтр по чату.
	 * @returns {ArchiveSyncState[] | ArchiveSyncState | null} Данные состояния синка.
	 */
	getSyncState(chatId?: string): ArchiveSyncState[] | ArchiveSyncState | null {
		if (chatId) {
			const row = this.db
				.prepare('SELECT * FROM sync_state WHERE chat_id = ?')
				.get(chatId) as any;

			return row ? this.mapSyncStateRow(row) : null;
		}

		const rows = this.db
			.prepare(
				"SELECT * FROM sync_state ORDER BY COALESCE(last_sync_finished_at, '') DESC"
			)
			.all() as any[];

		return rows.map(row => this.mapSyncStateRow(row));
	}

	/**
	 * @description Читает последний курсор сообщения для инкрементальной синхронизации.
	 * @param {string} chatId - Идентификатор чата.
	 * @returns {number | null} Сохранённый id сообщения-курсора или null при первом синке.
	 */
	getLastMessageId(chatId: string): number | null {
		const row = this.db
			.prepare('SELECT last_message_id FROM sync_state WHERE chat_id = ?')
			.get(chatId) as { last_message_id?: number | null } | undefined;

		return row?.last_message_id ?? null;
	}

	/**
	 * @description Выполняет связанные записи архива атомарно: пакет синка не оставит
	 * частично записанные сообщения без обновления курсора.
	 * @param {() => T} callback - Работа внутри транзакции.
	 * @returns {T} Результат callback.
	 */
	transaction<T>(callback: () => T): T {
		return this.db.transaction(callback)();
	}

	private mapMessageRow(row: any): ArchiveMessage {
		return {
			messagePk: row.message_pk,
			chatId: row.chat_id,
			messageId: row.message_id,
			senderId: row.sender_id,
			timestampUtc: row.timestamp_utc,
			editTimestampUtc: row.edit_timestamp_utc,
			replyToMessageId: row.reply_to_message_id,
			threadId: row.thread_id,
			textRaw: row.text_raw,
			textNormalized: row.text_normalized,
			reactions: this.parseJson(row.reactions_json),
			entities: this.parseJson(row.entities_json),
			forward: this.parseJson(row.forward_json),
			service: this.parseJson(row.service_json),
			contentHash: row.content_hash,
		};
	}

	private mapSyncStateRow(row: any): ArchiveSyncState {
		return {
			chatId: row.chat_id,
			lastMessageId: row.last_message_id,
			lastSyncStartedAt: row.last_sync_started_at,
			lastSyncFinishedAt: row.last_sync_finished_at,
			status: row.status,
			errorText: row.error_text,
		};
	}

	private parseJson(value?: string | null): Record<string, unknown> | null {
		if (!value) {
			return null;
		}

		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}
}
