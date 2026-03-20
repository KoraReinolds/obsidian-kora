<script setup lang="ts">
/**
 * @description Универсальная карточка контента: заголовок/мета/тело/слоты действий.
 */
withDefaults(
	defineProps<{
		title?: string;
		subtitle?: string;
		meta?: string;
		body?: string;
		/**
		 * @description Режим строки внутри общей рамки списка: разделители между сообщениями без отдельной обводки каждой карточки.
		 */
		stacked?: boolean;
		selected?: boolean;
		clickable?: boolean;
		hoverable?: boolean;
		compact?: boolean;
	}>(),
	{
		title: '',
		subtitle: '',
		meta: '',
		body: '',
		stacked: false,
		selected: false,
		clickable: false,
		hoverable: true,
		compact: false,
	}
);
</script>

<template>
	<article
		:class="[
			stacked
				? 'border-0 border-b border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2.5 py-2.5 last:border-b-0'
				: 'rounded-lg border border-solid bg-[var(--background-primary)] p-2.5',
			stacked
				? ''
				: selected
					? 'border-[var(--interactive-accent)] ring-1 ring-[var(--interactive-accent)]/25'
					: 'border-[var(--background-modifier-border)]',
			clickable ? 'cursor-pointer' : '',
			hoverable
				? 'transition-[border-color,background-color,box-shadow] hover:bg-[var(--background-modifier-hover)]'
				: '',
		]"
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0 flex-1">
				<div
					v-if="title || $slots.title"
					class="text-sm font-semibold leading-tight"
				>
					<slot name="title">{{ title }}</slot>
				</div>
				<div
					v-if="subtitle || $slots.subtitle"
					:class="[
						compact ? 'mt-0 text-[11px]' : 'mt-0.5 text-xs',
						'text-[var(--text-muted)]',
					]"
				>
					<slot name="subtitle">{{ subtitle }}</slot>
				</div>
				<div
					v-if="meta || $slots.meta"
					:class="[
						compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs',
						'text-[var(--text-muted)]',
					]"
				>
					<slot name="meta">{{ meta }}</slot>
				</div>
				<div
					v-if="$slots.badges"
					:class="[
						compact
							? 'mt-1 flex flex-wrap items-center gap-1'
							: 'mt-1.5 flex flex-wrap items-center gap-1.5',
					]"
				>
					<slot name="badges" />
				</div>
			</div>
			<div v-if="$slots.actions" class="shrink-0">
				<slot name="actions" />
			</div>
		</div>
		<div
			v-if="body || $slots.body"
			:class="[
				compact
					? 'mt-1.5 whitespace-pre-wrap text-[13px] leading-snug text-[var(--text-normal)]'
					: 'mt-2 whitespace-pre-wrap text-[var(--text-normal)]',
			]"
		>
			<slot name="body">{{ body }}</slot>
		</div>
		<div v-if="$slots.footer" class="mt-2">
			<slot name="footer" />
		</div>
	</article>
</template>
