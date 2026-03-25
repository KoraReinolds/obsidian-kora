/**
 * @module modules/runtime/pipeline/pipeline-repository
 * @description Репозиторий run/result minimal pipeline runtime.
 */

import type Database from 'better-sqlite3';
import type {
	PipelineArtifactInsert,
	PipelineArtifactRecord,
	PipelineRunRecord,
	PipelineRunStatus,
	PipelineSelection,
	PipelineStepOptions,
} from './types.js';

interface PipelineRunRow {
	id: number;
	step_key: string;
	step_label: string;
	status: PipelineRunStatus;
	chat_id: string;
	selection_scope: PipelineSelection['scope'];
	selection_json: string;
	options_json: string;
	available_count: number;
	processed_count: number;
	truncated: number;
	warning_count: number;
	error_text: string | null;
	summary_json: string | null;
	result_json: string | null;
	started_at: string;
	finished_at: string | null;
}

interface PipelineArtifactRow {
	id: number;
	run_id: number;
	artifact_key: string;
	kind: string;
	title: string;
	item_count: number;
	preview_json: string;
	payload_json: string;
	created_at: string;
}

export interface PipelineRunInsert {
	stepKey: string;
	stepLabel: string;
	status: PipelineRunStatus;
	chatId: string;
	selection: PipelineSelection;
	options: Required<PipelineStepOptions>;
	availableCount: number;
	processedCount: number;
	truncated: boolean;
	warningCount: number;
	errorText: string | null;
	startedAt: string;
}

export interface PipelineRunFinish {
	status: PipelineRunStatus;
	processedCount: number;
	truncated: boolean;
	warningCount: number;
	errorText: string | null;
	summary: Record<string, unknown> | null;
	result: Record<string, unknown> | null;
	finishedAt: string;
}

export interface PipelineRunListFilters {
	stepKey?: string;
	status?: PipelineRunStatus;
	chatId?: string;
	limit?: number;
}

export class PipelineRepository {
	constructor(private readonly db: Database.Database) {}

	insertRun(input: PipelineRunInsert): number {
		const statement = this.db.prepare(`
			INSERT INTO pipeline_runs (
				step_key,
				step_label,
				status,
				chat_id,
				selection_scope,
				selection_json,
				options_json,
				available_count,
				processed_count,
				truncated,
				warning_count,
				error_text,
				started_at
			)
			VALUES (
				@stepKey,
				@stepLabel,
				@status,
				@chatId,
				@selectionScope,
				@selectionJson,
				@optionsJson,
				@availableCount,
				@processedCount,
				@truncated,
				@warningCount,
				@errorText,
				@startedAt
			)
		`);
		const result = statement.run({
			...input,
			selectionScope: input.selection.scope,
			selectionJson: JSON.stringify(input.selection),
			optionsJson: JSON.stringify(input.options),
			truncated: input.truncated ? 1 : 0,
		});
		return Number(result.lastInsertRowid);
	}

	finishRun(runId: number, input: PipelineRunFinish): void {
		this.db
			.prepare(
				`
				UPDATE pipeline_runs
				SET
					status = @status,
					processed_count = @processedCount,
					truncated = @truncated,
					warning_count = @warningCount,
					error_text = @errorText,
					summary_json = @summaryJson,
					result_json = @resultJson,
					finished_at = @finishedAt
				WHERE id = @runId
			`
			)
			.run({
				runId,
				...input,
				truncated: input.truncated ? 1 : 0,
				summaryJson: this.stringifyJson(input.summary),
				resultJson: this.stringifyJson(input.result),
			});
	}

	insertArtifacts(runId: number, artifacts: PipelineArtifactInsert[]): void {
		if (artifacts.length === 0) {
			return;
		}

		const statement = this.db.prepare(`
			INSERT INTO pipeline_artifacts (
				run_id,
				artifact_key,
				kind,
				title,
				item_count,
				preview_json,
				payload_json,
				created_at
			)
			VALUES (
				@runId,
				@artifactKey,
				@kind,
				@title,
				@itemCount,
				@previewJson,
				@payloadJson,
				@createdAt
			)
			ON CONFLICT(run_id, artifact_key) DO UPDATE SET
				kind = excluded.kind,
				title = excluded.title,
				item_count = excluded.item_count,
				preview_json = excluded.preview_json,
				payload_json = excluded.payload_json,
				created_at = excluded.created_at
		`);

		const insertMany = this.db.transaction(() => {
			for (const artifact of artifacts) {
				statement.run({
					runId,
					artifactKey: artifact.artifactKey,
					kind: artifact.kind,
					title: artifact.title,
					itemCount: artifact.itemCount,
					previewJson: this.stringifyJson(artifact.preview),
					payloadJson: this.stringifyJson(artifact.payload),
					createdAt: artifact.createdAt,
				});
			}
		});

		insertMany();
	}

