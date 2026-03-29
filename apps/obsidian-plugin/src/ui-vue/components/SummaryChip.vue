<script setup lang="ts">
/**
 * @description Компактный чип для статистики, метаданных и переключателей (фильтры, видимость колонок).
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
		/**
		 * @description Режим переключателя: `role="button"`, `aria-pressed`, Enter/Space, emit `click`.
		 */
		toggle?: boolean;
		/**
		 * @description Состояние «включено» для `toggle` (видимость колонки и т.п.).
		 */
		pressed?: boolean;
		/**
		 * @description Обрезка длинной подписи с полным текстом в `title`.
		 */
		truncateLabel?: boolean;
		/**
		 * @description Моноширинный текст (имена колонок SQL и т.п.).
		 */
		mono?: boolean;
	}>(),
	{
		variant: 'neutral',
		size: 'sm',
		outlined: false,
		interactive: false,
		icon: '',
		toggle: false,
		pressed: false,
		truncateLabel: false,
		mono: false,
	}
);

const emit = defineEmits<{
	click: [event: MouseEvent | KeyboardEvent];
}>();

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

const isClickable = computed(() => props.toggle || props.interactive);

const toggleAttrs = computed(() =>
	props.toggle
		? {
				role: 'button' as const,
				tabindex: 0,
				'aria-pressed': props.pressed,
			}
		: {}
);

/**
 * @description Клавиатурная активация только для `toggle`.
 */
const onRootKeydown = (event: KeyboardEvent): void => {
	if (!props.toggle) {
		return;
	}
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		emit('click', event);
	}
};

/**
 * @description Клик по интерактивному или toggle-чипу.
 */
const onRootClick = (event: MouseEvent): void => {
	if (!isClickable.value) {
		return;
	}
	emit('click', event);
};
</script>

<template>
	<div
		v-bind="toggleAttrs"
		:class="[
			'inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border border-solid font-medium',
			mono ? 'font-mono' : '',
			isClickable ? 'cursor-pointer transition-colors hover:opacity-90' : '',
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
		@keydown="onRootKeydown"
		@click="onRootClick"
	>
		<UiHostIcon
			v-if="icon"
			:name="icon"
			:label="text"
			icon-class="!h-3 !w-3 [&>svg]:!h-3 [&>svg]:!w-3"
		/>
		<span
			:class="truncateLabel ? 'min-w-0 max-w-[14rem] truncate' : ''"
			:title="truncateLabel ? text : undefined"
			v-text="text"
		/>
	</div>
</template>
