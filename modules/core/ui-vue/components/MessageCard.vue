<script setup lang="ts">
/**
 * @description Базовая карточка сообщения с мета-информацией и телом.
 */
defineProps<{
	meta: string;
	body: string;
}>();
</script>

<template>
	<article
		class="rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] p-2.5"
	>
		<div class="mb-1.5 text-xs text-[var(--text-muted)]">{{ meta }}</div>
		<div class="whitespace-pre-wrap">{{ body }}</div>
	</article>
</template>