	listRuns(filters: PipelineRunListFilters = {}): {
		total: number;
		runs: PipelineRunRecord[];
	} {
		const where: string[] = [];
		const params: Record<string, unknown> = {};

		if (filters.stepKey) {
			where.push('step_key = @stepKey');
			params.stepKey = filters.stepKey;
		}
		if (filters.status) {
			where.push('status = @status');
			params.status = filters.status;
		}
		if (filters.chatId) {
			where.push('chat_id = @chatId');
			params.chatId = filters.chatId;
		}

		const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
		const totalRow = this.db
			.prepare(`SELECT COUNT(*) AS total FROM pipeline_runs ${whereClause}`)
			.get(params) as { total: number };

		const limit = Math.min(200, Math.max(1, filters.limit || 50));
		const rows = this.db
			.prepare(
				`
				SELECT *
				FROM pipeline_runs
				${whereClause}
				ORDER BY started_at DESC, id DESC
				LIMIT @limit
			`
			)
			.all({ ...params, limit }) as PipelineRunRow[];

		return {
			total: Number(totalRow?.total || 0),
			runs: rows.map(row => this.mapRunRow(row)),
		};
	}

	getRun(runId: number): PipelineRunRecord | null {
		const row = this.db
			.prepare('SELECT * FROM pipeline_runs WHERE id = ?')
			.get(runId) as PipelineRunRow | undefined;
		return row ? this.mapRunRow(row) : null;
	}

	getArtifacts(runId: number): PipelineArtifactRecord[] {
		const rows = this.db
			.prepare(
				`
				SELECT *
				FROM pipeline_artifacts
				WHERE run_id = ?
				ORDER BY id ASC
			`
			)
			.all(runId) as PipelineArtifactRow[];

		return rows.map(row => this.mapArtifactRow(row));
	}

	getArtifact(artifactId: number): PipelineArtifactRecord | null {
		const row = this.db
			.prepare('SELECT * FROM pipeline_artifacts WHERE id = ?')
			.get(artifactId) as PipelineArtifactRow | undefined;
		return row ? this.mapArtifactRow(row) : null;
	}

	private mapRunRow(row: PipelineRunRow): PipelineRunRecord {
		return {
			id: row.id,
			stepKey: row.step_key as PipelineRunRecord['stepKey'],
			stepLabel: row.step_label,
			status: row.status,
			selection: this.parseJson(row.selection_json) as PipelineSelection,
			options: this.parseJson(
				row.options_json
			) as Required<PipelineStepOptions>,
			availableCount: Number(row.available_count || 0),
			processedCount: Number(row.processed_count || 0),
			warningCount: Number(row.warning_count || 0),
			errorText: row.error_text,
			truncated: Boolean(row.truncated),
			summary: this.parseJson(row.summary_json) as Record<
				string,
				unknown
			> | null,
			result: this.parseJson(row.result_json) as Record<string, unknown> | null,
			startedAt: row.started_at,
			finishedAt: row.finished_at,
		};
	}

	private mapArtifactRow(row: PipelineArtifactRow): PipelineArtifactRecord {
		return {
			id: row.id,
			runId: row.run_id,
			artifactKey: row.artifact_key,
			kind: row.kind,
			title: row.title,
			itemCount: Number(row.item_count || 0),
			preview: this.parseJson(row.preview_json),
			payload: this.parseJson(row.payload_json),
			createdAt: row.created_at,
		};
	}

	private stringifyJson(value: unknown): string {
		return JSON.stringify(value ?? null);
	}

	private parseJson(
		value?: string | null
	): Record<string, unknown> | unknown[] | null {
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
