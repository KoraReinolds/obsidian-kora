/**
 * @module routes/sqlite-viewer
 * @description Регистрирует универсальные маршруты для просмотра SQLite и
 * точечных debug-мутаций через скрытый `rowid`. Viewer нужен как
 * низкоуровневый инструмент поверх любых локальных баз: Eternal AI, archive,
 * semantic storage и произвольных sqlite-файлов.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import Database from 'better-sqlite3';
import type {
	SqliteViewerColumnRecord,
	SqliteViewerDeleteRowRequest,
	SqliteViewerMutationResponse,
	SqliteViewerTableRowRecord,
	SqliteViewerTableRowsResponse,
	SqliteViewerUpdateCellRequest,
} from '../../../packages/contracts/src/sqlite-viewer.js';
import { getConfig } from '../services/config-service.js';
import { getEternalAiDatabasePath } from '../modules/eternal-ai/services/eternal-ai-service-singleton.js';

interface TableNameRow {
	name: string;
}

interface ColumnInfoRow {
	name: string;
	type: string;
	notnull: number;
	pk: number;
}

function resolveViewerPath(inputPath: string): string {
	return path.isAbsolute(inputPath)
		? inputPath
		: path.resolve(process.cwd(), inputPath);
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`;
}

function getDatabaseTargets() {
	const config = getConfig();
	const targets = [
		{
			id: 'eternal-ai',
			label: 'Eternal AI',
			path: getEternalAiDatabasePath() || config.eternalAiDatabasePath || '',
		},
		{
			id: 'archive',
			label: 'Telegram Archive',
			path: config.archiveDatabasePath || '',
		},
		{
			id: 'semantic',
			label: 'Semantic SQLite',
			path: config.semanticDatabasePath || '',
		},
	];

	return targets
		.filter(target => target.path)
		.map(target => ({
			...target,
			path: resolveViewerPath(target.path),
			exists: fs.existsSync(resolveViewerPath(target.path)),
		}));
}

/**
 * @description Открывает sqlite-файл в нужном режиме и гарантированно закрывает
 * соединение после завершения callback.
 * @param {string} databasePath - Абсолютный или относительный путь к sqlite-файлу.
 * @param {{ readonly: boolean }} options - Флаг режима чтения/записи.
 * @param {(db: Database.Database) => T} callback - Код, работающий с открытой БД.
 * @returns {T} Результат callback.
 */
function withDatabase<T>(
	databasePath: string,
	options: { readonly: boolean },
	callback: (db: Database.Database) => T
): T {
	const resolvedPath = resolveViewerPath(databasePath);
	if (!fs.existsSync(resolvedPath)) {
		throw new Error(`SQLite file not found: ${resolvedPath}`);
	}
	const db = new Database(resolvedPath, {
		readonly: options.readonly,
		fileMustExist: true,
	});
	try {
		return callback(db);
	} finally {
		db.close();
	}
}

