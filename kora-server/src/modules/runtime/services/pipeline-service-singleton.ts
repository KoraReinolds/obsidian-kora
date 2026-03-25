/**
 * @module modules/runtime/services/pipeline-service-singleton
 * @description Ленивый singleton minimal pipeline runtime для Telegram-архива.
 */

import { getArchiveRepository } from '../../personal-admin/services/archive-service-singleton.js';
import { PipelineDatabase } from '../pipeline/pipeline-db.js';
import { PipelineRepository } from '../pipeline/pipeline-repository.js';
import {
	executePipelineStep,
	getPipelineStepDefinition,
	getPipelineSteps,
} from '../pipeline/pipeline-registry.js';
import type {
	PipelineArtifactPreview,
	PipelineRunCreateResponse,
	PipelineRunListResponse,
	PipelineRunRecord,
	PipelineRunRequest,
	PipelineSelection,
	PipelineStepDefinition,
} from '../pipeline/types.js';

let pipelineDatabase: PipelineDatabase | null = null;
let pipelineRepository: PipelineRepository | null = null;
let currentDatabasePath: string | null = null;

export class PipelineRuntimeService {
	constructor(private readonly repository: PipelineRepository) {}

	listSteps(): PipelineStepDefinition[] {
		return getPipelineSteps();
	}

	listRuns(
		filters: {
			stepKey?: string;
			status?: string;
			chatId?: string;
			limit?: number;
		} = {}
	): PipelineRunListResponse {
		const result = this.repository.listRuns({
			stepKey: filters.stepKey,
			status: filters.status as any,
			chatId: filters.chatId,
			limit: filters.limit,
		});

		return {
			success: true,
			total: result.total,
			runs: result.runs,
		};
	}

	getRun(runId: number): PipelineRunRecord | null {
		const run = this.repository.getRun(runId);
		if (!run) {
			return null;
		}

		return {
			...run,
			artifacts: this.repository
				.getArtifacts(runId)
				.map(this.toArtifactPreview),
		};
	}

	getArtifact(artifactId: number) {
		return this.repository.getArtifact(artifactId);
	}

	async runStep(
		request: PipelineRunRequest
	): Promise<PipelineRunCreateResponse> {
		const step = getPipelineStepDefinition(request.stepKey);
		if (!step.selectionScopes.includes(request.selection.scope)) {
			throw new Error(
				`Step ${request.stepKey} does not support selection scope ${request.selection.scope}`
			);
		}

		const normalizedSelection = this.normalizeSelection(request.selection);
		const options = {
			...step.defaultOptions,
			...(request.options || {}),
		};
		const archiveRepo = getArchiveRepository();
		const db = archiveRepo.getConnection();
		const messages = this.loadSelectionMessages(db, normalizedSelection);
		const availableCount = this.countSelectionMessages(db, normalizedSelection);
		const startedAt = new Date().toISOString();
		const runId = this.repository.insertRun({
			stepKey: step.key,
			stepLabel: step.label,
			status: 'running',
			chatId: normalizedSelection.chatId,
			selection: normalizedSelection,
			options,
			availableCount,
			processedCount: messages.length,
			truncated: availableCount > messages.length,
			warningCount: 0,
			errorText: null,
			startedAt,
		});

		try {
			const execution = await executePipelineStep(request.stepKey, {
				selection: normalizedSelection,
				options,
				messages,
			});
			const finishedAt = new Date().toISOString();

			this.repository.finishRun(runId, {
				status: 'completed',
				processedCount: execution.processedCount,
				truncated: availableCount > messages.length,
				warningCount: execution.warningCount,
				errorText: null,
				summary: execution.summary,
				result: execution.result,
				finishedAt,
			});
			this.repository.insertArtifacts(runId, execution.artifacts);

			return {
				success: true,
				run: this.getRun(runId) as PipelineRunRecord,
				artifacts: this.repository
					.getArtifacts(runId)
					.map(this.toArtifactPreview),
			};
		} catch (error) {
			const finishedAt = new Date().toISOString();
			const errorText = (error as Error).message;
			this.repository.finishRun(runId, {
				status: 'failed',
				processedCount: messages.length,
				truncated: availableCount > messages.length,
				warningCount: 0,
				errorText,
				summary: {
					step: step.key,
					messageCount: messages.length,
				},
				result: null,
				finishedAt,
			});

			return {
				success: true,
				run: this.getRun(runId) as PipelineRunRecord,
				artifacts: this.repository
					.getArtifacts(runId)
					.map(this.toArtifactPreview),
			};
		}
	}

	private normalizeSelection(selection: PipelineSelection): PipelineSelection {
		if (!selection.chatId || typeof selection.chatId !== 'string') {
			throw new Error('selection.chatId is required');
		}

		if (selection.scope === 'messages') {
			const messageIds = Array.isArray(selection.messageIds)
				? selection.messageIds
						.map(value => Number(value))
						.filter(value => Number.isFinite(value))
				: [];
			if (messageIds.length === 0) {
				throw new Error('selection.messageIds must be a non-empty array');
			}
			return {
				...selection,
				chatId: selection.chatId.trim(),
				messageIds,
			};
		}

		return {
			...selection,
			chatId: selection.chatId.trim(),
			...('limit' in selection &&
			typeof selection.limit === 'number' &&
			Number.isFinite(selection.limit)
				? { limit: Math.max(1, Math.floor(selection.limit)) }
				: {}),
			...('offset' in selection &&
			typeof selection.offset === 'number' &&
			Number.isFinite(selection.offset)
				? { offset: Math.max(0, Math.floor(selection.offset)) }
				: {}),
		};
	}

