/**
 * @module semantic-sqlite/sqlite-semantic-repository
 * @description Репозиторий над SQLite semantic index-ом. Хранит канонические payload-ы
 * и embeddings в одной БД; лексический поиск только через FTS5 (без LIKE-fallback).
 */

import type Database from 'better-sqlite3';
import type { SemanticStats, StoredContentRecord } from '../semantic/types.js';

export interface SQLiteSemanticUpsertRecord {
	pointId: string;
	originalId: string;
	contentType: string;
	title: string;
	content: string;
	contentHash: string;
	chunkId?: string;
	metadata: Record<string, any>;
	payload: Record<string, any>;
	embedding: number[];
	embeddingModel: string;
	embeddingDimensions: number;
	vectorizedAt: string;
}

export class SQLiteSemanticRepository {
	constructor(
		private readonly db: Database.Database,
		private readonly options: { databasePath: string }
	) {}

	/**
	 * @description Вставляет или обновляет каноническую запись и embedding в одной транзакции (upsert).
	 * @param {SQLiteSemanticUpsertRecord} record - Нормализованная запись semantic index-а.
	 * @returns {{ status: 'created' | 'updated' | 'unchanged'; qdrantId: string; existing: boolean }} Результат upsert-а.
	 */
	upsertRecord(record: SQLiteSemanticUpsertRecord): {
		status: 'created' | 'updated' | 'unchanged';
		qdrantId: string;
		existing: boolean;
	} {
		const existing = this.db
			.prepare(
				`
				SELECT content_hash
				FROM chunks
				WHERE point_id = ?
			`
			)
			.get(record.pointId) as { content_hash?: string } | undefined;

		if (existing?.content_hash === record.contentHash) {
			return {
				status: 'unchanged',
				qdrantId: record.pointId,
				existing: true,
			};
		}

		this.db.transaction(() => {
			this.db
				.prepare(
					`
					INSERT INTO chunks (
						point_id,
						original_id,
						content_type,
						title,
						content,
						content_hash,
						chunk_id,
						metadata_json,
						payload_json,
						vectorized_at,
						updated_at
					)
					VALUES (
						@pointId,
						@originalId,
						@contentType,
						@title,
						@content,
						@contentHash,
						@chunkId,
						@metadataJson,
						@payloadJson,
						@vectorizedAt,
						CURRENT_TIMESTAMP
					)
					ON CONFLICT(point_id) DO UPDATE SET
						original_id = excluded.original_id,
						content_type = excluded.content_type,
						title = excluded.title,
						content = excluded.content,
						content_hash = excluded.content_hash,
						chunk_id = excluded.chunk_id,
						metadata_json = excluded.metadata_json,
						payload_json = excluded.payload_json,
						vectorized_at = excluded.vectorized_at,
						updated_at = CURRENT_TIMESTAMP
				`
				)
				.run({
					...record,
					metadataJson: JSON.stringify(record.metadata || {}),
					payloadJson: JSON.stringify(record.payload || {}),
				});

			this.db
				.prepare(
					`
					INSERT INTO chunk_embeddings (
						point_id,
						embedding_json,
						embedding_model,
						embedding_dimensions,
						updated_at
					)
					VALUES (
						@pointId,
						@embeddingJson,
						@embeddingModel,
						@embeddingDimensions,
						CURRENT_TIMESTAMP
					)
					ON CONFLICT(point_id) DO UPDATE SET
						embedding_json = excluded.embedding_json,
						embedding_model = excluded.embedding_model,
						embedding_dimensions = excluded.embedding_dimensions,
						updated_at = CURRENT_TIMESTAMP
				`
				)
				.run({
					pointId: record.pointId,
					embeddingJson: JSON.stringify(record.embedding),
					embeddingModel: record.embeddingModel,
					embeddingDimensions: record.embeddingDimensions,
				});

			this.db
				.prepare('DELETE FROM chunks_fts WHERE point_id = ?')
				.run(record.pointId);
			this.db
				.prepare(
					`
					INSERT INTO chunks_fts (point_id, title, content)
					VALUES (?, ?, ?)
				`
				)
				.run(record.pointId, record.title, record.content);
		})();

		return {
			status: existing ? 'updated' : 'created',
			qdrantId: record.pointId,
			existing: !!existing,
		};
	}

	/**
	 * @description Возвращает одну запись по ключу. Для неизвестных ключей делает JS-filter по payload.
	 * @param {string} key - Ключ поиска.
	 * @param {string} value - Значение поиска.
	 * @returns {StoredContentRecord | null} Запись или null.
	 */
	getContentBy(key: string, value: string): StoredContentRecord | null {
		const directColumn = this.getDirectColumnForKey(key);
		if (directColumn) {
			const row = this.db
				.prepare(
					`
					SELECT point_id, payload_json
					FROM chunks
					WHERE ${directColumn} = ?
					LIMIT 1
				`
				)
				.get(value) as { point_id: string; payload_json: string } | undefined;

			return row ? this.toStoredRecord(row.point_id, row.payload_json) : null;
		}

		return this.getContentsBy(key, value, 1).at(0) || null;
	}

