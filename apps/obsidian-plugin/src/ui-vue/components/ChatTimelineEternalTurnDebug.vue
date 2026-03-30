<script setup lang="ts">
/**
 * @description Полный debug-render одного turn Eternal AI. Показывает friendly
 * результат и все сохранённые trace-данные внутри одной карточки без отдельного
 * разделителя под bubble.
 */
import { computed } from 'vue';
import type {
	ChatTimelineEternalTracePayload,
	ChatTimelineMessageItem,
} from '../types';
import ChatMessageBubble from './ChatMessageBubble.vue';
import SummaryChip from './SummaryChip.vue';

const props = defineProps<{
	turnId: string;
	userMessage?: ChatTimelineMessageItem | null;
	assistantMessage?: ChatTimelineMessageItem | null;
	trace?: ChatTimelineEternalTracePayload | null;
}>();

const emit = defineEmits<{
	(event: 'jump', targetId: string): void;
	(event: 'delete', messageId: string): void;
}>();

/**
 * @description Короткий диапазон времени turn для header-карточки. Если trace нет,
 * возвращаем пустую строку и секция времени не рендерится.
 * @returns {string}
 */
const traceTimeRange = computed((): string => {
	if (!props.trace?.startedAt) {
		return '';
	}
	const started = new Date(props.trace.startedAt).toLocaleTimeString();
	if (!props.trace.finishedAt) {
		return started;
	}
	return `${started} - ${new Date(props.trace.finishedAt).toLocaleTimeString()}`;
});

/**
 * @description Лаконичная сводка по времени выполнения из trace.timings.
 * @returns {string}
 */
const timingSummary = computed((): string => {
	if (!props.trace?.timingsPretty || props.trace.timingsPretty === '{}') {
		return '';
	}
	try {
		const timings = JSON.parse(props.trace.timingsPretty) as Record<
			string,
			number
		>;
		return Object.entries(timings)
			.map(([key, value]) => `${key}: ${value} ms`)
			.join(' · ');
	} catch {
		return '';
	}
});

/**
 * @description Есть ли у turn debug-trace. При false карточка остаётся полезной:
 * например для pending visual generation без prompt/raw/parser.
 * @returns {boolean}
 */
const hasTrace = computed(() => Boolean(props.trace));

/**
 * @description Набор коротких числовых сводок по debug-полям. Пустые значения
 * пропускаем, чтобы header не выглядел шумным.
 * @returns {string[]}
 */
const traceMetrics = computed((): string[] => {
	if (!props.trace) {
		return [];
	}
	return [
		`Input: ${props.trace.inputText.length}`,
		`Prompt: ${props.trace.promptText.length}`,
		`Raw: ${props.trace.rawResponse.length}`,
		props.trace.parsedResponsePretty ? 'Parsed: yes' : '',
	].filter(Boolean);
});
</script>

<template>
	<div
		class="flex min-w-0 flex-col gap-3 rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)]/55 p-3"
	>
		<div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
			<div class="min-w-0 flex flex-wrap items-center gap-2">
				<SummaryChip size="xs" variant="neutral" text="Turn Debug" />
				<SummaryChip
					v-if="trace?.model"
					size="xs"
					variant="neutral"
					:text="trace.model"
				/>
				<SummaryChip
					v-if="trace?.status"
					size="xs"
					variant="neutral"
					:text="`Status: ${trace.status}`"
				/>
				<SummaryChip
					v-if="traceTimeRange"
					size="xs"
					variant="neutral"
					:text="traceTimeRange"
				/>
			</div>
			<div
				class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
				v-text="turnId"
			/>
		</div>

		<div v-if="traceMetrics.length" class="flex flex-wrap gap-2">
			<SummaryChip
				v-for="metric in traceMetrics"
				:key="metric"
				size="xs"
				variant="neutral"
				:text="metric"
			/>
		</div>

		<div
			v-if="trace?.errorText"
			class="rounded-xl border border-solid border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-[var(--text-normal)]"
			v-text="trace.errorText"
		/>

		<div
			v-if="userMessage || assistantMessage"
			class="grid grid-cols-1 gap-3 xl:grid-cols-2"
		>
			<div v-if="userMessage" class="min-w-0">
				<div
					class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					v-text="'Ввод пользователя'"
				/>
				<ChatMessageBubble
					:item="userMessage"
					@jump="emit('jump', $event)"
					@delete="emit('delete', $event)"
				/>
			</div>
			<div v-if="assistantMessage" class="min-w-0">
				<div
					class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					v-text="'Отображаемый ответ'"
				/>
				<ChatMessageBubble
					:item="assistantMessage"
					@jump="emit('jump', $event)"
					@delete="emit('delete', $event)"
				/>
			</div>
		</div>

		<div
			v-if="!hasTrace"
			class="rounded-xl border border-dashed border-[var(--background-modifier-border)] px-3 py-3 text-sm text-[var(--text-muted)]"
			v-text="
				'Для этого turn trace пока нет: обычно это pending visual generation или старое сообщение без runtime-снимка.'
			"
		/>

		<div v-else class="grid grid-cols-1 gap-3 xl:grid-cols-2">
			<div class="min-w-0">
				<div
					class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					v-text="'Raw Input'"
				/>
				<pre
					class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
					v-text="trace?.inputText || ''"
				/>
			</div>
			<div class="min-w-0">
				<div
					class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					v-text="'Assembled Prompt'"
				/>
				<pre
					class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
					v-text="trace?.promptText || ''"
				/>
			</div>
			<div class="min-w-0">
				<div
					class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					v-text="'Raw Response'"
				/>
				<pre
					class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
					v-text="trace?.rawResponse || ''"
				/>
			</div>
			<div v-if="trace?.parsedResponsePretty" class="min-w-0">
				<div
					class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					v-text="'Parsed Response'"
				/>
				<pre
					class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
					v-text="trace.parsedResponsePretty"
				/>
			</div>
			<div class="min-w-0">
				<div
					class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					v-text="'Recalled Artifacts'"
				/>
				<pre
					class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
					v-text="trace?.recalledArtifactsPretty || '[]'"
				/>
			</div>
			<div class="min-w-0">
				<div
					class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					v-text="'Prompt Fragments'"
				/>
				<pre
					class="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
					v-text="trace?.promptFragmentsPretty || '[]'"
				/>
				<div
					v-if="timingSummary"
					class="mt-2 text-xs text-[var(--text-muted)]"
					v-text="timingSummary"
				/>
			</div>
			<div
				v-if="trace?.timingsPretty && trace.timingsPretty !== '{}'"
				class="min-w-0 xl:col-span-2"
			>
				<div
					class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					v-text="'Timings JSON'"
				/>
				<pre
					class="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background-secondary)] p-3 text-[11px] leading-5 text-[var(--text-normal)]"
					v-text="trace.timingsPretty"
				/>
			</div>
		</div>
	</div>
</template>
