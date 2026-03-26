/**
 * @module modules/eternal-ai/eternal-ai-db
 * @description Локальная SQLite-база для истории Eternal AI. История хранится
 * отдельно от Telegram archive, чтобы жизненный цикл AI-чатов, миграции и
 * возможный сброс не затрагивали канонический архив сообщений.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface EternalAiDatabaseConfig {
	databasePath?: string;
}

export class EternalAiDatabase {
	private readonly databasePath: string;
	private readonly db: Database.Database;

	constructor(config: EternalAiDatabaseConfig = {}) {
		this.databasePath = this.resolveDatabasePath(config.databasePath);
		fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
		this.db = new Database(this.databasePath);
		this.db.pragma('journal_mode = WAL');
		this.db.pragma('foreign_keys = ON');
		this.db.pragma('busy_timeout = 5000');
		this.initializeSchema();
	}

	getConnection(): Database.Database {
		return this.db;
	}

	getDatabasePath(): string {
		return this.databasePath;
	}

	close(): void {
		this.db.close();
	}

	private initializeSchema(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS eternal_ai_conversations (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				model TEXT NOT NULL,
				system_prompt TEXT,
				last_message_preview TEXT,
				last_message_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS eternal_ai_messages (
				id TEXT PRIMARY KEY,
				conversation_id TEXT NOT NULL,
				role TEXT NOT NULL,
				content_text TEXT NOT NULL,
				model TEXT,
				status TEXT NOT NULL DEFAULT 'complete',
				error_text TEXT,
				attachments_json TEXT,
				metadata_json TEXT,
				created_at TEXT NOT NULL,
				FOREIGN KEY(conversation_id) REFERENCES eternal_ai_conversations(id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_eternal_ai_messages_conversation_created
				ON eternal_ai_messages(conversation_id, created_at ASC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_conversations_updated
				ON eternal_ai_conversations(updated_at DESC);
		`);
	}

	private resolveDatabasePath(configuredPath?: string): string {
		if (configuredPath) {
			return path.isAbsolute(configuredPath)
				? configuredPath
				: path.resolve(process.cwd(), configuredPath);
		}

		return path.resolve(process.cwd(), 'data', 'eternal-ai-chat.sqlite');
	}
}
