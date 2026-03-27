<script setup lang="ts">
/**
 * @description Пустое или загрузочное состояние списка/секции в одном визуальном языке.
 */
withDefaults(
	defineProps<{
		variant: 'empty' | 'loading';
		/** Для `empty` — основной текст; для `loading` — подпись (по умолчанию «Загрузка…»). */
		text?: string;
		/** Только для `empty`. */
		title?: string;
		/** Только для `empty` — компактные отступы и текст. */
		compact?: boolean;
		/** Только для `loading` — строка без рамки, для встраивания в плотный UI. */
		inline?: boolean;
	}>(),
	{
		text: '',
		compact: false,
		inline: false,
	}
);
</script>

<template>
	<div
		v-if="variant === 'loading'"
		:class="[
			inline
				? 'text-xs text-[var(--text-muted)]'
				: 'rounded-lg border border-dashed border-[var(--background-modifier-border)] p-2.5 text-xs text-[var(--text-muted)]',
		]"
		v-text="text || 'Загрузка…'"
	/>
	<div
		v-else
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
