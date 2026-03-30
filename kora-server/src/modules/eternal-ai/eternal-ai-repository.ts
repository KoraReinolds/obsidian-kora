/**
 * @module modules/eternal-ai/eternal-ai-repository
 * @description Репозиторий Eternal AI истории. Хранит conversation headers и
 * полную последовательность сообщений, чтобы экран Obsidian мог открывать старые
 * диалоги без повторного запроса к внешнему провайдеру.
 */

import Database from 'better-sqlite3';
import type {
	EternalAiArtifactType,
	CreateEternalAiConversationRequest,
	EternalAiArtifactRecord,
	EternalAiConversationSummary,
	EternalAiMessageMetadata,
	EternalAiMessageRecord,
	EternalAiTurnTraceRecord,
	UpdateEternalAiArtifactRequest,
} from '../../../../packages/contracts/src/eternal-ai.js';
import type { CanonicalChatMessage } from '../../../../packages/contracts/src/canonical-chat-message.js';
import type {
	Artifact,
	ArtifactRecallQuery,
	ArtifactStorePort,
} from '../../../../packages/kora-core/src/memory/index.js';
import type { TurnTrace } from '../../../../packages/kora-core/src/runtime/index.js';

interface ConversationRow {
	id: string;
	title: string;
	model: string;
	system_prompt: string | null;
	last_message_preview: string | null;
	last_message_at: string | null;
	message_count: number;
	created_at: string;
	updated_at: string;
}

interface MessageRow {
	id: string;
	conversation_id: string;
	role: 'user' | 'assistant' | 'system';
	content_text: string;
	model: string | null;
	status: 'complete' | 'error' | 'pending';
	error_text: string | null;
	attachments_json: string | null;
	metadata_json: string | null;
	created_at: string;
}

