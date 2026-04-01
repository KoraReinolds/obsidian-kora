/**
 * @module modules/eternal-ai/eternal-ai-repository
 * @description Репозиторий нового turn-centric слоя Eternal AI. Все runtime-
 * данные группируются вокруг явного `turn`, поэтому undo/reset и будущие
 * ветвления не зависят от эвристики "user + следующий assistant".
 */

import Database from 'better-sqlite3';
import type {
	CreateEternalAiConversationRequest,
	EternalAiArtifactRecord,
	EternalAiArtifactType,
	EternalAiConversationSummary,
	EternalAiMessageMetadata,
	EternalAiMessageRecord,
	EternalAiTurnKind,
	EternalAiTurnRecord,
	EternalAiTurnStatus,
	EternalAiTurnTraceRecord,
	UpdateEternalAiArtifactRequest,
} from '../../../../packages/contracts/src/eternal-ai.js';
import type { CanonicalChatMessage } from '../../../../packages/contracts/src/canonical-chat-message.js';
import type {
	Artifact,
	ArtifactRecallQuery,
	ArtifactStorePort,
} from '../../../../packages/kora-core/src/memory/index.js';
import type {
	RuntimeMessage,
	TurnTrace,
} from '../../../../packages/kora-core/src/runtime/index.js';

interface ConversationRow {
	id: string;
	title: string;
	model: string;
	system_prompt: string | null;
	head_turn_id: string | null;
	last_message_preview: string | null;
	last_message_at: string | null;
	turn_count: number;
	created_at: string;
	updated_at: string;
}

interface TurnRow {
	id: string;
	conversation_id: string;
	parent_turn_id: string | null;
	turn_kind: EternalAiTurnKind;
	status: EternalAiTurnStatus;
	model: string | null;
	error_text: string | null;
	created_at: string;
	updated_at: string;
}

interface MessageRow {
	id: string;
	conversation_id: string;
	turn_id: string;
	role: 'user' | 'assistant' | 'system';
	content_text: string;
	model: string | null;
	status: EternalAiTurnStatus;
	error_text: string | null;
	attachments_json: string | null;
	metadata_json: string | null;
	created_at: string;
}

interface ArtifactRow {
	id: string;
	conversation_id: string | null;
	created_by_turn_id: string | null;
	artifact_type: string;
	context: string;
	source_type: string;
	source_id: string;
	scope_kind: string;
	scope_id: string | null;
	text: string;
	embedding_text: string;
	source_unit_ids_json: string | null;
	source_refs_json: string | null;
	metadata_json: string | null;
	created_at: string;
	updated_at: string;
}

interface TurnTraceRow {
	id: string;
	conversation_id: string;
	turn_id: string;
	model: string;
	status: 'success' | 'error';
	prompt_text: string;
	raw_response: string;
	recalled_artifacts_json: string;
	prompt_fragments_json: string;
	parsed_actions_json: string;
	parsed_memory_candidates_json: string;
	parsed_environment_patch_json: string | null;
	parsed_used_structured_blocks: number;
	timings_json: string;
	error_text: string | null;
	started_at: string;
	finished_at: string;
}

interface EffectJobRow {
	request_id: string;
	conversation_id: string;
	turn_id: string;
	effect_id: string;
	effect_tag: string | null;
	status: string;
	result_url: string | null;
	error_text: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreateConversationInput extends CreateEternalAiConversationRequest {
	id: string;
	createdAt: string;
}

export interface CreateTurnInput {
	id: string;
	conversationId: string;
	parentTurnId?: string | null;
	kind: EternalAiTurnKind;
	status: EternalAiTurnStatus;
	model?: string | null;
	errorText?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface InsertMessageInput {
	id: string;
	conversationId: string;
	turnId: string;
	role: 'user' | 'assistant' | 'system';
	contentText: string;
	model?: string | null;
	status: EternalAiTurnStatus;
	errorText?: string | null;
	attachments?: Array<Record<string, unknown>> | null;
	metadata?: Record<string, unknown> | null;
	createdAt: string;
}

export class EternalAiRepository implements ArtifactStorePort {
	constructor(private readonly db: Database.Database) {}

