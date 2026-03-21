/**
 * @module core/ui-vue/composables/use-paginated-list
 *
 * @description Обобщённый composable для пагинации списка и выполнения загрузки.
 */

import { ref } from 'vue';
import { useAsyncState } from './use-async-state';

/**
 * @description Параметры пагинации.
 */
export interface PaginationParams {
	limit: number;
	offset: number;
}

/**
 * @description Результат пагинации.
 * @template T
 */
export interface PaginatedResult<T> {
	items: T[];
	total: number;
}

/**
 * @description Создает реактивный paginated state с helper-методом refresh.
 * @template T
 * @param {(params: PaginationParams) => Promise<PaginatedResult<T>>} loader - Функция загрузки страницы.
 * @param {PaginationParams} initial - Начальные параметры.
 * @returns {{
 *   items: import('vue').Ref<T[]>,
 *   total: import('vue').Ref<number>,
 *   params: import('vue').Ref<PaginationParams>,
 *   isLoading: import('vue').Ref<boolean>,
 *   refresh: () => Promise<void>
 * }} Данные, параметры и методы управления пагинацией.
 */
export function usePaginatedList<T>(
	loader: (params: PaginationParams) => Promise<PaginatedResult<T>>,
	initial: PaginationParams = { limit: 100, offset: 0 }
) {
	const items = ref<T[]>([]);
	const total = ref(0);
	const params = ref<PaginationParams>({ ...initial });
	const asyncState = useAsyncState();

	/**
	 * @description Перезагружает текущую страницу по актуальным параметрам.
	 * @returns {Promise<void>}
	 */
	const refresh = async (): Promise<void> => {
		await asyncState.run(async () => {
			const result = await loader(params.value);
			items.value = result.items;
			total.value = result.total;
		});
	};

	return {
		items,
		total,
		params,
		isLoading: asyncState.isLoading,
		refresh,
	};
}