	/**
	 * @description Возвращает несколько записей по ключу.
	 * @param {string} key - Ключ поиска.
	 * @param {string} value - Значение поиска.
	 * @param {number} [limit=2048] - Максимум результатов.
	 * @returns {StoredContentRecord[]} Список записей.
	 */
	getContentsBy(
		key: string,
		value: string,
		limit = 2048
	): StoredContentRecord[] {
		const directColumn = this.getDirectColumnForKey(key);
		if (directColumn) {
			const rows = this.db
				.prepare(
					`
					SELECT point_id, payload_json
					FROM chunks
					WHERE ${directColumn} = ?
					LIMIT ?
				`
				)
				.all(value, limit) as Array<{ point_id: string; payload_json: string }>;

			return rows.map(row =>
				this.toStoredRecord(row.point_id, row.payload_json)
			);
		}

		const rows = this.db
			.prepare(
				`
				SELECT point_id, payload_json
				FROM chunks
				LIMIT ?
			`
			)
			.all(limit) as Array<{ point_id: string; payload_json: string }>;

		return rows
			.map(row => this.toStoredRecord(row.point_id, row.payload_json))
			.filter(record => this.getNestedValue(record.payload, key) === value);
	}

	/**
	 * @description Удаляет записи по ключу. FTS-слой поддерживается в той же транзакции.
	 * @param {string} key - Ключ фильтра.
	 * @param {string | string[]} value - Одно или несколько значений.
	 * @returns {{ deleted: number }} Количество удалённых строк.
	 */
	deleteBy(key: string, value: string | string[]): { deleted: number } {
		const values = Array.isArray(value) ? value : [value];
		const directColumn = this.getDirectColumnForKey(key);

		if (directColumn) {
			return this.deleteByDirectColumn(directColumn, values);
		}

		const matchingIds = this.db
			.prepare(
				`
				SELECT point_id, payload_json
				FROM chunks
			`
			)
			.all() as Array<{ point_id: string; payload_json: string }>;

		const ids = matchingIds
			.map(row => this.toStoredRecord(row.point_id, row.payload_json))
			.filter(record =>
				values.includes(String(this.getNestedValue(record.payload, key)))
			)
			.map(record => record.qdrantId);

		return this.deleteByPointIds(ids);
	}

	/**
	 * @description Возвращает кандидатов для vector similarity.
	 * @param {string[]} [contentTypes=[]] - Ограничение по типам контента.
	 * @returns {Array<{ qdrantId: string; payload: any; embedding: number[] }>} Кандидаты с embeddings.
	 */
	listVectorCandidates(
		contentTypes: string[] = []
	): Array<{ qdrantId: string; payload: any; embedding: number[] }> {
		const rows =
			contentTypes.length > 0
				? (this.db
						.prepare(
							`
							SELECT c.point_id, c.payload_json, e.embedding_json
							FROM chunks c
							INNER JOIN chunk_embeddings e ON e.point_id = c.point_id
							WHERE c.content_type IN (${contentTypes.map(() => '?').join(', ')})
						`
						)
						.all(...contentTypes) as Array<{
						point_id: string;
						payload_json: string;
						embedding_json: string;
					}>)
				: (this.db
						.prepare(
							`
							SELECT c.point_id, c.payload_json, e.embedding_json
							FROM chunks c
							INNER JOIN chunk_embeddings e ON e.point_id = c.point_id
						`
						)
						.all() as Array<{
						point_id: string;
						payload_json: string;
						embedding_json: string;
					}>);

		return rows.map(row => ({
			qdrantId: row.point_id,
			payload: this.safeJsonParse(row.payload_json, {}),
			embedding: this.safeJsonParse(row.embedding_json, []),
		}));
	}

