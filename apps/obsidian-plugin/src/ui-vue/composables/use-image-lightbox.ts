import { ref, type Ref } from 'vue';

/**
 * @description Состояние URL для компонента ImageLightbox: открытие/закрытие.
 * Escape обрабатывает сам lightbox на время монтирования.
 * @returns {{ src: Ref<string | null>, open: Function, close: Function }}
 */
export function useImageLightbox(): {
	src: Ref<string | null>;
	open: (url?: string | null) => void;
	close: () => void;
} {
	const src = ref<string | null>(null);

	const open = (url?: string | null): void => {
		if (!url) {
			return;
		}
		src.value = url;
	};

	const close = (): void => {
		src.value = null;
	};

	return { src, open, close };
}