	listConversations(): EternalAiConversationSummary[] {
		const rows = this.db
			.prepare(
				`
					SELECT
						c.id,
						c.title,
						c.model,
						c.system_prompt,
						c.head_turn_id,
						c.last_message_preview,
						c.last_message_at,
						c.created_at,
						c.updated_at,
						COUNT(t.id) AS turn_count
					FROM eternal_ai_conversations c
					LEFT JOIN eternal_ai_turns t
						ON t.conversation_id = c.id
					GROUP BY c.id
					ORDER BY c.updated_at DESC
				`
			)
			.all() as ConversationRow[];

		return rows.map(row => this.mapConversation(row));
	}

	getConversation(conversationId: string): EternalAiConversationSummary | null {
		const row = this.db
			.prepare(
				`
					SELECT
						c.id,
						c.title,
						c.model,
						c.system_prompt,
						c.head_turn_id,
						c.last_message_preview,
						c.last_message_at,
						c.created_at,
						c.updated_at,
						COUNT(t.id) AS turn_count
					FROM eternal_ai_conversations c
					LEFT JOIN eternal_ai_turns t
						ON t.conversation_id = c.id
					WHERE c.id = ?
					GROUP BY c.id
				`
			)
			.get(conversationId) as ConversationRow | undefined;

		return row ? this.mapConversation(row) : null;
	}

	createConversation(
		input: CreateConversationInput
	): EternalAiConversationSummary {
		this.db
			.prepare(
				`
					INSERT INTO eternal_ai_conversations (
						id,
						title,
						model,
						system_prompt,
						head_turn_id,
						last_message_preview,
						last_message_at,
						created_at,
						updated_at
					) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
				`
			)
			.run(
				input.id,
				input.title || 'Новый чат',
				input.model || 'uncensored-eternal-ai-1.0',
				input.systemPrompt || null,
				input.createdAt,
				input.createdAt
			);

		return this.getConversation(input.id) as EternalAiConversationSummary;
	}

	updateConversationMetadata(params: {
		conversationId: string;
		title?: string;
		model?: string;
		systemPrompt?: string | null;
		headTurnId?: string | null;
		lastMessagePreview?: string | null;
		lastMessageAt?: string | null;
		updatedAt: string;
	}): void {
		const current = this.getConversation(params.conversationId);
		if (!current) {
			return;
		}

		this.db
			.prepare(
				`
					UPDATE eternal_ai_conversations
					SET
						title = ?,
						model = ?,
						system_prompt = ?,
						head_turn_id = ?,
						last_message_preview = ?,
						last_message_at = ?,
						updated_at = ?
					WHERE id = ?
				`
			)
			.run(
				params.title ?? current.title,
				params.model ?? current.model,
				params.systemPrompt ?? current.systemPrompt ?? null,
				params.headTurnId !== undefined
					? params.headTurnId
					: (current.headTurnId ?? null),
				params.lastMessagePreview ?? current.lastMessagePreview ?? null,
				params.lastMessageAt ?? current.lastMessageAt ?? null,
				params.updatedAt,
				params.conversationId
			);
	}

	createTurn(input: CreateTurnInput): EternalAiTurnRecord {
		this.db
			.prepare(
				`
					INSERT INTO eternal_ai_turns (
						id,
						conversation_id,
						parent_turn_id,
						turn_kind,
						status,
						model,
						error_text,
						created_at,
						updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				`
			)
			.run(
				input.id,
				input.conversationId,
				input.parentTurnId || null,
				input.kind,
				input.status,
				input.model || null,
				input.errorText || null,
				input.createdAt,
				input.updatedAt
			);

		return this.getTurn(input.id) as EternalAiTurnRecord;
	}

	getTurn(turnId: string): EternalAiTurnRecord | null {
		const row = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						parent_turn_id,
						turn_kind,
						status,
						model,
						error_text,
						created_at,
						updated_at
					FROM eternal_ai_turns
					WHERE id = ?
				`
			)
			.get(turnId) as TurnRow | undefined;

		if (!row) {
			return null;
		}

		return this.mapTurn(
			row,
			this.getMessagesByTurnIds([row.id]),
			this.getTraceByTurnIds([row.id])
		);
	}

	listTurns(conversationId: string): EternalAiTurnRecord[] {
		const rows = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						parent_turn_id,
						turn_kind,
						status,
						model,
						error_text,
						created_at,
						updated_at
					FROM eternal_ai_turns
					WHERE conversation_id = ?
					ORDER BY created_at ASC
				`
			)
			.all(conversationId) as TurnRow[];

