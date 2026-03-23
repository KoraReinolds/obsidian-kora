<script setup lang="ts">
/**
 * @description Рендер Lucide-иконки через API Obsidian (`setIcon`). Только для host Obsidian.
 */
import { onMounted, ref, watch } from 'vue';
import { setIcon } from 'obsidian';

const props = withDefaults(
	defineProps<{
		/** Имя иконки в наборе Obsidian (Lucide). */
		name: string;
		/** Подпись для a11y; если не задана, декоративная иконка. */
		label?: string;
	}>(),
	{}
);

const root = ref<HTMLElement | null>(null);

/**
 * @description Вставляет SVG через `setIcon` и обновляет aria.
 * @returns {void}
 */
const paint = (): void => {
	const el = root.value;
	if (!el) {
		return;
	}
	setIcon(el, props.name);
	if (props.label) {
		el.setAttribute('aria-label', props.label);
		el.setAttribute('role', 'img');
	} else {
		el.removeAttribute('aria-label');
		el.setAttribute('aria-hidden', 'true');
	}
};

onMounted(paint);
watch(() => [props.name, props.label] as const, paint);
</script>

<template>
	<span
		ref="root"
		class="inline-flex items-center justify-center leading-none [&>svg]:block [&>svg]:shrink-0"
	/>
</template>
