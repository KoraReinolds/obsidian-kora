/**
 * @module ui-vue/types/entity-list
 * @description Общие типы для узких list/editor примитивов. Контракты намеренно
 * остаются простыми, чтобы не превращать `EntityList` и `EntityEditorModal` в
 * универсальный framework-конструктор экранов.
 */

export type TEntityListKey = string | number;

/**
 * @description Второстепенные действия в строке списка (не удаление сущности —
 * удаление выносите в `EntityEditorModal`).
 */
export interface IEntityListAction<TItem = unknown> {
	id: string;
	label: string;
	title?: string;
	icon?: string;
	variant?: 'accent' | 'muted' | 'danger';
	disabled?: (item: TItem) => boolean;
	loading?: (item: TItem) => boolean;
	run: (item: TItem) => void | Promise<void>;
}

export interface IEntityEditorOption {
	value: string;
	label: string;
}

export interface IEntityEditorField<TValue = unknown> {
	key: string;
	label: string;
	kind: 'text' | 'textarea' | 'select' | 'json' | 'readonly';
	description?: string;
	placeholder?: string;
	rows?: number;
	options?: IEntityEditorOption[];
	/**
	 * @description Читает значение из сущности. Нужен для readonly-полей и случаев,
	 * когда UI отображает производное значение, а не прямое поле верхнего уровня.
	 */
	read?: (value: TValue) => unknown;
}
