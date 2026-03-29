/**
 * @module packages/contracts/sqlite-viewer
 * @description DTO универсального low-level SQLite viewer. Контракт не привязан
 * к Eternal AI и позволяет открывать любой sqlite-файл, перечислять таблицы и
 * просматривать строки с фильтрацией и сортировкой.
 */

export interface SqliteViewerTargetRecord {
	id: string;
	label: string;
	path: string;
	exists: boolean;
}

export interface SqliteViewerColumnRecord {
	name: string;
	type: string;
	notNull: boolean;
	isPrimaryKey: boolean;
}

export interface SqliteViewerTableRecord {
	name: string;
	rowCount: number;
	columns: SqliteViewerColumnRecord[];
}

export interface SqliteViewerDatabaseRecord {
	path: string;
	tables: SqliteViewerTableRecord[];
}

export interface SqliteViewerTableRowsRequest {
	path: string;
	table: string;
	limit?: number;
	offset?: number;
	orderBy?: string;
	orderDir?: 'asc' | 'desc';
	filterText?: string;
}

export interface SqliteViewerTableRowsResponse {
	path: string;
	table: string;
	columns: SqliteViewerColumnRecord[];
	rows: Array<Record<string, unknown>>;
	limit: number;
	offset: number;
	orderBy?: string | null;
	orderDir: 'asc' | 'desc';
	filterText?: string;
	totalRows: number;
}
