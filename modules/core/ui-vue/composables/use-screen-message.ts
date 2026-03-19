/**
 * @module core/ui-vue/composables/use-screen-message
 *
 * @description Единый composable для управления экранным сообщением
 * с типизированным статусом (neutral/success/error).
 */

import { ref } from 'vue';
import type {
	ScreenMessage,
	TScreenMessageKind,
} from '../types/view-contracts';

/**
 * @description Предоставляет состояние и методы для работы с экранным сообщением.
 * @returns {{
 *   message: import('vue').Ref<ScreenMessage | null>,
 *   setMessage: (kind: TScreenMessageKind, text: string) => void,
 *   clearMessage: () => void
 * }} Refs и функции управления сообщением.
 */
export function useScreenMessage() {
	const message = ref<ScreenMessage | null>(null);

	/**
	 * @description Устанавливает новое сообщение заданного типа.
	 * @param {TScreenMessageKind} kind - Тип сообщения для UI.
	 * @param {string} text - Текст сообщения.
	 * @returns {void}
	 */
	const setMessage = (kind: TScreenMessageKind, text: string): void => {
		message.value = { kind, text };
	};

	/**
	 * @description Очищает текущее сообщение.
	 * @returns {void}
	 */
	const clearMessage = (): void => {
		message.value = null;
	};

	return {
		message,
		setMessage,
		clearMessage,
	};
}
