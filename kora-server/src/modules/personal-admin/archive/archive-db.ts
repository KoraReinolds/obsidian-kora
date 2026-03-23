/**
 * @module modules/personal-admin/archive/archive-db
 *
 * @description Владеет подключением SQLite к архиву Telegram. Архив — локальный
 * канонический источник данных без потерь, от которого позже читают AI-слои;
 * создание схемы и миграции сосредоточены здесь, а не размазаны по маршрутам
 * и логике синхронизации.
 *
 * @requires node:fs - создание каталога БД перед открытием SQLite
 * @requires node:path - разрешение стабильного пути к файлу БД по умолчанию
 * @requires better-sqlite3 - синхронный драйвер SQLite для локального архива
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { ArchiveDatabaseConfig } from './archive-types.js';

/**
 * @description Обёртка над SQLite для подсистемы архива. При первом обращении
 * создаёт схему, чтобы маршруты и репозитории могли полагаться на наличие таблиц.
 */
export class ArchiveDatabase {
	private readonly databasePath: string;
	private readonly db: Database.Database;

	constructor(config: ArchiveDatabaseConfig = {}) {
		this.databasePath = this.resolveDatabasePath(config.databasePath);
		fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
		this.db = new Database(this.databasePath);
		this.db.pragma('journal_mode = WAL');
		this.db.pragma('foreign_keys = ON');
		this.initializeSchema();
	}

	/**
	 * @description Возвращает сырой хэндл SQLite для репозиториев с prepared statements
	 * и транзакциями.
	 * @returns {Database.Database} Открытый экземпляр better-sqlite3.
	 */
	getConnection(): Database.Database {
		return this.db;
	}

	/**
	 * @description Итоговый путь к файлу БД для UI и отладки.
	 * @returns {string} Абсолютный путь к файлу SQLite архива.
	 */
	getDatabasePath(): string {
		return this.databasePath;
	}

	/**
	 * @description Закрывает подключение SQLite при пересоздании владельца архива
	 * после смены конфигурации (например, пути к БД).
	 * @returns {void}
	 */
	close(): void {
		this.db.close();
	}

	/**
	 * @description Создаёт схему MVP. JSON-подобные поля хранятся в TEXT намеренно,
	 * чтобы первая версия оставалась гибкой при эволюции и сохраняла структурированные
	 * метаданные Telegram без жёсткой нормализации в десятки колонок.
	 * @returns {void}
	 */
	private initializeSchema(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS chats (
				chat_id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				username TEXT,
				type TEXT NOT NULL DEFAULT 'unknown',
				last_synced_at TEXT,
				extra_json TEXT
			);

			CREATE TABLE IF NOT EXISTS participants (
				participant_id TEXT PRIMARY KEY,
				username TEXT,
				display_name TEXT,
				is_bot INTEGER NOT NULL DEFAULT 0,
				extra_json TEXT
			);

			CREATE TABLE IF NOT EXISTS messages (
				message_pk TEXT PRIMARY KEY,
				chat_id TEXT NOT NULL,
				message_id INTEGER NOT NULL,
				sender_id TEXT,
				timestamp_utc TEXT NOT NULL,
				edit_timestamp_utc TEXT,
				reply_to_message_id INTEGER,
				thread_id TEXT,
				text_raw TEXT,
				text_normalized TEXT,
				reactions_json TEXT,
				entities_json TEXT,
				forward_json TEXT,
				service_json TEXT,
				content_hash TEXT NOT NULL,
				UNIQUE(chat_id, message_id),
				FOREIGN KEY(chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE,
				FOREIGN KEY(sender_id) REFERENCES participants(participant_id)
			);

			CREATE TABLE IF NOT EXISTS sync_state (
				chat_id TEXT PRIMARY KEY,
				last_message_id INTEGER,
				last_sync_started_at TEXT,
				last_sync_finished_at TEXT,
				status TEXT NOT NULL DEFAULT 'idle',
				error_text TEXT,
				FOREIGN KEY(chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE
			);

			CREATE TABLE IF NOT EXISTS sync_runs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				chat_id TEXT NOT NULL,
				peer TEXT NOT NULL,
				started_at TEXT NOT NULL,
				finished_at TEXT NOT NULL,
				status TEXT NOT NULL,
				inserted INTEGER NOT NULL DEFAULT 0,
				updated INTEGER NOT NULL DEFAULT 0,
				skipped INTEGER NOT NULL DEFAULT 0,
				total_processed INTEGER NOT NULL DEFAULT 0,
				first_message_id INTEGER,
				last_message_id INTEGER,
				error_text TEXT,
				FOREIGN KEY(chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp
				ON messages(chat_id, timestamp_utc DESC);
			CREATE INDEX IF NOT EXISTS idx_messages_chat_message_id
				ON messages(chat_id, message_id DESC);
			CREATE INDEX IF NOT EXISTS idx_sync_runs_chat_finished
				ON sync_runs(chat_id, finished_at DESC);
		`);
	}

	/**
	 * @description Разрешает путь к файлу архива. Папка по умолчанию `kora-server/data`
	 * упрощает бэкап и перенос; сервис остаётся единственным владельцем канонического хранилища.
	 * @param {string | undefined} configuredPath - Путь из runtime-конфига (опционально).
	 * @returns {string} Абсолютный путь к файлу SQLite.
	 */
	private resolveDatabasePath(configuredPath?: string): string {
		if (configuredPath) {
			return path.isAbsolute(configuredPath)
				? configuredPath
				: path.resolve(process.cwd(), configuredPath);
		}

		return path.resolve(process.cwd(), 'data', 'telegram-archive.sqlite');
	}
}
