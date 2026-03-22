/**
 * @module semantic-sqlite/sqlite-semantic-db
 * @description Владеет SQLite-файлом semantic index-а. База хранит канонические чанки,
 * embeddings и FTS-слой в одном локальном хранилище, чтобы semantic backend больше не
 * зависел от внешней vector database.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface SQLiteSemanticDatabaseConfig {
	databasePath?: string;
}

export class SQLiteSemanticDatabase {
	private readonly databasePath: string;
	private readonly db: Database.Database;

	constructor(config: SQLiteSemanticDatabaseConfig = {}) {
		this.databasePath = this.resolveDatabasePath(config.databasePath);
		fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
		this.db = new Database(this.databasePath);
		this.db.pragma('journal_mode = WAL');
		this.db.pragma('foreign_keys = ON');
		this.db.pragma('busy_timeout = 5000');
		this.initializeSchema();
	}

	/**
	 * @description Возвращает открытый `better-sqlite3` connection.
	 * @returns {Database.Database} Открытый экземпляр SQLite.
	 */
	getConnection(): Database.Database {
		return this.db;
	}

	/**
	 * @description Возвращает итоговый путь к SQLite-файлу semantic index-а.
	 * @returns {string} Абсолютный путь к БД.
	 */
	getDatabasePath(): string {
		return this.databasePath;
	}

	/**
	 * @description Закрывает соединение SQLite при reset/reconfigure backend-а.
	 * @returns {void}
	 */
	close(): void {
		this.db.close();
	}

	/**
	 * @description Создаёт схему canonical chunks + embeddings и виртуальную таблицу FTS5.
	 * Без FTS5 semantic index не поднимается — ошибка пробрасывается сразу.
	 * @returns {void}
	 */
	private initializeSchema(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS chunks (
				point_id TEXT PRIMARY KEY,
				original_id TEXT NOT NULL,
				content_type TEXT NOT NULL,
				title TEXT,
				content TEXT NOT NULL,
				content_hash TEXT NOT NULL,
				chunk_id TEXT,
				metadata_json TEXT NOT NULL,
				payload_json TEXT NOT NULL,
				vectorized_at TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS chunk_embeddings (
				point_id TEXT PRIMARY KEY,
				embedding_json TEXT NOT NULL,
				embedding_model TEXT NOT NULL,
				embedding_dimensions INTEGER NOT NULL,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY(point_id) REFERENCES chunks(point_id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_chunks_original_id
				ON chunks(original_id);
			CREATE INDEX IF NOT EXISTS idx_chunks_content_type
				ON chunks(content_type);
			CREATE INDEX IF NOT EXISTS idx_chunks_chunk_id
				ON chunks(chunk_id);
			CREATE INDEX IF NOT EXISTS idx_chunks_content_hash
				ON chunks(content_hash);
		`);

		this.db.exec(`
			CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
			USING fts5(
				point_id UNINDEXED,
				title,
				content
			);
		`);
	}

	/**
	 * @description Разрешает путь к semantic SQLite-файлу.
	 * @param {string | undefined} configuredPath - Путь из runtime-конфига.
	 * @returns {string} Абсолютный путь к SQLite-файлу.
	 */
	private resolveDatabasePath(configuredPath?: string): string {
		if (configuredPath) {
			return path.isAbsolute(configuredPath)
				? configuredPath
				: path.resolve(process.cwd(), configuredPath);
		}

		return path.resolve(process.cwd(), 'data', 'semantic-index.sqlite');
	}
}
