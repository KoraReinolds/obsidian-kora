/**
 * @module core/ui-vue/composables/use-selection
 *
 * @description Обобщённый composable для хранения и изменения выбранного элемента.
 */

import { ref } from 'vue';

/**
 * @description Создает реактивный selection state.
 * @template T
 * @param {T | null} initial - Начальное выбранное значение.
 * @returns {{
 *   selected: import('vue').Ref<T | null>,
 *   select: (next: T | null) => void
 * }} Текущее выбранное значение и метод его обновления.
 */
export function useSelection<T>(initial: T | null = null) {
	const selected = ref<T | null>(initial);

	/**
	 * @description Устанавливает новое выбранное значение.
	 * @param {T | null} next - Новое выбранное значение.
	 * @returns {void}
	 */
	const select = (next: T | null): void => {
		selected.value = next;
	};

	return {
		selected,
		select,
	};
}