	/**
	 * @description Лексические совпадения через FTS5 (`chunks_fts`). Без токенов для MATCH —
	 * пустой массив; ошибка SQL не маскируется.
	 * @param {string} query - Поисковый запрос.
	 * @param {number} limit - Максимум результатов.
	 * @returns {Array<{ qdrantId: string; payload: any; lexicalScore: number }>}
	 */
	findLexicalMatches(
		query: string,
		limit: number
	): Array<{ qdrantId: string; payload: any; lexicalScore: number }> {
		if (!query.trim()) {
			return [];
		}

		const ftsQuery = this.buildFtsQuery(query);
		if (!ftsQuery) {
			return [];
		}

		let rows: Array<{
			point_id: string;
			payload_json: string;
			rank: number;
		}>;
		try {
			rows = this.db
				.prepare(
					`
					SELECT c.point_id, c.payload_json, bm25(chunks_fts) AS rank
					FROM chunks_fts
					INNER JOIN chunks c ON c.point_id = chunks_fts.point_id
					WHERE chunks_fts MATCH ?
					LIMIT ?
				`
				)
				.all(ftsQuery, limit) as Array<{
				point_id: string;
				payload_json: string;
				rank: number;
			}>;
		} catch (error) {
			// eslint-disable-next-line no-console
			console.error('[semantic-sqlite] FTS query failed', {
				query: query.slice(0, 200),
				ftsQuery,
			});
			throw error;
		}

		return rows.map(row => ({
			qdrantId: row.point_id,
			payload: this.safeJsonParse(row.payload_json, {}),
			lexicalScore: this.rankToScore(row.rank),
		}));
	}

	/**
	 * @description Возвращает статистику SQLite semantic index-а.
	 * @param {number} vectorSize - Ожидаемая размерность embedding-модели.
	 * @returns {SemanticStats} Сводка по БД.
	 */
	getStats(vectorSize: number): SemanticStats {
		const row = this.db
			.prepare('SELECT COUNT(*) AS count FROM chunks')
			.get() as { count: number };
		const breakdownRows = this.db
			.prepare(
				`
				SELECT content_type, COUNT(*) AS count
				FROM chunks
				GROUP BY content_type
			`
			)
			.all() as Array<{ content_type: string; count: number }>;

		const contentTypeBreakdown = breakdownRows.reduce<Record<string, number>>(
			(acc, item) => {
				acc[item.content_type] = Number(item.count || 0);
				return acc;
			},
			{}
		);

		return {
			backend: 'sqlite',
			collection: this.options.databasePath,
			totalPoints: Number(row?.count || 0),
			vectorSize,
			contentTypeBreakdown,
			status: 'ready',
			databasePath: this.options.databasePath,
		};
	}

	private deleteByDirectColumn(
		column: string,
		values: string[]
	): { deleted: number } {
		const rows = this.db
			.prepare(
				`
				SELECT point_id
				FROM chunks
				WHERE ${column} IN (${values.map(() => '?').join(', ')})
			`
			)
			.all(...values) as Array<{ point_id: string }>;

		return this.deleteByPointIds(rows.map(row => row.point_id));
	}

	private deleteByPointIds(ids: string[]): { deleted: number } {
		if (ids.length === 0) {
			return { deleted: 0 };
		}

		this.db.transaction(() => {
			this.db
				.prepare(
					`
					DELETE FROM chunks_fts
					WHERE point_id IN (${ids.map(() => '?').join(', ')})
				`
				)
				.run(...ids);

			this.db
				.prepare(
					`
					DELETE FROM chunks
					WHERE point_id IN (${ids.map(() => '?').join(', ')})
				`
				)
				.run(...ids);
		})();

		return { deleted: ids.length };
	}

	private getDirectColumnForKey(key: string): string | null {
		switch (key) {
			case 'id':
			case 'qdrantId':
			case 'pointId':
				return 'point_id';
			case 'originalId':
				return 'original_id';
			case 'contentType':
				return 'content_type';
			case 'chunkId':
				return 'chunk_id';
			default:
				return null;
		}
	}

	private toStoredRecord(
		pointId: string,
		payloadJson: string
	): StoredContentRecord {
		return {
			qdrantId: pointId,
			payload: this.safeJsonParse(payloadJson, {}),
		};
	}

	private rankToScore(rank: number): number {
		const normalized = Math.abs(rank ?? 0);
		return 1 / (normalized + 1);
	}

	private buildFtsQuery(query: string): string {
		return query
			.split(/\s+/)
			.map(term => term.trim().replace(/[^\p{L}\p{N}_]+/gu, ''))
			.filter(term => /[\p{L}\p{N}]/u.test(term))
			.map(term => `${term}*`)
			.join(' OR ');
	}

	private getNestedValue(
		source: Record<string, any> | undefined | null,
		key: string
	): unknown {
		if (!source || !key) {
			return undefined;
		}

		return key.split('.').reduce<unknown>((acc, segment) => {
			if (
				acc &&
				typeof acc === 'object' &&
				segment in (acc as Record<string, any>)
			) {
				return (acc as Record<string, any>)[segment];
			}
			return undefined;
		}, source);
	}

	private safeJsonParse<T>(value: string, fallback: T): T {
		try {
			return JSON.parse(value) as T;
		} catch {
			return fallback;
		}
	}
}
