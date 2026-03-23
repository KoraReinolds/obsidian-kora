<script setup lang="ts">
/**
 * @description Иконка из host через `inject` {@link HOST_LUCIDE_ICON}; без host — нейтральный запасной маркер для VitePress/web.
 */
import { inject, type Component } from 'vue';
import { HOST_LUCIDE_ICON } from '../injection-keys';

const props = withDefaults(
	defineProps<{
		name: string;
		label?: string;
		/** Дополнительные классы для корня (например размер SVG). */
		iconClass?: string;
	}>(),
	{ iconClass: '' }
);

const HostIcon = inject<Component | undefined>(HOST_LUCIDE_ICON, undefined);
</script>

<template>
	<component
		v-if="HostIcon"
		:is="HostIcon"
		:name="name"
		:label="label"
		:class="['shrink-0', iconClass]"
	/>
	<span
		v-else
		class="inline-block h-4 w-4 shrink-0 rounded-sm bg-[var(--background-modifier-border)] opacity-50"
		:aria-label="label"
		role="img"
	/>
</template>
