<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
	ChatTimelineEternalArtifactEntry,
	ChatTimelineEternalPromptFragmentEntry,
	ChatTimelineEternalTracePayload,
} from '../types';
import MessageCard from './MessageCard.vue';
import SummaryChip from './SummaryChip.vue';

const props = defineProps<{
	turnId: string;
	turnStatus?: 'complete' | 'error' | 'pending' | null;
	trace?: ChatTimelineEternalTracePayload | null;
}>();

type ChipVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
type DebugSectionKey =
	| 'sources'
	| 'prompt'
	| 'model-output'
	| 'runtime'
	| 'diagnostics';

const openSection = ref<DebugSectionKey | null>(null);
const openSourceArtifactId = ref<string | null>(null);
const openPromptFragmentId = ref<string | null>(null);

const statusVariant = computed<ChipVariant>(() =>
	props.trace?.status === 'error' ? 'danger' : 'success'
);

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

const timingSummary = computed((): string => {
	const entries = Object.entries(props.trace?.timingsMs || {});
	if (!entries.length) {
		return '';
	}
	return entries.map(([key, value]) => `${key}: ${value} ms`).join(' · ');
});

const hasTrace = computed(() => Boolean(props.trace));
const isPendingTurn = computed(() => props.turnStatus === 'pending');

const traceMetrics = computed((): string[] => {
	if (!props.trace) {
		return [];
	}
	return [
		`Artifacts: ${props.trace.recalledArtifacts.length}`,
		`Fragments: ${props.trace.promptFragments.length}`,
		props.trace.promptText ? `Prompt: ${props.trace.promptText.length}` : '',
		props.trace.rawResponse ? `Raw: ${props.trace.rawResponse.length}` : '',
	].filter(Boolean);
});

const artifactsSummary = computed((): string => {
	const count = props.trace?.recalledArtifacts.length || 0;
	if (!count) {
		return 'Memory retrieval ничего не вернул.';
	}
	return count === 1
		? '1 artifact был использован при сборке prompt.'
		: `${count} artifacts были использованы при сборке prompt.`;
});

const promptSummary = computed((): string => {
	if (!props.trace) {
		return '';
	}
	const fragments = props.trace.promptFragments.length;
	return fragments
		? `${fragments} fragments участвуют в сборке prompt`
		: 'Фрагменты prompt не сохранены.';
});

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

const sectionChipText = computed<Record<DebugSectionKey, string>>(() => ({
	sources: props.trace?.recalledArtifacts.length
		? `Sources · ${props.trace.recalledArtifacts.length}`
		: 'Sources',
	prompt: props.trace?.promptFragments.length
		? `Prompt · ${props.trace.promptFragments.length}`
		: 'Prompt',
	'model-output': props.trace?.rawResponse
		? `Model Output · ${props.trace.rawResponse.length}`
		: 'Model Output',
	runtime: hasRuntimeExtraction.value
		? 'Runtime Extraction'
		: 'Runtime Extraction · empty',
	diagnostics: Object.keys(props.trace?.timingsMs || {}).length
		? `Diagnostics · ${Object.keys(props.trace?.timingsMs || {}).length}`
		: 'Diagnostics',
}));

const getSectionVariant = (key: DebugSectionKey): ChipVariant => {
	if (key === 'sources') {
		return 'success';
	}
	if (key === 'prompt') {
		return 'accent';
	}
	if (key === 'model-output') {
		return 'warning';
	}
	if (key === 'runtime') {
		return 'danger';
	}
	return 'neutral';
};

const getArtifactVariant = (
	artifact: ChatTimelineEternalArtifactEntry
): ChipVariant => {
	if (
		artifact.type === 'semantic_memory' ||
		artifact.type === 'episodic_memory'
	) {
		return 'success';
	}
	if (
		artifact.type === 'environment_state' ||
		artifact.context === 'environment'
	) {
		return 'warning';
	}
	if (artifact.context === 'persona' || artifact.context === 'relationship') {
		return 'accent';
	}
	if (artifact.type === 'session_summary') {
		return 'danger';
	}
	return 'neutral';
};

const getPromptVariant = (
	fragment: ChatTimelineEternalPromptFragmentEntry
): ChipVariant => {
	if (fragment.layer === 'policy' || fragment.source.includes('policy')) {
		return 'danger';
	}
	if (
		fragment.layer === 'memory' ||
		fragment.source.includes('memory') ||
		fragment.source.includes('semantic')
	) {
		return 'success';
	}
	if (
		fragment.layer === 'runtime' ||
		fragment.source.includes('runtime') ||
		fragment.source.includes('context')
	) {
		return 'warning';
	}
	return 'accent';
};

const toggleSection = (key: DebugSectionKey): void => {
	openSection.value = openSection.value === key ? null : key;
};

const toggleArtifact = (artifactId: string): void => {
	openSourceArtifactId.value =
		openSourceArtifactId.value === artifactId ? null : artifactId;
};

const togglePromptFragment = (fragmentId: string): void => {
	openPromptFragmentId.value =
		openPromptFragmentId.value === fragmentId ? null : fragmentId;
};

