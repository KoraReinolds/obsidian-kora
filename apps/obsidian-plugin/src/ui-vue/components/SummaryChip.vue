<script setup lang="ts">
/**
 * @description Компактный чип для вывода статистики и метаданных.
 */

import UiHostIcon from './UiHostIcon.vue';
import { computed } from 'vue';

const props = withDefaults(
	defineProps<{
		text: string;
		variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
		size?: 'xs' | 'sm' | 'md';
		outlined?: boolean;
		icon?: string;
		interactive?: boolean;
	}>(),
	{
		variant: 'neutral',
		size: 'sm',
		outlined: false,
		interactive: false,
		icon: '',
	}
);

const sizeStyle = computed(() => {
	if (props.size === 'xs') {
		return {
			fontSize: '10.5px',
			lineHeight: '1.15',
			padding: '2px 7px',
			letterSpacing: '-0.01em',
			fontWeight: '600',
		};
	}
	if (props.size === 'md') {
		return {
			fontSize: '14px',
			lineHeight: '1.2',
			padding: '4px 10px',
		};
	}
	return {
		fontSize: '11px',
		lineHeight: '1.2',
		padding: '3px 8px',
	};
});
</script>

<template>
	<div
		class="inline-flex shrink-0 items-center gap-1 rounded-full border border-solid font-medium"
		:class="[
			interactive ? 'cursor-pointer transition-colors hover:opacity-90' : '',
			outlined ? 'bg-transparent' : '',
			{
				'border-[var(--background-modifier-border)] bg-[var(--background-primary)] text-[var(--text-muted)]':
					variant === 'neutral',
				'border-[var(--color-green,#22c55e)]/50 bg-[var(--color-green,#22c55e)]/15 text-[var(--color-green,#22c55e)]':
					variant === 'success',
				'border-[var(--color-orange,#f59e0b)]/50 bg-[var(--color-orange,#f59e0b)]/15 text-[var(--color-orange,#f59e0b)]':
					variant === 'warning',
				'border-[var(--color-red,#ef4444)]/50 bg-[var(--color-red,#ef4444)]/15 text-[var(--color-red,#ef4444)]':
					variant === 'danger',
				'border-[var(--interactive-accent)]/40 bg-[var(--interactive-accent)]/10 text-[var(--interactive-accent)]':
					variant === 'accent',
			},
		]"
		:style="sizeStyle"
	>
		<UiHostIcon
			v-if="icon"
			:name="icon"
			:label="text"
			icon-class="!h-3 !w-3 [&>svg]:!h-3 [&>svg]:!w-3"
		/>
		<span v-text="text" />
	</div>
</template>
