<script setup lang="ts">
/**
 * @description Универсальная левая панель со списком сущностей.
 */
</script>

<template>
	<section
		class="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden rounded-[10px] border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-3"
	>
		<slot />
	</section>
</template>
