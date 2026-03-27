<script setup lang="ts">
/**
 * @description Полноэкранный просмотр изображения поверх интерфейса (Teleport в body).
 */
import { onBeforeUnmount, onMounted } from 'vue';

defineProps<{
	/** URL изображения (родитель монтирует компонент только при непустом URL). */
	imageUrl: string;
}>();

const emit = defineEmits<{
	close: [];
}>();

/**
 * @description Закрытие по Escape без всплытия к остальному UI.
 * @param {KeyboardEvent} event - Событие клавиатуры.
 * @returns {void}
 */
const onEscape = (event: KeyboardEvent): void => {
	if (event.key === 'Escape') {
		emit('close');
	}
};

onMounted(() => {
	window.addEventListener('keydown', onEscape);
});

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onEscape);
});
</script>

<template>
	<Teleport to="body">
		<div
			class="fixed inset-0 z-[99999] flex h-screen w-screen items-center justify-center bg-black/85 p-4"
			@click="emit('close')"
		>
			<button
				type="button"
				class="absolute right-4 top-4 rounded-full border border-solid border-white/25 bg-black/30 px-3 py-1 text-sm text-white"
				@click.stop="emit('close')"
			>
				Close
			</button>
			<img
				:src="imageUrl"
				alt=""
				class="max-h-[96vh] max-w-[96vw] object-contain"
				@click.stop
			/>
		</div>
	</Teleport>
</template>