		const turnIds = rows.map(row => row.id);
		const messagesByTurnId = this.getMessagesByTurnIds(turnIds);
		const tracesByTurnId = this.getTraceByTurnIds(turnIds);

		return rows.map(row => this.mapTurn(row, messagesByTurnId, tracesByTurnId));
	}

	updateTurn(
		turnId: string,
		patch: {
			status?: EternalAiTurnStatus;
			errorText?: string | null;
			model?: string | null;
			updatedAt: string;
		}
	): EternalAiTurnRecord | null {
		const current = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						parent_turn_id,
						turn_kind,
						status,
						model,
						error_text,
						created_at,
						updated_at
					FROM eternal_ai_turns
					WHERE id = ?
				`
			)
			.get(turnId) as TurnRow | undefined;

		if (!current) {
			return null;
		}

		this.db
			.prepare(
				`
					UPDATE eternal_ai_turns
					SET
						status = ?,
						model = ?,
						error_text = ?,
						updated_at = ?
					WHERE id = ?
				`
			)
			.run(
				patch.status ?? current.status,
				patch.model !== undefined ? patch.model : current.model,
				patch.errorText !== undefined ? patch.errorText : current.error_text,
				patch.updatedAt,
				turnId
			);

		return this.getTurn(turnId);
	}

	deleteTurn(turnId: string): boolean {
		const result = this.db
			.prepare(`DELETE FROM eternal_ai_turns WHERE id = ?`)
			.run(turnId);
		return result.changes > 0;
	}

	reparentAndDeleteTurn(params: {
		conversationId: string;
		turnId: string;
		nextParentTurnId: string | null;
		updatedAt: string;
	}): boolean {
		const run = this.db.transaction(
			(input: {
				conversationId: string;
				turnId: string;
				nextParentTurnId: string | null;
				updatedAt: string;
			}): boolean => {
				this.db
					.prepare(
						`
							UPDATE eternal_ai_turns
							SET
								parent_turn_id = ?,
								updated_at = ?
							WHERE conversation_id = ?
								AND parent_turn_id = ?
						`
					)
					.run(
						input.nextParentTurnId,
						input.updatedAt,
						input.conversationId,
						input.turnId
					);

				const deleteResult = this.db
					.prepare(
						`
							DELETE FROM eternal_ai_turns
							WHERE id = ?
								AND conversation_id = ?
						`
					)
					.run(input.turnId, input.conversationId);

				return deleteResult.changes > 0;
			}
		);

		return run(params);
	}

	deleteConversation(conversationId: string): boolean {
		const result = this.db
			.prepare(`DELETE FROM eternal_ai_conversations WHERE id = ?`)
			.run(conversationId);
		return result.changes > 0;
	}

	insertMessage(input: InsertMessageInput): EternalAiMessageRecord {
		this.db
			.prepare(
				`
					INSERT INTO eternal_ai_messages (
						id,
						conversation_id,
						turn_id,
						role,
						content_text,
						model,
						status,
						error_text,
						attachments_json,
						metadata_json,
						created_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`
			)
			.run(
				input.id,
				input.conversationId,
				input.turnId,
				input.role,
				input.contentText,
				input.model || null,
				input.status,
				input.errorText || null,
				input.attachments ? JSON.stringify(input.attachments) : null,
				input.metadata ? JSON.stringify(input.metadata) : null,
				input.createdAt
			);

		return this.getMessageById(input.id) as EternalAiMessageRecord;
	}

	getMessageById(messageId: string): EternalAiMessageRecord | null {
		const row = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						turn_id,
						role,
						content_text,
						model,
						status,
						error_text,
						attachments_json,
						metadata_json,
						created_at
					FROM eternal_ai_messages
					WHERE id = ?
				`
			)
			.get(messageId) as MessageRow | undefined;

		return row ? this.mapMessage(row) : null;
	}

