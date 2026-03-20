<script setup lang="ts">
/**
 * @description Reusable empty state блок с muted-текстом.
 */
defineProps<{
	title?: string;
	text: string;
	compact?: boolean;
}>();
</script>

<template>
	<div
		class="rounded-lg border border-dashed border-[var(--background-modifier-border)] text-[var(--text-muted)]"
		:class="[compact ? 'p-2 text-xs' : 'p-2.5']"
	>
		<div
			v-if="title"
			class="mb-1 text-xs font-semibold uppercase tracking-wide"
			v-text="title"
		/>
		<div v-text="text" />
		<div v-if="$slots.actions" class="mt-2 flex flex-wrap items-center gap-2">
			<slot name="actions" />
		</div>
	</div>
</template>
