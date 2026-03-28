import { ref, type Ref } from 'vue';

/**
 * @description Метаданные при открытии лайтбокса (имя файла для контекстного меню «Сохранить в хранилище»).
 */
export type ImageLightboxOpenMeta = {
	suggestedFileName?: string | null;
};

/**
 * @description Состояние URL для компонента ImageLightbox: открытие/закрытие.
 * Escape обрабатывает сам lightbox на время монтирования.
 * @returns {{ src, suggestedFileName, open, close }}
 */
export function useImageLightbox(): {
	src: Ref<string | null>;
	suggestedFileName: Ref<string | null>;
	open: (url?: string | null, meta?: ImageLightboxOpenMeta) => void;
	close: () => void;
} {
	const src = ref<string | null>(null);
	const suggestedFileName = ref<string | null>(null);

	const open = (url?: string | null, meta?: ImageLightboxOpenMeta): void => {
		if (!url) {
			return;
		}
		src.value = url;
		suggestedFileName.value = meta?.suggestedFileName ?? null;
	};

	const close = (): void => {
		src.value = null;
		suggestedFileName.value = null;
	};

	return { src, suggestedFileName, open, close };
}
