/**
 * @module modules/eternal-ai/eternal-ai-repository
 * @description Репозиторий Eternal AI истории. Хранит conversation headers и
 * полную последовательность сообщений, чтобы экран Obsidian мог открывать старые
 * диалоги без повторного запроса к внешнему провайдеру.
 */

import Database from 'better-sqlite3';
import type {
	CreateEternalAiConversationRequest,
	EternalAiConversationSummary,
	EternalAiMessageRecord,
} from '../../../../packages/contracts/src/eternal-ai';

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
	status: 'complete' | 'error';
	error_text: string | null;
	attachments_json: string | null;
	metadata_json: string | null;
	created_at: string;
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
	status: 'complete' | 'error';
	errorText?: string | null;
	attachments?: Array<Record<string, unknown>> | null;
	metadata?: Record<string, unknown> | null;
	createdAt: string;
}

export class EternalAiRepository {
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
			metadata: row.metadata_json
				? (JSON.parse(row.metadata_json) as Record<string, unknown>)
				: null,
			createdAt: row.created_at,
		};
	}
}
