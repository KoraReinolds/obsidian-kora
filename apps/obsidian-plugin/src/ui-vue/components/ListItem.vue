<script setup lang="ts">
/**
 * @description Канонический item для сущностных и навигационных списков.
 * Один и тот же каркас используется в sidebar, registry и result-списках;
 * различается только заполнение контентных зон.
 */
import { computed } from 'vue';

const props = withDefaults(
	defineProps<{
		title?: string;
		subtitle?: string;
		meta?: string;
		body?: string;
		selected?: boolean;
		clickable?: boolean;
		hoverable?: boolean;
		compact?: boolean;
		headerLayout?: 'row' | 'column';
	}>(),
	{
		title: '',
		subtitle: '',
		meta: '',
		body: '',
		selected: false,
		clickable: false,
		hoverable: true,
		compact: false,
		headerLayout: 'column',
	}
);

const rootAttrs = computed(() =>
	props.clickable
		? {
				role: 'button' as const,
				tabindex: 0,
			}
		: {}
);

const onRootKeydown = (event: KeyboardEvent): void => {
	if (!props.clickable) {
		return;
	}
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		(event.currentTarget as HTMLElement).click();
	}
};
</script>

<template>
	<article
		v-bind="rootAttrs"
		class="group"
		@keydown="onRootKeydown"
		:class="[
			'rounded-lg border border-solid bg-[var(--background-primary)] p-2.5',
			selected
				? 'border-[var(--interactive-accent)] ring-1 ring-[var(--interactive-accent)]/25 bg-[var(--interactive-accent)]/8'
				: 'border-[var(--background-modifier-border)]',
			clickable ? 'cursor-pointer' : '',
			hoverable
				? [
						'transition-[border-color,background-color,box-shadow]',
						selected
							? 'hover:bg-[var(--interactive-accent)]/12'
							: 'hover:bg-[var(--background-modifier-hover)]',
					].join(' ')
				: '',
		]"
	>
		<div
			class="flex gap-2"
			:class="
				props.headerLayout === 'row'
					? 'items-start justify-between'
					: 'flex-col'
			"
		>
			<div class="min-w-0 flex-1">
				<div
					v-show="title || $slots.title"
					class="text-sm font-semibold leading-tight text-[var(--text-normal)]"
				>
					<slot name="title">{{ title }}</slot>
				</div>
				<div
					v-show="subtitle || $slots.subtitle"
					:class="[
						compact ? 'mt-0 text-[11px]' : 'mt-0.5 text-xs',
						'text-[var(--text-muted)]',
					]"
				>
					<slot name="subtitle">{{ subtitle }}</slot>
				</div>
				<div
					v-show="meta || $slots.meta"
					:class="[
						compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs',
						'text-[var(--text-muted)]',
					]"
				>
					<slot name="meta">{{ meta }}</slot>
				</div>
				<div
					v-show="$slots.badges"
					:class="[
						compact
							? 'mt-1 flex flex-wrap items-center gap-1'
							: 'mt-1.5 flex flex-wrap items-center gap-1.5',
					]"
				>
					<slot name="badges" />
				</div>
			</div>
			<div
				v-show="$slots.actions"
				class="shrink-0"
				:class="props.headerLayout === 'row' ? '' : 'self-end'"
			>
				<slot name="actions" />
			</div>
		</div>
		<div
			v-show="body || $slots.body"
			:class="[
				compact
					? 'mt-1.5 whitespace-pre-wrap text-[13px] leading-snug text-[var(--text-normal)]'
					: 'mt-2 whitespace-pre-wrap text-[var(--text-normal)]',
			]"
		>
			<slot name="body">{{ body }}</slot>
		</div>
		<div
			v-show="$slots.footer"
			class="mt-2 border-t border-solid border-[var(--background-modifier-border)] pt-1.5 text-[10px] text-[var(--text-muted)]"
		>
			<slot name="footer" />
		</div>
	</article>
</template>