const activeArtifact = computed(
	() =>
		props.trace?.recalledArtifacts.find(
			artifact => artifact.id === openSourceArtifactId.value
		) || null
);

const activePromptFragment = computed(
	() =>
		props.trace?.promptFragments.find(
			fragment => fragment.id === openPromptFragmentId.value
		) || null
);
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
			<div class="flex flex-wrap gap-2">
				<SummaryChip
					size="xs"
					toggle
					:pressed="openSection === 'sources'"
					:variant="getSectionVariant('sources')"
					:text="sectionChipText.sources"
					@click="toggleSection('sources')"
				/>
				<SummaryChip
					size="xs"
					toggle
					:pressed="openSection === 'prompt'"
					:variant="getSectionVariant('prompt')"
					:text="sectionChipText.prompt"
					@click="toggleSection('prompt')"
				/>
				<SummaryChip
					size="xs"
					toggle
					:pressed="openSection === 'model-output'"
					:variant="getSectionVariant('model-output')"
					:text="sectionChipText['model-output']"
					@click="toggleSection('model-output')"
				/>
				<SummaryChip
					size="xs"
					toggle
					:pressed="openSection === 'runtime'"
					:variant="getSectionVariant('runtime')"
					:text="sectionChipText.runtime"
					@click="toggleSection('runtime')"
				/>
				<SummaryChip
					size="xs"
					toggle
					:pressed="openSection === 'diagnostics'"
					:variant="getSectionVariant('diagnostics')"
					:text="sectionChipText.diagnostics"
					@click="toggleSection('diagnostics')"
				/>
			</div>

			<MessageCard
				v-if="openSection === 'sources'"
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
					<div v-else class="flex flex-col gap-2.5">
						<div class="flex flex-wrap gap-2">
							<SummaryChip
								v-for="artifact in trace.recalledArtifacts"
								:key="artifact.id"
								size="xs"
								toggle
								truncate-label
								:pressed="openSourceArtifactId === artifact.id"
								:variant="getArtifactVariant(artifact)"
								:text="`${artifact.type} · ${artifact.context}`"
								@click="toggleArtifact(artifact.id)"
							/>
						</div>
						<MessageCard
							v-if="activeArtifact"
							:title="`${activeArtifact.type} · ${activeArtifact.context}`"
							:subtitle="activeArtifact.text"
							:meta="`${activeArtifact.sourceLabel} · ${activeArtifact.scopeLabel}`"
							compact
							:hoverable="false"
						>
							<template #badges>
								<SummaryChip
									v-if="
										activeArtifact.score !== null &&
										activeArtifact.score !== undefined
									"
									size="xs"
									variant="neutral"
									:text="`score: ${activeArtifact.score}`"
								/>
							</template>
						</MessageCard>
					</div>
				</template>
			</MessageCard>

			<MessageCard
				v-if="openSection === 'prompt'"
				title="Prompt Composition"
				:subtitle="promptSummary"
				compact
				:hoverable="false"
			>
				<template #body>
					<div
						v-if="trace?.promptFragments.length"
						class="flex flex-col gap-2.5"
					>
						<div class="flex flex-wrap gap-2">
							<SummaryChip
								v-for="fragment in trace.promptFragments"
								:key="fragment.id"
								size="xs"
								toggle
								truncate-label
								:pressed="openPromptFragmentId === fragment.id"
								:variant="getPromptVariant(fragment)"
								:text="`${fragment.layer} · ${fragment.source}`"
								@click="togglePromptFragment(fragment.id)"
							/>
						</div>
						<MessageCard
							v-if="activePromptFragment"
							:title="`${activePromptFragment.layer} · ${activePromptFragment.source}`"
							:subtitle="activePromptFragment.text"
							:meta="`priority: ${activePromptFragment.priority}`"
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
				v-if="openSection === 'model-output'"
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
					<div
						class="rounded-xl bg-[var(--background-secondary)]/55 px-3 py-2.5 text-sm leading-6 text-[var(--text-normal)] whitespace-pre-wrap break-words"
						v-text="trace?.rawResponse || 'Raw response отсутствует.'"
					/>
				</template>
			</MessageCard>

			<MessageCard
				v-if="openSection === 'runtime'"
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
					<div v-else class="text-sm text-[var(--text-muted)]">
						Дополнительных parser-артефактов нет.
					</div>
				</template>
			</MessageCard>

			<MessageCard
				v-if="openSection === 'diagnostics'"
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
					<div
						v-if="trace && Object.keys(trace.timingsMs).length"
						class="mt-2 flex flex-col gap-1.5"
					>
						<div
							v-for="(value, key) in trace.timingsMs"
							:key="key"
							class="flex items-center justify-between gap-3 rounded-lg bg-[var(--background-secondary)]/55 px-2.5 py-2 text-sm text-[var(--text-normal)]"
						>
							<span class="text-[var(--text-muted)]" v-text="key" />
							<span class="font-medium" v-text="`${value} ms`" />
						</div>
					</div>
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
