<script setup lang="ts">
/**
 * @description Вторая зона строки ленты: компактный инспектор turn trace (prompt, raw, parsed).
 * Не вызывает API — только отображает переданный снимок и эмитит переключение раскрытия.
 */
import type { ChatTimelineEternalInspectorPayload } from '../types/chat-timeline';
import SummaryChip from './SummaryChip.vue';

const props = defineProps<{
	payload: ChatTimelineEternalInspectorPayload;
}>();

const emit = defineEmits<{
	(event: 'toggle', traceId: string): void;
}>();

const onToggle = (): void => {
	emit('toggle', props.payload.traceId);
};
</script>

<template>
	<div
		class="rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)]/50"
	>
		<button
			type="button"
			class="flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--background-modifier-hover)]"
			@click="onToggle"
		>
			<div class="min-w-0 flex flex-wrap items-center gap-2">
				<span
					class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					v-text="'Runtime'"
				/>
				<SummaryChip :text="payload.model" />
				<SummaryChip :text="`Status: ${payload.status}`" />
			</div>
			<span
				class="shrink-0 text-[11px] text-[var(--text-muted)]"
				v-text="payload.expanded ? 'Свернуть' : 'Развернуть'"
			/>
		</button>
		<div
			v-if="payload.expanded"
			class="border-t border-solid border-[var(--background-modifier-border)] px-3 pb-3 pt-2"
		>
			<div
				v-if="payload.errorText"
				class="mb-2 rounded-xl border border-solid border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-[var(--text-normal)]"
				v-text="payload.errorText"
			/>
			<div class="mb-2 flex flex-wrap gap-2">
				<SummaryChip :text="`Input: ${payload.inputText.length} симв.`" />
				<SummaryChip :text="`Prompt: ${payload.promptText.length} симв.`" />
				<SummaryChip :text="`Raw: ${payload.rawResponse.length} симв.`" />
			</div>
			<div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
				<div class="min-w-0">
					<div class="mb-1 text-xs font-semibold text-[var(--text-muted)]">
						Prompt
					</div>
					<pre
						class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
						v-text="payload.promptText"
					/>
				</div>
				<div class="min-w-0">
					<div class="mb-1 text-xs font-semibold text-[var(--text-muted)]">
						Raw Response
					</div>
					<pre
						class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
						v-text="payload.rawResponse"
					/>
				</div>
				<div v-if="payload.parsedResponsePretty" class="min-w-0">
					<div class="mb-1 text-xs font-semibold text-[var(--text-muted)]">
						Parsed Response
					</div>
					<pre
						class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
						v-text="payload.parsedResponsePretty"
					/>
				</div>
				<div class="min-w-0">
					<div class="mb-1 text-xs font-semibold text-[var(--text-muted)]">
						Recalled Artifacts
					</div>
					<pre
						class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
						v-text="payload.recalledArtifactsPretty"
					/>
				</div>
				<div class="min-w-0 xl:col-span-2">
					<div class="mb-1 text-xs font-semibold text-[var(--text-muted)]">
						Prompt Fragments
					</div>
					<pre
						class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
						v-text="payload.promptFragmentsPretty"
					/>
				</div>
				<div
					v-if="payload.timingsPretty && payload.timingsPretty !== '{}'"
					class="min-w-0 xl:col-span-2"
				>
					<div class="mb-1 text-xs font-semibold text-[var(--text-muted)]">
						Timings (ms)
					</div>
					<pre
						class="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
						v-text="payload.timingsPretty"
					/>
				</div>
			</div>
		</div>
	</div>
</template>