	listMessagesForConversation(
		conversationId: string
	): EternalAiMessageRecord[] {
		const rows = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						turn_id,
						role,
						content_text,
						model,
						status,
						error_text,
						attachments_json,
						metadata_json,
						created_at
					FROM eternal_ai_messages
					WHERE conversation_id = ?
					ORDER BY created_at ASC
				`
			)
			.all(conversationId) as MessageRow[];

		return rows.map(row => this.mapMessage(row));
	}

	updateMessage(
		messageId: string,
		patch: {
			contentText?: string;
			status?: EternalAiTurnStatus;
			errorText?: string | null;
			attachments?: Array<Record<string, unknown>> | null;
			metadata?: Record<string, unknown> | null;
		}
	): EternalAiMessageRecord | null {
		const current = this.getMessageById(messageId);
		if (!current) {
			return null;
		}

		const nextMeta =
			patch.metadata !== undefined
				? { ...(current.metadata || {}), ...patch.metadata }
				: current.metadata;

		const nextContent = patch.contentText ?? current.contentText;
		const nextStatus = patch.status ?? current.status;
		const nextError =
			patch.errorText !== undefined ? patch.errorText : current.errorText;
		const nextAttachments =
			patch.attachments !== undefined ? patch.attachments : current.attachments;

		this.db
			.prepare(
				`
					UPDATE eternal_ai_messages
					SET
						content_text = ?,
						status = ?,
						error_text = ?,
						attachments_json = ?,
						metadata_json = ?
					WHERE id = ?
				`
			)
			.run(
				nextContent,
				nextStatus,
				nextError || null,
				nextAttachments ? JSON.stringify(nextAttachments) : null,
				nextMeta ? JSON.stringify(nextMeta) : null,
				messageId
			);

		return this.getMessageById(messageId);
	}

	getLastMessageForConversation(
		conversationId: string
	): EternalAiMessageRecord | null {
		const row = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						turn_id,
						role,
						content_text,
						model,
						status,
						error_text,
						attachments_json,
						metadata_json,
						created_at
					FROM eternal_ai_messages
					WHERE conversation_id = ?
					ORDER BY created_at DESC
					LIMIT 1
				`
			)
			.get(conversationId) as MessageRow | undefined;

		return row ? this.mapMessage(row) : null;
	}

	insertEffectJob(input: {
		requestId: string;
		conversationId: string;
		turnId: string;
		effectId: string;
		effectTag: string | null;
		status: string;
		createdAt: string;
		updatedAt: string;
	}): void {
		this.db
			.prepare(
				`
					INSERT INTO eternal_ai_effect_jobs (
						request_id,
						conversation_id,
						turn_id,
						effect_id,
						effect_tag,
						status,
						result_url,
						error_text,
						created_at,
						updated_at
					) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
				`
			)
			.run(
				input.requestId,
				input.conversationId,
				input.turnId,
				input.effectId,
				input.effectTag,
				input.status,
				input.createdAt,
				input.updatedAt
			);
	}

	getEffectJob(requestId: string): EffectJobRow | null {
		const row = this.db
			.prepare(
				`
					SELECT
						request_id,
						conversation_id,
						turn_id,
						effect_id,
						effect_tag,
						status,
						result_url,
						error_text,
						created_at,
						updated_at
					FROM eternal_ai_effect_jobs
					WHERE request_id = ?
				`
			)
			.get(requestId) as EffectJobRow | undefined;

		return row || null;
	}

	updateEffectJob(
		requestId: string,
		patch: {
			status?: string;
			result_url?: string | null;
			error_text?: string | null;
			updatedAt: string;
		}
	): void {
		const current = this.getEffectJob(requestId);
		if (!current) {
			return;
		}

		this.db
			.prepare(
				`
					UPDATE eternal_ai_effect_jobs
					SET
						status = ?,
						result_url = ?,
						error_text = ?,
						updated_at = ?
					WHERE request_id = ?
				`
			)
			.run(
				patch.status ?? current.status,
				patch.result_url !== undefined ? patch.result_url : current.result_url,
				patch.error_text !== undefined ? patch.error_text : current.error_text,
				patch.updatedAt,
				requestId
			);
	}

