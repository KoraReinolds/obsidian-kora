<script setup lang="ts">
/**
 * @description Унифицированная панель: рамка, слоты header/toolbar/footer и основная область
 * с предсказуемым flex и прокруткой. Заменяет прежние отдельные панели списка и деталей.
 */
withDefaults(
	defineProps<{
		padding?: 'none' | 'sm' | 'md';
		gap?: 'none' | 'sm' | 'md';
		scroll?: boolean;
	}>(),
	{
		padding: 'md',
		gap: 'md',
		scroll: false,
	}
);
</script>

<template>
	<section
		class="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)]"
		:class="[
			padding === 'none' ? 'p-0' : '',
			padding === 'sm' ? 'p-2' : '',
			padding === 'md' ? 'p-3' : '',
			gap === 'none' ? 'gap-0' : '',
			gap === 'sm' ? 'gap-2.5' : '',
			gap === 'md' ? 'gap-3' : '',
		]"
	>
		<header v-if="$slots.header" class="shrink-0">
			<slot name="header" />
		</header>
		<div v-if="$slots.toolbar" class="shrink-0">
			<slot name="toolbar" />
		</div>
		<div
			:class="['min-h-0 flex-1', scroll ? 'overflow-auto' : 'overflow-hidden']"
		>
			<slot />
		</div>
		<footer v-if="$slots.footer" class="shrink-0">
			<slot name="footer" />
		</footer>
	</section>
</template>
