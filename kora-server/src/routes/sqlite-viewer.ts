/**
 * @module routes/sqlite-viewer
 * @description Регистрирует универсальные read-only маршруты для просмотра SQLite.
 * Viewer нужен как низкоуровневый debug-инструмент поверх любых локальных баз:
 * Eternal AI, archive, semantic storage и произвольных sqlite-файлов.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import Database from 'better-sqlite3';
import type {
	SqliteViewerColumnRecord,
	SqliteViewerTableRowsResponse,
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

function withReadonlyDatabase<T>(
	databasePath: string,
	callback: (db: Database.Database) => T
): T {
	const resolvedPath = resolveViewerPath(databasePath);
	if (!fs.existsSync(resolvedPath)) {
		throw new Error(`SQLite file not found: ${resolvedPath}`);
	}
	const db = new Database(resolvedPath, {
		readonly: true,
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

	const tables = params.db
		.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
		)
		.all() as TableNameRow[];
	if (!tables.some(row => row.name === table)) {
		throw new Error(`Таблица не найдена: ${table}`);
	}

	const columns = listTableColumns(params.db, table);
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
				`SELECT * FROM ${quotedTable}`,
				filterClause,
				orderBy
					? `ORDER BY ${quoteIdentifier(orderBy)} ${orderDir.toUpperCase()}`
					: '',
				'LIMIT ? OFFSET ?',
			]
				.filter(Boolean)
				.join(' ')
		)
		.all(...filterArgs, limit, offset) as Array<Record<string, unknown>>;

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
	};
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

			const database = withReadonlyDatabase(databasePath, db => {
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

			const result = withReadonlyDatabase(databasePath, db =>
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
}
