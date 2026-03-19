<script setup lang="ts">
/**
 * @description Универсальный баннер статусного сообщения.
 */

import { computed } from 'vue';
import type { TScreenMessageKind } from '../types/view-contracts';

const props = defineProps<{
	kind: TScreenMessageKind;
	text: string;
}>();

const background = computed(() => {
	if (props.kind === 'success') {
		return 'color-mix(in srgb, var(--color-green) 16%, var(--background-secondary))';
	}
	if (props.kind === 'error') {
		return 'color-mix(in srgb, var(--color-red) 16%, var(--background-secondary))';
	}
	return 'var(--background-secondary)';
});
</script>

<template>
	<div
		class="rounded-lg border border-solid border-[var(--background-modifier-border)] px-3 py-2.5"
		:style="{ background }"
		v-text="text"
	></div>
</template>
