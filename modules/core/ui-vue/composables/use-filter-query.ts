/**
 * @module core/ui-vue/composables/use-filter-query
 *
 * @description Generic composable для фильтрации коллекций по
 * строковому поисковому запросу.
 */

import { computed, ref } from 'vue';

/**
 * @description Создает реактивный фильтр по строке поиска.
 * @template T
 * @param {import('vue').Ref<T[]>} source - Исходный список элементов.
 * @param {(item: T) => string} projector - Преобразователь элемента в строку поиска.
 * @returns {{
 *   query: import('vue').Ref<string>,
 *   filtered: import('vue').ComputedRef<T[]>
 * }} Query и вычисленный отфильтрованный массив.
 */
export function useFilterQuery<T>(
	source: { value: T[] },
	projector: (item: T) => string
) {
	const query = ref('');

	const filtered = computed(() => {
		const normalizedQuery = query.value.trim().toLowerCase();
		if (!normalizedQuery) {
			return source.value;
		}

		return source.value.filter(item =>
			projector(item).toLowerCase().includes(normalizedQuery)
		);
	});

	return {
		query,
		filtered,
	};
}
