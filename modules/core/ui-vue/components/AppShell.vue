<script setup lang="ts">
/**
 * @description Базовый shell-контейнер экрана: заголовок, toolbar и основной контент.
 */

defineProps<{
	title: string;
}>();
</script>

<template>
	<section
		class="flex h-full min-h-0 flex-col gap-3 overflow-hidden pb-2 text-[var(--ui-text)]"
	>
		<!-- Smoke-test: утилиты Tailwind (см. tailwind.css). Убрать после проверки. -->
		<div
			class="mb-1 inline-flex items-center gap-2 rounded-md border border-dashed border-[var(--background-modifier-border)] px-2 py-1 text-xs font-medium"
			aria-hidden="true"
		>
			<span>Tailwind smoke OK</span>
		</div>
		<h3 class="m-0">{{ title }}</h3>
		<div class="flex flex-wrap items-center gap-2">
			<slot name="toolbar" />
		</div>
		<div>
			<slot name="message" />
		</div>
		<div class="flex min-h-0 flex-1 overflow-hidden">
			<slot />
		</div>
	</section>
</template>
