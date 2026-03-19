<script setup lang="ts">
/**
 * @description Reusable empty state блок с muted-текстом.
 */
defineProps<{
	text: string;
}>();
</script>

<template>
	<div
		class="rounded-lg border border-dashed border-[var(--background-modifier-border)] p-2.5 text-[var(--text-muted)]"
		v-text="text"
	></div>
</template>
