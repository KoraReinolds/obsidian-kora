<script setup lang="ts">
/**
 * @description Универсальное состояние загрузки для списков/секций.
 */
defineProps<{
	text?: string;
	inline?: boolean;
}>();
</script>

<template>
	<div
		:class="[
			inline
				? 'text-xs text-[var(--text-muted)]'
				: 'rounded-lg border border-dashed border-[var(--background-modifier-border)] p-2.5 text-xs text-[var(--text-muted)]',
		]"
		v-text="text || 'Загрузка…'"
	></div>
</template>
