/**
 * @module modules/eternal-ai/eternal-ai-db
 * @description Локальная SQLite-база нового turn-centric слоя Eternal AI. Файл
 * хранится отдельно от legacy-истории; если указать старый путь, схема будет
 * радикально пересоздана без попыток читать прежнюю структуру.
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
		if (this.hasCurrentSchema()) {
			this.createIndexes();
			return;
		}

		const resetSchema = this.db.transaction(() => {
			this.dropAllEternalAiTables();
			this.createTables();
			this.createIndexes();
		});

		resetSchema();
	}

	private hasCurrentSchema(): boolean {
		const table = this.db
			.prepare(
				`
					SELECT name
					FROM sqlite_master
					WHERE type = 'table' AND name = 'eternal_ai_turns'
				`
			)
			.get() as { name: string } | undefined;

		return Boolean(table);
	}

	private dropAllEternalAiTables(): void {
		this.db.exec(`
			DROP TABLE IF EXISTS eternal_ai_effect_jobs;
			DROP TABLE IF EXISTS eternal_ai_artifacts;
			DROP TABLE IF EXISTS eternal_ai_turn_traces;
			DROP TABLE IF EXISTS eternal_ai_messages;
			DROP TABLE IF EXISTS eternal_ai_turns;
			DROP TABLE IF EXISTS eternal_ai_conversations;
			DROP TABLE IF EXISTS eternal_ai_media_jobs;
		`);
	}

	private createTables(): void {
		this.db.exec(`
			CREATE TABLE eternal_ai_conversations (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				model TEXT NOT NULL,
				system_prompt TEXT,
				head_turn_id TEXT,
				last_message_preview TEXT,
				last_message_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE eternal_ai_turns (
				id TEXT PRIMARY KEY,
				conversation_id TEXT NOT NULL,
				parent_turn_id TEXT,
				turn_kind TEXT NOT NULL,
				status TEXT NOT NULL,
				model TEXT,
				error_text TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				FOREIGN KEY (conversation_id) REFERENCES eternal_ai_conversations(id) ON DELETE CASCADE
			);

			CREATE TABLE eternal_ai_messages (
				id TEXT PRIMARY KEY,
				conversation_id TEXT NOT NULL,
				turn_id TEXT NOT NULL,
				role TEXT NOT NULL,
				content_text TEXT NOT NULL,
				model TEXT,
				status TEXT NOT NULL,
				error_text TEXT,
				attachments_json TEXT,
				metadata_json TEXT,
				created_at TEXT NOT NULL,
				FOREIGN KEY (conversation_id) REFERENCES eternal_ai_conversations(id) ON DELETE CASCADE,
				FOREIGN KEY (turn_id) REFERENCES eternal_ai_turns(id) ON DELETE CASCADE
			);

			CREATE TABLE eternal_ai_turn_traces (
				id TEXT PRIMARY KEY,
				conversation_id TEXT NOT NULL,
				turn_id TEXT NOT NULL UNIQUE,
				model TEXT NOT NULL,
				status TEXT NOT NULL,
				prompt_text TEXT NOT NULL,
				raw_response TEXT NOT NULL,
				recalled_artifacts_json TEXT NOT NULL,
				prompt_fragments_json TEXT NOT NULL,
				parsed_actions_json TEXT NOT NULL,
				parsed_memory_candidates_json TEXT NOT NULL,
				parsed_environment_patch_json TEXT,
				parsed_used_structured_blocks INTEGER NOT NULL DEFAULT 0,
				timings_json TEXT NOT NULL,
				error_text TEXT,
				started_at TEXT NOT NULL,
				finished_at TEXT NOT NULL,
				FOREIGN KEY (conversation_id) REFERENCES eternal_ai_conversations(id) ON DELETE CASCADE,
				FOREIGN KEY (turn_id) REFERENCES eternal_ai_turns(id) ON DELETE CASCADE
			);

			CREATE TABLE eternal_ai_artifacts (
				id TEXT PRIMARY KEY,
				conversation_id TEXT,
				created_by_turn_id TEXT,
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
				FOREIGN KEY (conversation_id) REFERENCES eternal_ai_conversations(id) ON DELETE CASCADE,
				FOREIGN KEY (created_by_turn_id) REFERENCES eternal_ai_turns(id) ON DELETE CASCADE
			);

			CREATE TABLE eternal_ai_effect_jobs (
				request_id TEXT PRIMARY KEY,
				conversation_id TEXT NOT NULL,
				turn_id TEXT NOT NULL,
				effect_id TEXT NOT NULL,
				effect_tag TEXT,
				status TEXT NOT NULL,
				result_url TEXT,
				error_text TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				FOREIGN KEY (conversation_id) REFERENCES eternal_ai_conversations(id) ON DELETE CASCADE,
				FOREIGN KEY (turn_id) REFERENCES eternal_ai_turns(id) ON DELETE CASCADE
			);
		`);
	}

	private createIndexes(): void {
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_conversations_updated
				ON eternal_ai_conversations(updated_at DESC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_turns_conversation_created
				ON eternal_ai_turns(conversation_id, created_at ASC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_messages_turn_created
				ON eternal_ai_messages(turn_id, created_at ASC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_messages_conversation_created
				ON eternal_ai_messages(conversation_id, created_at ASC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_turn_traces_conversation
				ON eternal_ai_turn_traces(conversation_id, started_at DESC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_artifacts_scope
				ON eternal_ai_artifacts(scope_kind, scope_id, context, artifact_type, updated_at DESC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_artifacts_conversation
				ON eternal_ai_artifacts(conversation_id, updated_at DESC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_effect_jobs_turn
				ON eternal_ai_effect_jobs(turn_id, created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_eternal_ai_effect_jobs_terminal_updated
				ON eternal_ai_effect_jobs(status, updated_at);
		`);
	}

	private resolveDatabasePath(configuredPath?: string): string {
		if (configuredPath) {
			return path.isAbsolute(configuredPath)
				? configuredPath
				: path.resolve(process.cwd(), configuredPath);
		}

		return path.resolve(process.cwd(), 'data', 'eternal-ai-turns.sqlite');
	}
}
