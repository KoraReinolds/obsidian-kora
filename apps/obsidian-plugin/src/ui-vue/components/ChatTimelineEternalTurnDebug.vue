<script setup lang="ts">
/**
 * @description Полный debug-render одного turn Eternal AI в виде pipeline:
 * sources -> prompt composition -> model output -> runtime extraction -> diagnostics.
 * Обычные bubble пользователя и ассистента намеренно не дублируются здесь:
 * их уже видно в conversation-mode, а debug должен объяснять сам runtime-пайплайн.
 */
import { computed } from 'vue';
import type { ChatTimelineEternalTracePayload } from '../types';
import MessageCard from './MessageCard.vue';
import SummaryChip from './SummaryChip.vue';

const props = defineProps<{
	turnId: string;
	turnStatus?: 'complete' | 'error' | 'pending' | null;
	trace?: ChatTimelineEternalTracePayload | null;
}>();

/**
 * @description Цветовая схема чипа статуса turn.
 * @returns {'success' | 'danger'}
 */
const statusVariant = computed(() =>
	props.trace?.status === 'error' ? 'danger' : 'success'
);

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
	const entries = Object.entries(props.trace?.timingsMs || {});
	if (!entries.length) {
		return '';
	}
	return entries.map(([key, value]) => `${key}: ${value} ms`).join(' · ');
});

/**
 * @description Есть ли у turn debug-trace. При false карточка остаётся полезной:
 * например для pending visual generation без prompt/raw/parser.
 * @returns {boolean}
 */
const hasTrace = computed(() => Boolean(props.trace));

/**
 * @description Turn всё ещё в ожидании ответа модели. Используем для явного
 * статуса «печатает» внутри debug-render, чтобы индикатор был заметен в ленте.
 * @returns {boolean}
 */
const isPendingTurn = computed(() => props.turnStatus === 'pending');

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
		props.trace.recalledArtifacts.length
			? `Artifacts: ${props.trace.recalledArtifacts.length}`
			: 'Artifacts: 0',
		props.trace.promptFragments.length
			? `Fragments: ${props.trace.promptFragments.length}`
			: 'Fragments: 0',
		props.trace.promptText ? `Prompt: ${props.trace.promptText.length}` : '',
		props.trace.rawResponse ? `Raw: ${props.trace.rawResponse.length}` : '',
	].filter(Boolean);
});

/**
 * @description Краткая подпись для блока sources. Показывает количество recall-
 * артефактов и не перегружает layout длинными JSON-данными.
 * @returns {string}
 */
const artifactsSummary = computed((): string => {
	const count = props.trace?.recalledArtifacts.length || 0;
	if (!count) {
		return 'Memory retrieval ничего не вернул.';
	}
	return count === 1
		? '1 artifact был использован при сборке prompt.'
		: `${count} artifacts были использованы при сборке prompt.`;
});

/**
 * @description Краткая подпись для compiled prompt: длина текста и число fragment-ов.
 * @returns {string}
 */
const promptSummary = computed((): string => {
	if (!props.trace) {
		return '';
	}
	const fragments = props.trace.promptFragments.length;
	return fragments
		? `${fragments} fragments участвуют в сборке prompt`
		: 'Фрагменты prompt не сохранены.';
});

/**
 * @description Есть ли у parser-а что-то реально дополнительное по сравнению с
 * обычным bubble: actions, memory candidates, environment patch или structured blocks.
 * @returns {boolean}
 */
const hasRuntimeExtraction = computed(() => {
	const extraction = props.trace?.runtimeExtraction;
	if (!extraction) {
		return false;
	}
	return Boolean(
		extraction.usedStructuredBlocks ||
		extraction.actions.length ||
		extraction.memoryCandidates.length ||
		extraction.environmentPatchPretty
	);
});

/**
 * @description Краткое описание runtime extraction без дублирования bubble-text.
 * @returns {string}
 */
