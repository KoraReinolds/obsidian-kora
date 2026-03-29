/**
 * @module ui-vue/types/data-grid
 * @description Типы для общего `DataGrid`. Контракты ориентированы на raw/admin
 * таблицы, но специально оставляют доменную логику commit/delete снаружи.
 */

export interface IDataGridColumn<TItem = unknown> {
	id: string;
	label: string;
	width?: string;
	sortable?: boolean;
	mono?: boolean;
	editor?: 'text' | 'textarea';
	rows?: number;
	getValue?: (item: TItem) => unknown;
	format?: (value: unknown, item: TItem) => string;
	title?: (value: unknown, item: TItem) => string;
	editable?: boolean | ((item: TItem) => boolean);
	toEditValue?: (value: unknown, item: TItem) => string;
	/**
	 * @description Если `true`, в ячейке разрешён перенос и многострочный текст.
	 * По умолчанию одна строка с `text-overflow: ellipsis`, чтобы колонки не разъезжались.
	 */
	cellWrap?: boolean;
}

export interface IDataGridRowAction<TItem = unknown> {
	id: string;
	label: string;
	title?: string;
	icon?: string;
	variant?: 'accent' | 'muted' | 'danger';
	disabled?: (item: TItem) => boolean;
	loading?: (item: TItem) => boolean;
	run: (item: TItem) => void | Promise<void>;
}

export interface IDataGridEditPayload<TItem = unknown> {
	item: TItem;
	columnId: string;
	draft: string;
}
