<script setup lang="ts">
import IconButton from './IconButton.vue';

/**
 * @description Миниатюра вложения: превью картинки/видео или пустая плитка.
 * При {@code emptyPickable} клик по пустому состоянию эмитит {@code pick} (выбор файла снаружи).
 * При {@code clearable} и непустом {@code src} — кнопка сброса справа сверху, {@code clear}.
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
	}>(),
	{
		src: null,
		isImage: true,
		isVideo: false,
		zoomable: false,
		emptyPickable: false,
		clearable: false,
	}
);

const emit = defineEmits<{
	(event: 'open', src: string): void;
	(event: 'pick'): void;
	(event: 'clear'): void;
}>();

const handleOpen = (): void => {
	if (!props.src) {
		return;
	}
	emit('open', props.src);
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