const runtimeExtractionSummary = computed((): string => {
	const extraction = props.trace?.runtimeExtraction;
	if (!extraction) {
		return '';
	}
	const actionCount = extraction.actions.length;
	const memoryCount = extraction.memoryCandidates.length;
	return (
		[
			extraction.usedStructuredBlocks ? 'Structured blocks detected' : '',
			actionCount ? `actions: ${actionCount}` : '',
			memoryCount ? `memory candidates: ${memoryCount}` : '',
			extraction.environmentPatchPretty ? 'environment patch' : '',
		]
			.filter(Boolean)
			.join(' · ') || 'Дополнительных parser-артефактов нет.'
	);
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
					:variant="statusVariant"
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
			v-if="!hasTrace"
			class="rounded-xl border border-dashed border-[var(--background-modifier-border)] px-3 py-3 text-sm text-[var(--text-muted)]"
			v-text="
				isPendingTurn
					? 'Turn в ожидании ответа модели: trace появится после завершения генерации.'
					: 'Для этого turn trace пока нет: обычно это pending visual generation или старое сообщение без runtime-снимка.'
			"
		/>

		<div v-else class="flex min-w-0 flex-col gap-3">
			<MessageCard
				title="Sources"
				:subtitle="artifactsSummary"
				compact
				:hoverable="false"
			>
				<template #body>
					<div
						v-if="!trace?.recalledArtifacts.length"
						class="text-sm text-[var(--text-muted)]"
					>
						Artifact recall для этого turn пустой.
					</div>
					<div v-else class="flex flex-col gap-2">
						<MessageCard
							v-for="artifact in trace.recalledArtifacts"
							:key="artifact.id"
							:title="`${artifact.type} · ${artifact.context}`"
							:subtitle="artifact.text"
							:meta="`${artifact.sourceLabel} · ${artifact.scopeLabel}`"
							compact
							:hoverable="false"
						>
							<template #badges>
								<SummaryChip
									v-if="artifact.score !== null && artifact.score !== undefined"
									size="xs"
									variant="neutral"
									:text="`score: ${artifact.score}`"
								/>
							</template>
						</MessageCard>
					</div>
				</template>
			</MessageCard>

			<MessageCard
				title="Prompt Composition"
				:subtitle="promptSummary"
				compact
				:hoverable="false"
			>
				<template #body>
					<div v-if="trace?.promptFragments.length" class="flex flex-col gap-2">
						<MessageCard
							v-for="fragment in trace.promptFragments"
							:key="fragment.id"
							:title="`${fragment.layer} · ${fragment.source}`"
							:subtitle="fragment.text"
							:meta="`priority: ${fragment.priority}`"
							compact
							:hoverable="false"
						/>
					</div>
					<div v-else class="text-sm text-[var(--text-muted)]">
						Фрагменты prompt для этого turn не сохранены.
					</div>
				</template>
				<template #footer>
					<details
						v-if="trace?.promptText"
						class="kora-debug-disclosure rounded-xl border border-solid border-[var(--background-modifier-border)]"
					>
						<summary
							class="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
						>
							Показать assembled prompt
						</summary>
						<div
							class="border-t border-solid border-[var(--background-modifier-border)] px-3 py-3"
						>
							<div
								class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)]/55 px-3 py-2.5 text-sm leading-6 text-[var(--text-normal)] whitespace-pre-wrap break-words"
								v-text="trace.promptText"
							/>
						</div>
					</details>
				</template>
			</MessageCard>

			<MessageCard
				title="Model Output"
				:subtitle="
					trace?.rawResponse
						? `${trace.rawResponse.length} символов от модели`
						: 'Модель не вернула raw response.'
				"
				compact
				:hoverable="false"
			>
				<template #body>
					<details
						class="kora-debug-disclosure rounded-xl border border-solid border-[var(--background-modifier-border)]"
					>
						<summary
							class="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
						>
							Показать raw response
						</summary>
						<div
							class="border-t border-solid border-[var(--background-modifier-border)] px-3 py-3"
						>
							<div
								class="rounded-xl bg-[var(--background-secondary)]/55 px-3 py-2.5 text-sm leading-6 text-[var(--text-normal)] whitespace-pre-wrap break-words"
								v-text="trace?.rawResponse || 'Raw response отсутствует.'"
							/>
						</div>
					</details>
				</template>
			</MessageCard>

			<MessageCard
				v-if="hasRuntimeExtraction"
				title="Runtime Extraction"
				:subtitle="runtimeExtractionSummary"
				compact
				:hoverable="false"
			>
				<template #badges>
					<SummaryChip
						v-if="trace?.runtimeExtraction"
						size="xs"
						:variant="
							trace.runtimeExtraction.usedStructuredBlocks
								? 'accent'
								: 'neutral'
						"
						:text="
							trace.runtimeExtraction.usedStructuredBlocks
								? 'Structured blocks'
								: 'Plain text'
						"
					/>
				</template>
				<template #body>
					<div v-if="trace?.runtimeExtraction" class="flex flex-col gap-2.5">
						<div
							v-if="trace.runtimeExtraction.actions.length"
							class="flex flex-wrap gap-2"
						>
							<SummaryChip
								v-for="action in trace.runtimeExtraction.actions"
								:key="action"
								size="xs"
								variant="accent"
								:text="action"
							/>
						</div>

						<div
							v-if="trace.runtimeExtraction.memoryCandidates.length"
							class="rounded-xl border border-solid border-[var(--background-modifier-border)] px-3 py-2.5"
						>
							<div
								class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
								v-text="'Memory Candidates'"
							/>
							<div class="flex flex-col gap-1.5">
								<div
									v-for="candidate in trace.runtimeExtraction.memoryCandidates"
									:key="candidate"
									class="rounded-lg bg-[var(--background-secondary)]/55 px-2.5 py-2 text-sm text-[var(--text-normal)]"
									v-text="candidate"
								/>
							</div>
						</div>

						<details
							v-if="trace.runtimeExtraction.environmentPatchPretty"
							class="kora-debug-disclosure rounded-xl border border-solid border-[var(--background-modifier-border)]"
						>
							<summary
								class="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
							>
								Показать environment patch
							</summary>
							<div
								class="border-t border-solid border-[var(--background-modifier-border)] px-3 py-3"
							>
								<div
									class="rounded-xl bg-[var(--background-secondary)]/55 px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap break-words text-[var(--text-normal)]"
									v-text="trace.runtimeExtraction.environmentPatchPretty"
								/>
							</div>
						</details>
					</div>
				</template>
			</MessageCard>

			<MessageCard
				title="Diagnostics"
				:subtitle="timingSummary || 'Тайминги не сохранены.'"
				compact
				:hoverable="false"
			>
				<template #body>
					<div class="flex flex-wrap gap-2">
						<SummaryChip
							v-for="metric in traceMetrics"
							:key="metric"
							size="xs"
							variant="neutral"
							:text="metric"
						/>
					</div>
				</template>
				<template #footer>
					<details
						v-if="trace && Object.keys(trace.timingsMs).length"
						class="kora-debug-disclosure rounded-xl border border-solid border-[var(--background-modifier-border)]"
					>
						<summary
							class="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
						>
							Показать timings по этапам
						</summary>
						<div
							class="border-t border-solid border-[var(--background-modifier-border)] px-3 py-3"
						>
							<div class="flex flex-col gap-1.5">
								<div
									v-for="(value, key) in trace.timingsMs"
									:key="key"
									class="flex items-center justify-between gap-3 rounded-lg bg-[var(--background-secondary)]/55 px-2.5 py-2 text-sm text-[var(--text-normal)]"
								>
									<span class="text-[var(--text-muted)]" v-text="key" />
									<span class="font-medium" v-text="`${value} ms`" />
								</div>
							</div>
						</div>
					</details>
				</template>
			</MessageCard>
		</div>
	</div>
</template>

<style scoped>
.kora-debug-disclosure summary::-webkit-details-marker {
	display: none;
}
</style>