interface ArtifactRow {
	id: string;
	conversation_id: string | null;
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

export interface CreateConversationInput extends CreateEternalAiConversationRequest {
	id: string;
	createdAt: string;
}

export interface InsertMessageInput {
	id: string;
	conversationId: string;
	role: 'user' | 'assistant' | 'system';
	contentText: string;
	model?: string | null;
	status: 'complete' | 'error' | 'pending';
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
						c.last_message_preview,
						c.last_message_at,
						c.created_at,
						c.updated_at,
						COUNT(m.id) AS message_count
					FROM eternal_ai_conversations c
					LEFT JOIN eternal_ai_messages m
						ON m.conversation_id = c.id
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
						c.last_message_preview,
						c.last_message_at,
						c.created_at,
						c.updated_at,
						COUNT(m.id) AS message_count
					FROM eternal_ai_conversations c
					LEFT JOIN eternal_ai_messages m
						ON m.conversation_id = c.id
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
						last_message_preview,
						last_message_at,
						created_at,
						updated_at
					) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)
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
				params.lastMessagePreview ?? current.lastMessagePreview ?? null,
				params.lastMessageAt ?? current.lastMessageAt ?? null,
				params.updatedAt,
				params.conversationId
			);
	}

	listMessages(conversationId: string): EternalAiMessageRecord[] {
		const rows = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
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

	insertMessage(input: InsertMessageInput): EternalAiMessageRecord {
		this.db
			.prepare(
				`
					INSERT INTO eternal_ai_messages (
						id,
						conversation_id,
						role,
						content_text,
						model,
						status,
						error_text,
						attachments_json,
						metadata_json,
						created_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`
			)
			.run(
				input.id,
				input.conversationId,
				input.role,
				input.contentText,
				input.model || null,
				input.status,
				input.errorText || null,
				input.attachments ? JSON.stringify(input.attachments) : null,
				input.metadata ? JSON.stringify(input.metadata) : null,
				input.createdAt
			);

		const row = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
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
			.get(input.id) as MessageRow;

		return this.mapMessage(row);
	}

	/**
	 * @description Загрузка сообщения по первичному ключу (для poll creative и слияния метаданных).
	 * @param {string} messageId - UUID сообщения
	 * @returns {EternalAiMessageRecord | null}
	 */
	getMessageById(messageId: string): EternalAiMessageRecord | null {
		const row = this.db
			.prepare(
				`
					SELECT
						id,
						conversation_id,
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

	/**
	 * @description Обновляет строку сообщения (дозапись результата генерации в то же сообщение ассистента).
	 * @param {string} messageId - id сообщения
	 * @param {object} patch - Поля для замены; {@code metadata} сливается поверх существующего JSON.
	 * @returns {EternalAiMessageRecord | null}
	 */
	updateMessage(
		messageId: string,
		patch: {
			contentText?: string;
			status?: 'complete' | 'error' | 'pending';
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

	deleteConversation(conversationId: string): boolean {
		const result = this.db
			.prepare('DELETE FROM eternal_ai_conversations WHERE id = ?')
			.run(conversationId);
		return result.changes > 0;
	}

	deleteMessage(conversationId: string, messageId: string): boolean {
		const result = this.db
			.prepare(
				`
					DELETE FROM eternal_ai_messages
					WHERE id = ? AND conversation_id = ?
				`
			)
			.run(messageId, conversationId);
		return result.changes > 0;
	}

	insertEffectJob(input: {
		requestId: string;
		conversationId: string;
		/** id якорного сообщения: для новых задач — pending assistant; для старых дампов — user. */
		userMessageId: string;
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
						user_message_id,
						effect_id,
						effect_tag,
						status,
						result_url,
						error_text,
						assistant_message_id,
						created_at,
						updated_at
					) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
				`
			)
			.run(
				input.requestId,
				input.conversationId,
				input.userMessageId,
				input.effectId,
				input.effectTag,
				input.status,
				input.createdAt,
				input.updatedAt
			);
	}

	getEffectJob(requestId: string): {
		request_id: string;
		conversation_id: string;
		user_message_id: string;
		effect_id: string;
		effect_tag: string | null;
		status: string;
		result_url: string | null;
		error_text: string | null;
		assistant_message_id: string | null;
	} | null {
		const row = this.db
			.prepare(
				`
					SELECT
						request_id,
						conversation_id,
						user_message_id,
						effect_id,
						effect_tag,
						status,
						result_url,
						error_text,
						assistant_message_id
					FROM eternal_ai_effect_jobs
					WHERE request_id = ?
				`
			)
			.get(requestId) as
			| {
					request_id: string;
					conversation_id: string;
					user_message_id: string;
					effect_id: string;
					effect_tag: string | null;
					status: string;
					result_url: string | null;
					error_text: string | null;
					assistant_message_id: string | null;
			  }
			| undefined;

		return row || null;
	}

	updateEffectJob(
		requestId: string,
		patch: {
			status?: string;
			result_url?: string | null;
			error_text?: string | null;
			assistant_message_id?: string | null;
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
						assistant_message_id = ?,
						updated_at = ?
					WHERE request_id = ?
				`
			)
			.run(
				patch.status ?? current.status,
				patch.result_url !== undefined ? patch.result_url : current.result_url,
				patch.error_text !== undefined ? patch.error_text : current.error_text,
				patch.assistant_message_id !== undefined
					? patch.assistant_message_id
					: current.assistant_message_id,
				patch.updatedAt,
				requestId
			);
	}

	/**
	 * @description Удаляет завершённые effect_jobs с `updated_at` строго раньше порога.
	 * Итог генерации уже в `eternal_ai_messages`; строка джобы нужна в основном для
	 * идемпотентного poll в ограниченном окне после финала.
	 * @param {string} olderThanIso - ISO-время: удаляются строки, у которых `updated_at` меньше этого значения
	 * @returns {number} Число удалённых строк
	 */
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

	persistArtifacts(artifacts: Artifact[]): void {
		const insert = this.db.prepare(
			`
				INSERT INTO eternal_ai_artifacts (
					id,
					conversation_id,
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
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					conversation_id = excluded.conversation_id,
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
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`
			)
			.run(
				params.trace.id,
				params.conversationId,
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

	private mapConversation(row: ConversationRow): EternalAiConversationSummary {
		return {
			id: row.id,
			title: row.title,
			model: row.model,
			systemPrompt: row.system_prompt,
			lastMessagePreview: row.last_message_preview,
			lastMessageAt: row.last_message_at,
			messageCount: Number(row.message_count || 0),
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
