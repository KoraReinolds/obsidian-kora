/**
 * @module features/sqlite-viewer/transport/sqlite-viewer-bridge
 * @description HTTP-клиент для универсального SQLite viewer поверх Kora server.
 */

import {
	BaseHttpClient,
	type HttpClientConfig,
} from '../../../telegram/core/base-http-client';
import type {
	SqliteViewerDatabaseRecord,
	SqliteViewerDeleteRowRequest,
	SqliteViewerMutationResponse,
	SqliteViewerTableRowsResponse,
	SqliteViewerTargetRecord,
	SqliteViewerUpdateCellRequest,
} from '../../../../../../packages/contracts/src/sqlite-viewer';

interface SqliteViewerTargetsApiResponse {
	success: boolean;
	targets?: SqliteViewerTargetRecord[];
	error?: string;
}

interface SqliteViewerDatabaseApiResponse {
	success: boolean;
	database?: SqliteViewerDatabaseRecord;
	error?: string;
}

interface SqliteViewerRowsApiResponse {
	success: boolean;
	result?: SqliteViewerTableRowsResponse;
	error?: string;
}

type SqliteViewerMutationApiResponse = SqliteViewerMutationResponse;

export class SqliteViewerBridge extends BaseHttpClient {
	constructor(config: Partial<HttpClientConfig> = {}) {
		super(config);
	}

	async listTargets(): Promise<SqliteViewerTargetRecord[]> {
		const response = await this.handleRequest<SqliteViewerTargetsApiResponse>(
			'/sqlite-viewer/targets',
			{},
			'Ошибка загрузки SQLite viewer targets'
		);

		if (!response?.success) {
			throw new Error(response?.error || 'Не удалось загрузить список баз');
		}

		return response.targets || [];
	}

	async inspectDatabase(path: string): Promise<SqliteViewerDatabaseRecord> {
		const response = await this.handleRequest<SqliteViewerDatabaseApiResponse>(
			`/sqlite-viewer/database?path=${encodeURIComponent(path)}`,
			{},
			'Ошибка загрузки структуры SQLite'
		);

		if (!response?.success || !response.database) {
			throw new Error(response?.error || 'Не удалось прочитать SQLite файл');
		}

		return response.database;
	}

	async queryTable(params: {
		path: string;
		table: string;
		limit?: number;
		offset?: number;
		orderBy?: string;
		orderDir?: 'asc' | 'desc';
		filterText?: string;
	}): Promise<SqliteViewerTableRowsResponse> {
		const query = new URLSearchParams({
			path: params.path,
			table: params.table,
			limit: String(params.limit || 100),
			offset: String(params.offset || 0),
			orderDir: params.orderDir || 'asc',
		});
		if (params.orderBy) {
			query.set('orderBy', params.orderBy);
		}
		if (params.filterText) {
			query.set('filterText', params.filterText);
		}

		const response = await this.handleRequest<SqliteViewerRowsApiResponse>(
			`/sqlite-viewer/rows?${query.toString()}`,
			{},
			'Ошибка загрузки строк SQLite'
		);

		if (!response?.success || !response.result) {
			throw new Error(response?.error || 'Не удалось загрузить строки таблицы');
		}

		return response.result;
	}

	async updateCell(request: SqliteViewerUpdateCellRequest): Promise<number> {
		const response = await this.handleRequest<SqliteViewerMutationApiResponse>(
			'/sqlite-viewer/update-cell',
			{ method: 'POST', body: request },
			'Ошибка обновления значения SQLite'
		);

		if (!response?.success) {
			throw new Error(response?.error || 'Не удалось обновить значение');
		}

		return Number(response.changes || 0);
	}

	async deleteRow(request: SqliteViewerDeleteRowRequest): Promise<number> {
		const response = await this.handleRequest<SqliteViewerMutationApiResponse>(
			'/sqlite-viewer/delete-row',
			{ method: 'DELETE', body: request },
			'Ошибка удаления строки SQLite'
		);

		if (!response?.success) {
			throw new Error(response?.error || 'Не удалось удалить строку');
		}

		return Number(response.changes || 0);
	}
}
