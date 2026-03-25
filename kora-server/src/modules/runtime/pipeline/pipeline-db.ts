/**
 * @module modules/runtime/pipeline/pipeline-db
 * @description SQLite-хранилище для run/result minimal pipeline runtime.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface PipelineDatabaseConfig {
	databasePath?: string;
}

export class PipelineDatabase {
	private readonly databasePath: string;
	private readonly db: Database.Database;

	constructor(config: PipelineDatabaseConfig = {}) {
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
			CREATE TABLE IF NOT EXISTS pipeline_runs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				step_key TEXT NOT NULL,
				step_label TEXT NOT NULL,
				status TEXT NOT NULL,
				chat_id TEXT NOT NULL,
				selection_scope TEXT NOT NULL,
				selection_json TEXT NOT NULL,
				options_json TEXT NOT NULL,
				available_count INTEGER NOT NULL DEFAULT 0,
				processed_count INTEGER NOT NULL DEFAULT 0,
				truncated INTEGER NOT NULL DEFAULT 0,
				warning_count INTEGER NOT NULL DEFAULT 0,
				error_text TEXT,
				summary_json TEXT,
				result_json TEXT,
				started_at TEXT NOT NULL,
				finished_at TEXT
			);

			CREATE TABLE IF NOT EXISTS pipeline_artifacts (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				run_id INTEGER NOT NULL,
				artifact_key TEXT NOT NULL,
				kind TEXT NOT NULL,
				title TEXT NOT NULL,
				item_count INTEGER NOT NULL DEFAULT 0,
				preview_json TEXT NOT NULL,
				payload_json TEXT NOT NULL,
				created_at TEXT NOT NULL,
				FOREIGN KEY(run_id) REFERENCES pipeline_runs(id) ON DELETE CASCADE,
				UNIQUE(run_id, artifact_key)
			);

			CREATE INDEX IF NOT EXISTS idx_pipeline_runs_step_started
				ON pipeline_runs(step_key, started_at DESC);
			CREATE INDEX IF NOT EXISTS idx_pipeline_runs_chat_started
				ON pipeline_runs(chat_id, started_at DESC);
			CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status_started
				ON pipeline_runs(status, started_at DESC);
			CREATE INDEX IF NOT EXISTS idx_pipeline_artifacts_run
				ON pipeline_artifacts(run_id, id ASC);
		`);
	}

	private resolveDatabasePath(configuredPath?: string): string {
		if (configuredPath) {
			return path.isAbsolute(configuredPath)
				? configuredPath
				: path.resolve(process.cwd(), configuredPath);
		}

		return path.resolve(process.cwd(), 'data', 'pipeline-runtime.sqlite');
	}
}