function listTableColumns(
	db: Database.Database,
	tableName: string
): SqliteViewerColumnRecord[] {
	const quotedTable = tableName.replace(/'/g, "''");
	const rows = db
		.prepare(`PRAGMA table_info('${quotedTable}')`)
		.all() as ColumnInfoRow[];
	return rows.map(row => ({
		name: row.name,
		type: row.type || 'TEXT',
		notNull: row.notnull === 1,
		isPrimaryKey: row.pk > 0,
	}));
}

/**
 * @description Возвращает список пользовательских таблиц, доступных в viewer.
 * Системные `sqlite_%` исключаются, чтобы UI и debug-операции работали только
 * по прикладным сущностям.
 * @param {Database.Database} db - Открытая sqlite-база.
 * @returns {string[]} Имена пользовательских таблиц.
 */
function listUserTables(db: Database.Database): string[] {
	return (
		db
			.prepare(
				`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
			)
			.all() as TableNameRow[]
	).map(row => row.name);
}

/**
 * @description Проверяет существование таблицы перед построением SQL из имени,
 * пришедшего из UI.
 * @param {Database.Database} db - Открытая sqlite-база.
 * @param {string} table - Имя таблицы.
 * @returns {void}
 */
function assertTableExists(db: Database.Database, table: string): void {
	if (!listUserTables(db).includes(table)) {
		throw new Error(`Таблица не найдена: ${table}`);
	}
}

/**
 * @description Проверяет, доступен ли скрытый `rowid` у таблицы. На этом
 * свойстве строится первая editable-версия viewer без отдельного CRUD под
 * каждую таблицу.
 * @param {Database.Database} db - Открытая sqlite-база.
 * @param {string} table - Имя таблицы.
 * @returns {boolean} `true`, если таблица поддерживает адресацию по `rowid`.
 */
function supportsRowId(db: Database.Database, table: string): boolean {
	try {
		db.prepare(
			`SELECT rowid AS __rowid__ FROM ${quoteIdentifier(table)} LIMIT 1`
		).get();
		return true;
	} catch {
		return false;
	}
}

/**
 * @description Проверяет существование колонки перед точечным обновлением
 * значения через viewer.
 * @param {Database.Database} db - Открытая sqlite-база.
 * @param {string} table - Имя таблицы.
 * @param {string} column - Имя колонки.
 * @returns {void}
 */
function assertColumnExists(
	db: Database.Database,
	table: string,
	column: string
): void {
	if (!listTableColumns(db, table).some(item => item.name === column)) {
		throw new Error(`Колонка не найдена: ${column}`);
	}
}

function buildRowsResponse(params: {
	db: Database.Database;
	request: Request;
}): SqliteViewerTableRowsResponse {
	const databasePath = String(params.request.query.path || '').trim();
	const table = String(params.request.query.table || '').trim();
	if (!databasePath || !table) {
		throw new Error('Для SQLite viewer rows нужны path и table.');
	}

	const limitRaw = Number.parseInt(
		String(params.request.query.limit || '100'),
		10
	);
	const offsetRaw = Number.parseInt(
		String(params.request.query.offset || '0'),
		10
	);
	const limit = Number.isFinite(limitRaw)
		? Math.min(Math.max(limitRaw, 1), 500)
		: 100;
	const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
	const orderDir =
		String(params.request.query.orderDir || 'asc').toLowerCase() === 'desc'
			? 'desc'
			: 'asc';
	const filterText = String(params.request.query.filterText || '').trim();

	assertTableExists(params.db, table);
	const columns = listTableColumns(params.db, table);
	const supportsRowIdMutations = supportsRowId(params.db, table);
	const orderByCandidate = String(params.request.query.orderBy || '').trim();
	const orderBy = columns.some(column => column.name === orderByCandidate)
		? orderByCandidate
		: columns[0]?.name || null;
	const quotedTable = quoteIdentifier(table);
	const filterClause = filterText
		? `WHERE ${columns
				.map(column => `CAST(${quoteIdentifier(column.name)} AS TEXT) LIKE ?`)
				.join(' OR ')}`
		: '';
	const filterArgs = filterText ? columns.map(() => `%${filterText}%`) : [];
	const totalRow = params.db
		.prepare(`SELECT COUNT(*) as total FROM ${quotedTable} ${filterClause}`)
		.get(...filterArgs) as { total: number } | undefined;
	const rows = params.db
		.prepare(
			[
				supportsRowIdMutations
					? `SELECT rowid AS __rowid__, * FROM ${quotedTable}`
					: `SELECT * FROM ${quotedTable}`,
				filterClause,
				orderBy
					? `ORDER BY ${quoteIdentifier(orderBy)} ${orderDir.toUpperCase()}`
					: '',
				'LIMIT ? OFFSET ?',
			]
				.filter(Boolean)
				.join(' ')
		)
		.all(...filterArgs, limit, offset) as SqliteViewerTableRowRecord[];

	return {
		path: resolveViewerPath(databasePath),
		table,
		columns,
		rows,
		limit,
		offset,
		orderBy,
		orderDir,
		filterText,
		totalRows: Number(totalRow?.total || 0),
		supportsRowIdMutations,
	};
}

/**
 * @description Обновляет одну ячейку по скрытому `rowid`. Это low-level
 * debug-операция: caller сам выбирает таблицу и колонку, а сервер лишь
 * проверяет существование сущностей и выполняет точечный SQL.
 * @param {Database.Database} db - Открытая sqlite-база в writable-режиме.
 * @param {SqliteViewerUpdateCellRequest} request - DTO обновления ячейки.
 * @returns {number} Количество реально изменённых строк.
 */
function updateCellByRowId(
	db: Database.Database,
	request: SqliteViewerUpdateCellRequest
): number {
	const table = String(request.table || '').trim();
	const column = String(request.column || '').trim();
	const rowId = Number(request.rowId);
	if (!table || !column || !Number.isInteger(rowId)) {
		throw new Error(
			'Для update-cell нужны table, column и целочисленный rowId.'
		);
	}
	assertTableExists(db, table);
	if (!supportsRowId(db, table)) {
		throw new Error(`Таблица не поддерживает rowid-мутации: ${table}`);
	}
	assertColumnExists(db, table, column);
	const result = db
		.prepare(
			`UPDATE ${quoteIdentifier(table)} SET ${quoteIdentifier(column)} = ? WHERE rowid = ?`
		)
		.run(request.value ?? null, rowId);
	return Number(result.changes || 0);
}

/**
 * @description Удаляет строку через скрытый `rowid`.
 * @param {Database.Database} db - Открытая sqlite-база в writable-режиме.
 * @param {SqliteViewerDeleteRowRequest} request - DTO удаления строки.
 * @returns {number} Количество реально удалённых строк.
 */
function deleteRowByRowId(
	db: Database.Database,
	request: SqliteViewerDeleteRowRequest
): number {
	const table = String(request.table || '').trim();
	const rowId = Number(request.rowId);
	if (!table || !Number.isInteger(rowId)) {
		throw new Error('Для delete-row нужны table и целочисленный rowId.');
	}
	assertTableExists(db, table);
	if (!supportsRowId(db, table)) {
		throw new Error(`Таблица не поддерживает rowid-мутации: ${table}`);
	}
	const result = db
		.prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE rowid = ?`)
		.run(rowId);
	return Number(result.changes || 0);
}

/**
 * @description Подключает маршруты low-level SQLite viewer.
 * @param {Express} app - Экземпляр сервера.
 * @returns {void}
 */
export function registerSqliteViewerRoutes(app: Express): void {
	app.get('/sqlite-viewer/targets', (_req: Request, res: Response) => {
		try {
			res.json({
				success: true,
				targets: getDatabaseTargets(),
			});
		} catch (error: any) {
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.get('/sqlite-viewer/database', (req: Request, res: Response) => {
		try {
			const databasePath = String(req.query.path || '').trim();
			if (!databasePath) {
				throw new Error('Для SQLite viewer обязателен query-параметр path.');
			}

			const database = withDatabase(databasePath, { readonly: true }, db => {
				const tables = db
					.prepare(
						`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`
					)
					.all() as TableNameRow[];

				return {
					path: resolveViewerPath(databasePath),
					tables: tables.map(table => {
						const columns = listTableColumns(db, table.name);
						const row = db
							.prepare(
								`SELECT COUNT(*) as total FROM ${quoteIdentifier(table.name)}`
							)
							.get() as { total: number } | undefined;
						return {
							name: table.name,
							rowCount: Number(row?.total || 0),
							columns,
						};
					}),
				};
			});

			res.json({
				success: true,
				database,
			});
		} catch (error: any) {
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.get('/sqlite-viewer/rows', (req: Request, res: Response) => {
		try {
			const databasePath = String(req.query.path || '').trim();
			if (!databasePath) {
				throw new Error('Для SQLite viewer rows обязателен path.');
			}

			const result = withDatabase(databasePath, { readonly: true }, db =>
				buildRowsResponse({
					db,
					request: req,
				})
			);

			res.json({
				success: true,
				result,
			});
		} catch (error: any) {
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.post('/sqlite-viewer/update-cell', (req: Request, res: Response) => {
		try {
			const payload = (req.body || {}) as SqliteViewerUpdateCellRequest;
			const databasePath = String(payload.path || '').trim();
			if (!databasePath) {
				throw new Error('Для SQLite viewer update-cell обязателен path.');
			}
			const changes = withDatabase(databasePath, { readonly: false }, db =>
				updateCellByRowId(db, payload)
			);
			const response: SqliteViewerMutationResponse = {
				success: true,
				changes,
			};
			res.json(response);
		} catch (error: any) {
			res.status(500).json({
				success: false,
				changes: 0,
				error: error.message,
			} satisfies SqliteViewerMutationResponse);
		}
	});

	app.delete('/sqlite-viewer/delete-row', (req: Request, res: Response) => {
		try {
			const payload = (req.body || {}) as SqliteViewerDeleteRowRequest;
			const databasePath = String(payload.path || '').trim();
			if (!databasePath) {
				throw new Error('Для SQLite viewer delete-row обязателен path.');
			}
			const changes = withDatabase(databasePath, { readonly: false }, db =>
				deleteRowByRowId(db, payload)
			);
			const response: SqliteViewerMutationResponse = {
				success: true,
				changes,
			};
			res.json(response);
		} catch (error: any) {
			res.status(500).json({
				success: false,
				changes: 0,
				error: error.message,
			} satisfies SqliteViewerMutationResponse);
		}
	});
}
