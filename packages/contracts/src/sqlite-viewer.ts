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

/**
 * @description Строка результата viewer. `__rowid__` добавляется только для
 * rowid-таблиц и используется как технический идентификатор для debug-mutation
 * операций без необходимости строить отдельный CRUD под каждую таблицу.
 */
export interface SqliteViewerTableRowRecord {
	__rowid__?: number;
	[columnName: string]: unknown;
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
	rows: SqliteViewerTableRowRecord[];
	limit: number;
	offset: number;
	orderBy?: string | null;
	orderDir: 'asc' | 'desc';
	filterText?: string;
	totalRows: number;
	supportsRowIdMutations: boolean;
}

/**
 * @description Запрос на обновление одной ячейки через скрытый `rowid`.
 * Используется только в debug viewer и не претендует на бизнес-уровневую
 * валидацию: caller сам указывает таблицу, колонку и новое значение.
 */
export interface SqliteViewerUpdateCellRequest {
	path: string;
	table: string;
	rowId: number;
	column: string;
	value: unknown;
}

/**
 * @description Запрос на удаление строки через скрытый `rowid`.
 */
export interface SqliteViewerDeleteRowRequest {
	path: string;
	table: string;
	rowId: number;
}

/**
 * @description Результат мутации low-level viewer. `changes` отражает количество
 * реально затронутых строк и помогает UI отличать "строка не найдена" от успеха.
 */
export interface SqliteViewerMutationResponse {
	success: boolean;
	changes: number;
	error?: string;
}