	deleteCompletedEffectJobsOlderThan(olderThanIso: string): number {
		const result = this.db
			.prepare(
				`
					DELETE FROM eternal_ai_effect_jobs
					WHERE status IN ('success', 'error')
						AND updated_at < ?
				`
			)
			.run(olderThanIso);
		return result.changes;
	}

	listArtifacts(params: {
		conversationId: string;
		type?: string;
		context?: string;
		limit?: number;
	}): EternalAiArtifactRecord[] {
		const rows = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						created_by_turn_id,
						artifact_type,
						context,
						source_type,
						source_id,
						scope_kind,
						scope_id,
						text,
						embedding_text,
						source_unit_ids_json,
						source_refs_json,
						metadata_json,
						created_at,
						updated_at
					FROM eternal_ai_artifacts
					WHERE conversation_id = ?
						AND (? IS NULL OR artifact_type = ?)
						AND (? IS NULL OR context = ?)
					ORDER BY updated_at DESC
					LIMIT ?
				`
			)
			.all(
				params.conversationId,
				params.type || null,
				params.type || null,
				params.context || null,
				params.context || null,
				Math.max(1, Math.floor(params.limit || 100))
			) as ArtifactRow[];

		return rows.map(row => this.mapArtifactRecord(this.mapArtifact(row)));
	}

	getArtifactById(artifactId: string): EternalAiArtifactRecord | null {
		const row = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						created_by_turn_id,
						artifact_type,
						context,
						source_type,
						source_id,
						scope_kind,
						scope_id,
						text,
						embedding_text,
						source_unit_ids_json,
						source_refs_json,
						metadata_json,
						created_at,
						updated_at
					FROM eternal_ai_artifacts
					WHERE id = ?
				`
			)
			.get(artifactId) as ArtifactRow | undefined;

