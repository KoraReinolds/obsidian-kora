<script setup lang="ts">
/**
 * @description Универсальный баннер статусного сообщения.
 * По умолчанию показывает кнопку закрытия; передайте `:dismissible="false"`, чтобы скрыть.
 */

import { computed } from 'vue';
import type { TScreenMessageKind } from '../types/view-contracts';

const props = withDefaults(
	defineProps<{
		kind: TScreenMessageKind;
		text: string;
		title?: string;
		dismissible?: boolean;
	}>(),
	{
		dismissible: true,
	}
);

const emit = defineEmits<{
	dismiss: [];
}>();

const background = computed(() => {
	if (props.kind === 'success') {
		return 'color-mix(in srgb, var(--color-green) 16%, var(--background-secondary))';
	}
	if (props.kind === 'error') {
		return 'color-mix(in srgb, var(--color-red) 16%, var(--background-secondary))';
	}
	if (props.kind === 'warning') {
		return 'color-mix(in srgb, var(--color-orange) 16%, var(--background-secondary))';
	}
	if (props.kind === 'info') {
		return 'color-mix(in srgb, var(--interactive-accent) 12%, var(--background-secondary))';
	}
	return 'var(--background-secondary)';
});
</script>

<template>
	<div
		class="rounded-lg border border-solid border-[var(--background-modifier-border)] px-3 py-2.5"
		:style="{ background }"
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0 flex-1">
				<div v-if="title" class="mb-0.5 text-xs font-semibold" v-text="title" />
				<div v-text="text" />
				<slot />
			</div>
			<button
				v-if="dismissible"
				type="button"
				class="h-6 w-6 shrink-0 rounded border border-solid border-[var(--background-modifier-border)] text-xs leading-none text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)]"
				aria-label="Скрыть сообщение"
				title="Скрыть"
				@click="emit('dismiss')"
				v-text="'×'"
			/>
		</div>
		<div v-if="$slots.actions" class="mt-2 flex flex-wrap items-center gap-2">
			<slot name="actions" />
		</div>
	</div>
</template>
