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

			CREATE TABLE IF NOT EXISTS eternal_ai_effect_jobs (
				request_id TEXT PRIMARY KEY,
				conversation_id TEXT NOT NULL,
				user_message_id TEXT NOT NULL,
				effect_id TEXT NOT NULL,
				effect_tag TEXT,
				status TEXT NOT NULL,
				result_url TEXT,
				error_text TEXT,
				assistant_message_id TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				FOREIGN KEY (conversation_id) REFERENCES eternal_ai_conversations(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_effect_jobs_conversation
				ON eternal_ai_effect_jobs(conversation_id, created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_effect_jobs_terminal_updated
				ON eternal_ai_effect_jobs(status, updated_at);

			CREATE TABLE IF NOT EXISTS eternal_ai_artifacts (
				id TEXT PRIMARY KEY,
				conversation_id TEXT,
				artifact_type TEXT NOT NULL,
				context TEXT NOT NULL DEFAULT 'source',
				source_type TEXT NOT NULL,
				source_id TEXT NOT NULL,
				scope_kind TEXT NOT NULL,
				scope_id TEXT,
				text TEXT NOT NULL,
				embedding_text TEXT NOT NULL,
				source_unit_ids_json TEXT,
				source_refs_json TEXT,
				metadata_json TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				FOREIGN KEY (conversation_id) REFERENCES eternal_ai_conversations(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_artifacts_scope
				ON eternal_ai_artifacts(scope_kind, scope_id, context, artifact_type, updated_at DESC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_artifacts_conversation
				ON eternal_ai_artifacts(conversation_id, updated_at DESC);

			CREATE TABLE IF NOT EXISTS eternal_ai_turn_traces (
				id TEXT PRIMARY KEY,
				conversation_id TEXT NOT NULL,
				model TEXT NOT NULL,
				status TEXT NOT NULL,
				input_text TEXT NOT NULL,
				prompt_text TEXT NOT NULL,
				raw_response TEXT NOT NULL,
				parsed_response_json TEXT,
				recalled_artifacts_json TEXT NOT NULL,
				prompt_fragments_json TEXT NOT NULL,
				timings_json TEXT NOT NULL,
				error_text TEXT,
				started_at TEXT NOT NULL,
				finished_at TEXT NOT NULL,
				FOREIGN KEY (conversation_id) REFERENCES eternal_ai_conversations(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_turn_traces_conversation
				ON eternal_ai_turn_traces(conversation_id, started_at DESC);
		`);
		this.ensureArtifactContextColumn();
		this.dropLegacyMediaJobsTable();
	}

	/**
	 * @description Удаляет устаревшую таблицу `eternal_ai_media_jobs` из старых файлов БД
	 * (черновик схемы без текущего кода). В текущем коде таблица не используется; повторный вызов безопасен.
	 * @returns {void}
	 */
	private dropLegacyMediaJobsTable(): void {
		this.db.exec(`DROP TABLE IF EXISTS eternal_ai_media_jobs`);
	}

	/**
	 * @description Добавляет обязательный столбец `context` в существующие базы,
	 * созданные до сужения artifact contract для Eternal AI.
	 * @returns {void}
	 */
	private ensureArtifactContextColumn(): void {
		const columns = this.db
			.prepare(`PRAGMA table_info(eternal_ai_artifacts)`)
			.all() as Array<{ name: string }>;
		if (columns.some(column => column.name === 'context')) {
			return;
		}
		this.db.exec(
			`ALTER TABLE eternal_ai_artifacts ADD COLUMN context TEXT NOT NULL DEFAULT 'source'`
		);
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
