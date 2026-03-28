<script setup lang="ts">
import { inject } from 'vue';
import IconButton from './IconButton.vue';
import { HOST_IMAGE_CONTEXT_MENU } from '../injection-keys';

/**
 * @description Миниатюра вложения: превью картинки/видео или пустая плитка.
 * При {@code emptyPickable} клик по пустому состоянию эмитит {@code pick} (выбор файла снаружи).
 * При {@code clearable} и непустом {@code src} — кнопка сброса справа сверху, {@code clear}.
 * По ПКМ на картинке — host-меню ({@link HOST_IMAGE_CONTEXT_MENU}), если provide задан.
 */
const props = withDefaults(
	defineProps<{
		src?: string | null;
		isImage?: boolean;
		isVideo?: boolean;
		zoomable?: boolean;
		/** Клик по пустой плитке (без src) — для открытия диалога выбора файла. */
		emptyPickable?: boolean;
		/** Показать кнопку удаления превью (только если есть src). */
		clearable?: boolean;
		/** Подсказка имени при «Сохранить в хранилище» из контекстного меню. */
		contextMenuSuggestedName?: string | null;
	}>(),
	{
		src: null,
		isImage: true,
		isVideo: false,
		zoomable: false,
		emptyPickable: false,
		clearable: false,
		contextMenuSuggestedName: null,
	}
);

const emit = defineEmits<{
	(
		event: 'open',
		src: string,
		meta?: { suggestedFileName?: string | null }
	): void;
	(event: 'pick'): void;
	(event: 'clear'): void;
}>();

const hostImageContextMenu = inject(HOST_IMAGE_CONTEXT_MENU, undefined);

const handleOpen = (): void => {
	if (!props.src) {
		return;
	}
	emit('open', props.src, {
		suggestedFileName: props.contextMenuSuggestedName,
	});
};

/**
 * @description ПКМ: нативное меню host (Obsidian) или стандартное меню браузера.
 * @param {MouseEvent} event - {@code contextmenu}.
 * @returns {void}
 */
const onImageContextMenu = (event: MouseEvent): void => {
	if (!props.src || !props.isImage || !hostImageContextMenu) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	hostImageContextMenu(event, props.src, {
		suggestedFileName: props.contextMenuSuggestedName ?? undefined,
	});
};

const handleRootClick = (): void => {
	if (!props.src && props.emptyPickable) {
		emit('pick');
	}
};
</script>

<template>
	<div
		class="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-solid border-[rgba(255,255,255,0.1)] bg-black/20"
		:class="
			!src && emptyPickable
				? 'cursor-pointer hover:ring-1 hover:ring-[var(--interactive-accent)]/40'
				: ''
		"
		:role="!src && emptyPickable ? 'button' : undefined"
		:tabindex="!src && emptyPickable ? 0 : undefined"
		@keydown.enter.prevent="handleRootClick"
		@keydown.space.prevent="handleRootClick"
		@click="handleRootClick"
	>
		<img
			v-if="isImage && src"
			:src="src"
			alt=""
			class="h-full w-full object-cover"
			:class="zoomable ? 'cursor-zoom-in' : ''"
			@click.stop="zoomable ? handleOpen() : undefined"
			@contextmenu="onImageContextMenu"
		/>
		<video
			v-else-if="isVideo && src"
			:src="src"
			class="h-full w-full object-cover"
			controls
			playsinline
		/>
		<div
			v-else-if="!src"
			class="flex h-full w-full items-center justify-center text-[10px] leading-tight text-[var(--text-muted)]"
			v-text="'Нет файла'"
		/>
		<IconButton
			v-if="clearable && src"
			class="!absolute right-0.5 top-0.5 z-[1]"
			size="sm"
			variant="muted"
			icon="x"
			label="Убрать превью"
			title="Убрать превью"
			@click.stop="emit('clear')"
		/>
	</div>
</template>
