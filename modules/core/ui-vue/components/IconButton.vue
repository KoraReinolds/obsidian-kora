<script setup lang="ts">
/**
 * @description Квадратная кнопка с иконкой (Lucide через host) и подписью для a11y.
 */
import UiHostIcon from './UiHostIcon.vue';

withDefaults(
	defineProps<{
		icon: string;
		/** Краткая подпись для скринридеров и aria. */
		label: string;
		title?: string;
		disabled?: boolean;
		/** Визуальный акцент: primary CTA, вторичная, опасное действие. */
		variant?: 'accent' | 'muted' | 'danger';
		/** Показать иконку загрузки вместо `icon`. */
		loading?: boolean;
		/** Компактный размер для плотных списков. */
		size?: 'sm' | 'md';
	}>(),
	{ variant: 'muted', loading: false, size: 'md' }
);
</script>

<template>
	<button
		type="button"
		class="inline-flex shrink-0 items-center justify-center rounded-lg border border-solid transition-colors disabled:cursor-not-allowed disabled:opacity-40"
		:class="[
			size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
			{
				'mod-cta border-transparent': variant === 'accent',
				'border-[var(--background-modifier-border)] bg-[var(--background-primary)] text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)]':
					variant === 'muted',
				'border-[var(--background-modifier-border)] bg-[var(--background-primary)] text-[var(--text-muted)] hover:border-[var(--text-error)] hover:text-[var(--text-error)]':
					variant === 'danger',
			},
		]"
		:disabled="disabled || loading"
		:title="title || label"
		:aria-label="label"
		:aria-busy="loading ? 'true' : undefined"
	>
		<UiHostIcon
			:name="loading ? 'loader-2' : icon"
			:label="label"
			:icon-class="
				[
					size === 'sm'
						? 'h-3.5 w-3.5 [&>svg]:h-3.5 [&>svg]:w-3.5'
						: 'h-4 w-4 [&>svg]:h-4 [&>svg]:w-4',
					loading ? '[&>svg]:animate-spin' : '',
				].join(' ')
			"
		/>
	</button>
</template>
