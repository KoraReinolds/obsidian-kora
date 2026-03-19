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
		class="rounded-full border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2 py-1 text-xs"
		v-text="text"
	></div>
</template>