		return row ? this.mapArtifactRecord(this.mapArtifact(row)) : null;
	}

	updateArtifact(
		request: UpdateEternalAiArtifactRequest & {
			updatedAt: string;
		}
	): EternalAiArtifactRecord | null {
		const result = this.db
			.prepare(
				`
					UPDATE eternal_ai_artifacts
					SET
						artifact_type = ?,
						context = ?,
						text = ?,
						embedding_text = ?,
						metadata_json = ?,
						updated_at = ?
					WHERE id = ? AND conversation_id = ?
				`
			)
			.run(
				request.type,
				request.context,
				request.text,
				request.text,
				request.metadata ? JSON.stringify(request.metadata) : null,
				request.updatedAt,
				request.artifactId,
				request.conversationId
			);

		if (result.changes < 1) {
			return null;
		}

		return this.getArtifactById(request.artifactId);
	}

	deleteArtifact(conversationId: string, artifactId: string): boolean {
		const result = this.db
			.prepare(
				`
					DELETE FROM eternal_ai_artifacts
					WHERE id = ? AND conversation_id = ?
				`
			)
			.run(artifactId, conversationId);
		return result.changes > 0;
	}

	persistArtifacts(
		artifacts: Artifact[],
		createdByTurnId?: string | null
	): void {
		const insert = this.db.prepare(
			`
				INSERT INTO eternal_ai_artifacts (
					id,
					conversation_id,
					created_by_turn_id,
					artifact_type,
					context,
					source_type,
					source_id,
					scope_kind,
					scope_id,
					text,
					embedding_text,
					source_unit_ids_json,
					source_refs_json,
					metadata_json,
					created_at,
					updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					conversation_id = excluded.conversation_id,
					created_by_turn_id = excluded.created_by_turn_id,
					artifact_type = excluded.artifact_type,
					context = excluded.context,
					source_type = excluded.source_type,
					source_id = excluded.source_id,
					scope_kind = excluded.scope_kind,
					scope_id = excluded.scope_id,
					text = excluded.text,
					embedding_text = excluded.embedding_text,
					source_unit_ids_json = excluded.source_unit_ids_json,
					source_refs_json = excluded.source_refs_json,
					metadata_json = excluded.metadata_json,
					updated_at = excluded.updated_at
			`
		);

		for (const artifact of artifacts) {
			insert.run(
				artifact.id,
				artifact.scope.kind === 'conversation'
					? artifact.scope.id || null
					: null,
				createdByTurnId || null,
				artifact.artifactType,
				artifact.context,
				artifact.sourceType,
				artifact.sourceId,
				artifact.scope.kind,
				artifact.scope.id || null,
				artifact.text,
				artifact.embeddingText,
				JSON.stringify(artifact.sourceUnitIds || []),
				JSON.stringify(artifact.sourceRefs || []),
				artifact.metadata ? JSON.stringify(artifact.metadata) : null,
				artifact.createdAt,
				artifact.updatedAt
			);
		}
	}

	recallArtifacts(query: ArtifactRecallQuery): Artifact[] {
		const limit = Math.max(1, Math.floor(query.limit || 8));
		const rows = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						created_by_turn_id,
						artifact_type,
						context,
						source_type,
						source_id,
						scope_kind,
						scope_id,
						text,
						embedding_text,
						source_unit_ids_json,
						source_refs_json,
						metadata_json,
						created_at,
						updated_at
					FROM eternal_ai_artifacts
					WHERE (? IS NULL OR scope_kind = ?)
						AND (? IS NULL OR scope_id = ?)
						AND (? IS NULL OR context IN (SELECT value FROM json_each(?)))
					ORDER BY updated_at DESC
					LIMIT ?
				`
			)
			.all(
				query.scopeKind || null,
				query.scopeKind || null,
				query.scopeId || null,
				query.scopeId || null,
				query.contexts?.length ? JSON.stringify(query.contexts) : null,
				query.contexts?.length ? JSON.stringify(query.contexts) : null,
				limit
			) as ArtifactRow[];

		const allowedTypes = query.artifactTypes?.length
			? new Set(query.artifactTypes)
			: null;
		const allowedSources = query.sourceTypes?.length
			? new Set(query.sourceTypes)
			: null;

		return rows
			.map(row => this.mapArtifact(row))
			.filter(artifact =>
				allowedTypes ? allowedTypes.has(artifact.artifactType) : true
			)
			.filter(artifact =>
				allowedSources ? allowedSources.has(artifact.sourceType) : true
			);
	}

	insertTurnTrace(params: {
		conversationId: string;
		turnId: string;
		trace: TurnTrace;
		status: 'success' | 'error';
		errorText?: string | null;
	}): void {
		const runtimeExtraction = params.trace.parsedResponse || {
			actions: [],
			memoryCandidates: [],
			environmentPatch: null,
			usedStructuredBlocks: false,
		};

		this.db
			.prepare(
				`
					INSERT INTO eternal_ai_turn_traces (
						id,
						conversation_id,
						turn_id,
						model,
						status,
						prompt_text,
						raw_response,
						recalled_artifacts_json,
						prompt_fragments_json,
						parsed_actions_json,
						parsed_memory_candidates_json,
						parsed_environment_patch_json,
						parsed_used_structured_blocks,
						timings_json,
						error_text,
						started_at,
						finished_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`
			)
			.run(
				params.trace.id,
				params.conversationId,
				params.turnId,
				params.trace.modelRef,
				params.status,
				params.trace.assembledPrompt,
				params.trace.rawResponse,
				JSON.stringify(params.trace.recalledArtifacts),
				JSON.stringify(params.trace.promptFragments),
				JSON.stringify(runtimeExtraction.actions || []),
				JSON.stringify(runtimeExtraction.memoryCandidates || []),
				runtimeExtraction.environmentPatch
					? JSON.stringify(runtimeExtraction.environmentPatch)
					: null,
				runtimeExtraction.usedStructuredBlocks ? 1 : 0,
				JSON.stringify(params.trace.timingsMs),
				params.errorText || null,
				params.trace.startedAt,
				params.trace.finishedAt
			);
	}

	listTurnTraces(
		conversationId: string,
		limit = 20
	): EternalAiTurnTraceRecord[] {
		const rows = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						turn_id,
						model,
						status,
						prompt_text,
						raw_response,
						recalled_artifacts_json,
						prompt_fragments_json,
						parsed_actions_json,
						parsed_memory_candidates_json,
						parsed_environment_patch_json,
						parsed_used_structured_blocks,
						timings_json,
						error_text,
						started_at,
						finished_at
					FROM eternal_ai_turn_traces
					WHERE conversation_id = ?
					ORDER BY started_at DESC
					LIMIT ?
				`
			)
			.all(conversationId, limit) as TurnTraceRow[];

		return rows.map(row => this.mapTurnTrace(row));
	}

	toRuntimeMessages(conversationId: string): RuntimeMessage[] {
		return this.listMessagesForConversation(conversationId).map(message => ({
			actor:
				message.role === 'assistant'
					? 'assistant'
					: message.role === 'system'
						? 'system'
						: 'user',
			kind:
				message.role === 'assistant'
					? 'assistant_text'
					: message.role === 'system'
						? 'system_note'
						: 'user_text',
			text: message.contentText,
			createdAt: message.createdAt,
			metadata: message.metadata || undefined,
		})) satisfies RuntimeMessage[];
	}

	private getMessagesByTurnIds(
		turnIds: string[]
	): Map<string, EternalAiMessageRecord[]> {
		const map = new Map<string, EternalAiMessageRecord[]>();
		if (!turnIds.length) {
			return map;
		}

		const placeholders = turnIds.map(() => '?').join(', ');
		const rows = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						turn_id,
						role,
						content_text,
						model,
						status,
						error_text,
						attachments_json,
						metadata_json,
						created_at
					FROM eternal_ai_messages
					WHERE turn_id IN (${placeholders})
					ORDER BY created_at ASC
				`
			)
			.all(...turnIds) as MessageRow[];

		for (const row of rows) {
			const current = map.get(row.turn_id) || [];
			current.push(this.mapMessage(row));
			map.set(row.turn_id, current);
		}

		return map;
	}

	private getTraceByTurnIds(
		turnIds: string[]
	): Map<string, EternalAiTurnTraceRecord> {
		const map = new Map<string, EternalAiTurnTraceRecord>();
		if (!turnIds.length) {
			return map;
		}

		const placeholders = turnIds.map(() => '?').join(', ');
		const rows = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
						turn_id,
						model,
						status,
						prompt_text,
						raw_response,
						recalled_artifacts_json,
						prompt_fragments_json,
						parsed_actions_json,
						parsed_memory_candidates_json,
						parsed_environment_patch_json,
						parsed_used_structured_blocks,
						timings_json,
						error_text,
						started_at,
						finished_at
					FROM eternal_ai_turn_traces
					WHERE turn_id IN (${placeholders})
				`
			)
			.all(...turnIds) as TurnTraceRow[];

		for (const row of rows) {
			map.set(row.turn_id, this.mapTurnTrace(row));
		}

		return map;
	}

	private mapConversation(row: ConversationRow): EternalAiConversationSummary {
		return {
			id: row.id,
			title: row.title,
			model: row.model,
			systemPrompt: row.system_prompt,
			headTurnId: row.head_turn_id,
			lastMessagePreview: row.last_message_preview,
			lastMessageAt: row.last_message_at,
			turnCount: Number(row.turn_count || 0),
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	private mapMessage(row: MessageRow): EternalAiMessageRecord {
		const metadata = row.metadata_json
			? (JSON.parse(row.metadata_json) as EternalAiMessageMetadata)
			: null;
		const canonicalMessage =
			metadata?.canonicalMessage &&
			typeof metadata.canonicalMessage === 'object' &&
			!Array.isArray(metadata.canonicalMessage)
				? (metadata.canonicalMessage as CanonicalChatMessage)
				: null;

		return {
			id: row.id,
			conversationId: row.conversation_id,
			turnId: row.turn_id,
			role: row.role,
			contentText: row.content_text,
			model: row.model,
			status: row.status,
			errorText: row.error_text,
			attachments: row.attachments_json
				? (JSON.parse(row.attachments_json) as Array<Record<string, unknown>>)
				: null,
			metadata,
			canonicalMessage,
			createdAt: row.created_at,
		};
	}

	private mapTurn(
		row: TurnRow,
		messagesByTurnId: Map<string, EternalAiMessageRecord[]>,
		tracesByTurnId: Map<string, EternalAiTurnTraceRecord>
	): EternalAiTurnRecord {
		const messages = messagesByTurnId.get(row.id) || [];
		const userMessage =
			messages.find(message => message.role === 'user') || null;
		const assistantMessage =
			messages.find(message => message.role === 'assistant') || null;

		return {
			id: row.id,
			conversationId: row.conversation_id,
			parentTurnId: row.parent_turn_id,
			kind: row.turn_kind,
			status: row.status,
			model: row.model,
			errorText: row.error_text,
			userMessage,
			assistantMessage,
			trace: tracesByTurnId.get(row.id) || null,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	private mapArtifact(row: ArtifactRow): Artifact {
		return {
			id: row.id,
			artifactType: row.artifact_type as Artifact['artifactType'],
			context: row.context,
			sourceType: row.source_type as Artifact['sourceType'],
			sourceId: row.source_id,
			scope: {
				kind: row.scope_kind as Artifact['scope']['kind'],
				id: row.scope_id || undefined,
			},
			text: row.text,
			embeddingText: row.embedding_text,
			sourceUnitIds: row.source_unit_ids_json
				? (JSON.parse(row.source_unit_ids_json) as string[])
				: [],
			sourceRefs: row.source_refs_json
				? (JSON.parse(row.source_refs_json) as string[])
				: [],
			metadata: row.metadata_json
				? (JSON.parse(row.metadata_json) as Record<string, unknown>)
				: undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	private mapArtifactRecord(artifact: Artifact): EternalAiArtifactRecord {
		return {
			id: artifact.id,
			type: this.toEternalAiArtifactType(artifact.artifactType),
			context: artifact.context,
			scope: artifact.scope,
			text: artifact.text,
			sourceType: artifact.sourceType,
			sourceId: artifact.sourceId,
			metadata: artifact.metadata || null,
			createdAt: artifact.createdAt,
			updatedAt: artifact.updatedAt,
			score: artifact.score ?? null,
		};
	}

	private toEternalAiArtifactType(
		type: Artifact['artifactType']
	): EternalAiArtifactType {
		if (
			type === 'dialogue_window' ||
			type === 'episodic_memory' ||
			type === 'semantic_memory' ||
			type === 'session_summary' ||
			type === 'environment_state'
		) {
			return type;
		}

		throw new Error(`Artifact type ${type} is not supported by Eternal AI DTO`);
	}

	private mapTurnTrace(row: TurnTraceRow): EternalAiTurnTraceRecord {
		const recalledArtifacts = row.recalled_artifacts_json
			? ((JSON.parse(row.recalled_artifacts_json) as Artifact[]).map(artifact =>
					this.mapArtifactRecord(artifact)
				) as EternalAiTurnTraceRecord['recalledArtifacts'])
			: [];
		const parsedActions = row.parsed_actions_json
			? (JSON.parse(row.parsed_actions_json) as string[])
			: [];
		const parsedMemoryCandidates = row.parsed_memory_candidates_json
			? (JSON.parse(row.parsed_memory_candidates_json) as string[])
			: [];
		const parsedEnvironmentPatch = row.parsed_environment_patch_json
			? (JSON.parse(row.parsed_environment_patch_json) as Record<
					string,
					unknown
				>)
			: null;
		const runtimeExtraction =
			parsedActions.length ||
			parsedMemoryCandidates.length ||
			parsedEnvironmentPatch ||
			Boolean(row.parsed_used_structured_blocks)
				? {
						actions: parsedActions,
						memoryCandidates: parsedMemoryCandidates,
						environmentPatch: parsedEnvironmentPatch,
						usedStructuredBlocks: Boolean(row.parsed_used_structured_blocks),
					}
				: null;

		return {
			id: row.id,
			conversationId: row.conversation_id,
			turnId: row.turn_id,
			model: row.model,
			status: row.status,
			promptText: row.prompt_text,
			rawResponse: row.raw_response,
			runtimeExtraction,
			recalledArtifacts,
			promptFragments: row.prompt_fragments_json
				? (JSON.parse(
						row.prompt_fragments_json
					) as EternalAiTurnTraceRecord['promptFragments'])
				: [],
			timingsMs: row.timings_json
				? (JSON.parse(row.timings_json) as Record<string, number>)
				: {},
			errorText: row.error_text,
			startedAt: row.started_at,
			finishedAt: row.finished_at,
		};
	}
}