	private loadSelectionMessages(
		db: { prepare: (query: string) => any },
		selection: PipelineSelection
	) {
		const { query, params } = this.buildSelectionQuery(selection, true);
		const rows = db.prepare(query).all(params);
		return rows.map((row: any) => this.mapMessageRow(row));
	}

	private countSelectionMessages(
		db: { prepare: (query: string) => any },
		selection: PipelineSelection
	): number {
		const { query, params } = this.buildSelectionQuery(selection, false);
		const row = db.prepare(query).get(params) as { total: number } | undefined;
		return Number(row?.total || 0);
	}

	private buildSelectionQuery(
		selection: PipelineSelection,
		includeLimit: boolean
	): { query: string; params: Record<string, unknown> } {
		const where: string[] = ['chat_id = @chatId'];
		const params: Record<string, unknown> = {
			chatId: selection.chatId,
		};

		if (selection.scope === 'messages') {
			const placeholders = selection.messageIds
				.map((_, index) => `@messageId${index}`)
				.join(', ');
			for (const [index, messageId] of selection.messageIds.entries()) {
				params[`messageId${index}`] = messageId;
			}
			where.push(`message_id IN (${placeholders})`);
		}

		if (selection.scope === 'date-range') {
			if (selection.from) {
				where.push('timestamp_utc >= @from');
				params.from = selection.from;
			}
			if (selection.to) {
				where.push('timestamp_utc <= @to');
				params.to = selection.to;
			}
		}

		if (!includeLimit) {
			return {
				query: `
					SELECT COUNT(*) AS total
					FROM messages
					WHERE ${where.join(' AND ')}
				`,
				params,
			};
		}

		const limit = Math.min(
			1000,
			Math.max(
				1,
				Number(
					selection.scope === 'messages'
						? selection.messageIds.length
						: 'limit' in selection &&
							  typeof selection.limit === 'number' &&
							  Number.isFinite(selection.limit)
							? selection.limit
							: 250
				) || 250
			)
		);
		const offset =
			selection.scope === 'messages'
				? 0
				: Math.max(
						0,
						Number(
							'offset' in selection &&
								typeof selection.offset === 'number' &&
								Number.isFinite(selection.offset)
								? selection.offset
								: 0
						) || 0
					);
		params.limit = limit;
		params.offset = offset;

		return {
			query: `
				SELECT *
				FROM messages
				WHERE ${where.join(' AND ')}
				ORDER BY timestamp_utc ASC, message_id ASC
				LIMIT @limit OFFSET @offset
			`,
			params,
		};
	}

	private mapMessageRow(row: any) {
		const reactions = this.parseJson(row.reactions_json);
		const media = this.parseJson(row.media_json);
		const forward = this.parseJson(row.forward_json);
		const service = this.parseJson(row.service_json);
		const metadata = this.parseJson(row.metadata_json);
		const text = row.text_normalized || row.text_raw || '';
		const attachmentCount = this.countAttachments(media);
		const reactionCount = Array.isArray(reactions)
			? reactions.length
			: reactions && typeof reactions === 'object'
				? Object.keys(reactions).length
				: 0;

		return {
			messagePk: row.message_pk,
			chatId: row.chat_id,
			messageId: row.message_id,
			senderId: row.sender_id,
			timestampUtc: row.timestamp_utc,
			senderLabel:
				row.sender_display_name ||
				row.sender_name ||
				row.sender_id ||
				'Unknown',
			messageType: row.message_type || 'message',
			text,
			textLength: text.length,
			hasText: text.length > 0,
			hasMedia: Boolean(media),
			hasForward: Boolean(
				forward &&
					typeof forward === 'object' &&
					Object.keys(forward).length > 0
			),
			hasReply: row.reply_to_message_id !== null,
			isService:
				(row.message_type || '') !== 'message' ||
				Boolean(
					service &&
						typeof service === 'object' &&
						Object.keys(service).length > 0
				),
			replyToMessageId: row.reply_to_message_id,
			threadId: row.thread_id,
			attachmentCount,
			reactionCount,
			contentHash: row.content_hash,
			source: row.source,
			raw: {
				reactions,
				media,
				forward,
				service,
				metadata,
			},
		};
	}

	private countAttachments(media: unknown): number {
		if (!media || typeof media !== 'object') {
			return 0;
		}

		const attachments = (media as { attachments?: unknown[] }).attachments;
		return Array.isArray(attachments) ? attachments.length : 0;
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

	private toArtifactPreview = (artifact: {
		id: number;
		runId: number;
		artifactKey: string;
		kind: string;
		title: string;
		itemCount: number;
		preview: unknown;
		createdAt: string;
	}): PipelineArtifactPreview => ({
		id: artifact.id,
		runId: artifact.runId,
		artifactKey: artifact.artifactKey,
		kind: artifact.kind,
		title: artifact.title,
		itemCount: artifact.itemCount,
		preview: artifact.preview,
		createdAt: artifact.createdAt,
	});
}

export function getPipelineRuntimeService(): PipelineRuntimeService {
	const pipelineDbPath = process.env.PIPELINE_DB_PATH || null;

	if (pipelineDatabase && currentDatabasePath === pipelineDbPath) {
		return new PipelineRuntimeService(pipelineRepository as PipelineRepository);
	}

	resetPipelineRuntimeService();
	pipelineDatabase = new PipelineDatabase({
		databasePath: pipelineDbPath || undefined,
	});
	pipelineRepository = new PipelineRepository(pipelineDatabase.getConnection());
	currentDatabasePath = pipelineDbPath;
	return new PipelineRuntimeService(pipelineRepository);
}

export function resetPipelineRuntimeService(): void {
	pipelineDatabase?.close();
	pipelineDatabase = null;
	pipelineRepository = null;
	currentDatabasePath = null;
}
