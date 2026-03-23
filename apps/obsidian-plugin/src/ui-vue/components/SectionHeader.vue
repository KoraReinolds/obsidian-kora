<script setup lang="ts">
/**
 * @description Универсальный заголовок секции с опциональной правой зоной actions.
 */
defineProps<{
	title: string;
	subtitle?: string;
}>();
</script>

<template>
	<div
		class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-solid border-[var(--background-modifier-border)] pb-2"
	>
		<div class="min-w-0">
			<div class="text-sm font-semibold leading-tight" v-text="title" />
			<div
				v-if="subtitle"
				class="mt-0.5 text-xs text-[var(--text-muted)]"
				v-text="subtitle"
			/>
		</div>
		<div v-if="$slots.actions" class="shrink-0">
			<slot name="actions" />
		</div>
	</div>
</template>
