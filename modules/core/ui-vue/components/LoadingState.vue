<script setup lang="ts">
/**
 * @description Универсальное состояние загрузки для списков/секций.
 */
defineProps<{
	text?: string;
}>();
</script>

<template>
	<div class="text-xs text-[var(--text-muted)]" v-text="text || 'Загрузка…'"></div>
</template>
