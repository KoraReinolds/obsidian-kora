<script setup lang="ts">
/**
 * @description Компактный чип для вывода статистики и метаданных.
 */

defineProps<{
	text: string;
}>();
</script>

<template>
	<div
		class="shrink-0 rounded-full border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2 py-1 text-xs font-medium leading-tight text-[var(--text-muted)]"
		v-text="text"
	></div>
</template>
