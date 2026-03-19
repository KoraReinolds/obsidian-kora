/**
 * @module core/ui-vue/composables/use-async-state
 *
 * @description Generic helper для отслеживания состояния асинхронных операций
 * и сохранения последней ошибки.
 */

import { ref } from 'vue';

/**
 * @description Создает реактивное состояние async операции.
 * @returns {{
 *   isLoading: import('vue').Ref<boolean>,
 *   error: import('vue').Ref<string | null>,
 *   run: <T>(work: () => Promise<T>) => Promise<T>
 * }} Флаги загрузки, ошибка и обертка для выполнения операции.
 */
export function useAsyncState() {
	const isLoading = ref(false);
	const error = ref<string | null>(null);

	/**
	 * @description Выполняет async работу с обновлением loading/error флагов.
	 * @template T
	 * @param {() => Promise<T>} work - Асинхронная функция.
	 * @returns {Promise<T>} Результат исходной функции.
	 */
	const run = async <T>(work: () => Promise<T>): Promise<T> => {
		isLoading.value = true;
		error.value = null;
		try {
			return await work();
		} catch (caughtError) {
			error.value = (caughtError as Error).message;
			throw caughtError;
		} finally {
			isLoading.value = false;
		}
	};

	return {
		isLoading,
		error,
		run,
	};
}
