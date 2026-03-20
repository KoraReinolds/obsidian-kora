<script setup lang="ts">
/**
 * @description Базовая карточка сообщения с мета-информацией и телом.
 */
withDefaults(
	defineProps<{
		meta: string;
		body: string;
		/**
		 * @description Режим строки внутри общей рамки списка: разделители между сообщениями без отдельной обводки каждой карточки.
		 */
		stacked?: boolean;
	}>(),
	{ stacked: false }
);
</script>

<template>
	<article
		:class="
			stacked
				? 'border-0 border-b border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2.5 py-2.5 last:border-b-0'
				: 'rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] p-2.5'
		"
	>
		<div class="mb-1.5 text-xs text-[var(--text-muted)]">{{ meta }}</div>
		<div class="whitespace-pre-wrap text-[var(--text-normal)]">{{ body }}</div>
	</article>
</template>
