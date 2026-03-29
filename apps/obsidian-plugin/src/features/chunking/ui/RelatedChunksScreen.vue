<script setup lang="ts">
/**
 * @description Vue screen для related chunks по активному чанку.
 * Порог score и вес лексического буста хранятся в {@link defaultVectorSettings}
 * и редактируются здесь; при изменении полей (debounce) настройки сохраняются и
 * список related перезапрашивается.
 */
import { onUnmounted, ref, watch } from 'vue';
import {
	AppShell,
	EntityList,
	IconButton,
	MessageCard,
	PanelFrame,
	PlaceholderState,
	SectionHeader,
	StatusBanner,
	SummaryChip,
} from '../../../ui-vue';
import { defaultVectorSettings } from '../../../vector';
import type KoraPlugin from '../../main';
import { useRelatedChunksScreen } from '../model/use-related-chunks-screen';
import type { ChunkTransportPort } from '../ports/chunk-transport-port';

const props = defineProps<{
	transport: ChunkTransportPort;
	plugin: KoraPlugin;
}>();

const scoreThreshold = ref(
	props.plugin.settings.vectorSettings.searchScoreThreshold
);
const lexicalBoostWeight = ref(
	props.plugin.settings.vectorSettings.lexicalBoostWeight
);

const {
	relatedChunks,
	unsyncedNotes,
	activeChunk,
	isLoading,
	isLoadingRelated,
	message,
	clearMessage,
	refreshContext,
	loadRelated,
	openRelated,
} = useRelatedChunksScreen({ transport: props.transport });

/**
 * @description Форматирует score-компоненты для компактных UI chip-ов без ложного
 * ощущения процентов. После lexical merge итоговый score может быть больше 1.
 * @param {number | null | undefined} value - Score-компонент или `null`.
 * @returns {string} Строка с двумя знаками после запятой или `-`.
 */
function formatScore(value: number | null | undefined): string {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		return '-';
	}
	return value.toFixed(2);
}

/**
 * @description Пишет значения полей в настройки плагина и сохраняет их.
 * @returns {Promise<void>}
 */
async function persistSearchParamsFromFields(): Promise<void> {
	const d = defaultVectorSettings;
	const st = parseFloat(String(scoreThreshold.value));
	const lw = parseFloat(String(lexicalBoostWeight.value));
	props.plugin.settings.vectorSettings.searchScoreThreshold = Number.isFinite(
		st
	)
		? Math.min(1, Math.max(0, st))
		: d.searchScoreThreshold;
	props.plugin.settings.vectorSettings.lexicalBoostWeight =
		Number.isFinite(lw) && lw >= 0 ? lw : d.lexicalBoostWeight;
	await props.plugin.saveSettings();
}

let searchParamsDebounce: ReturnType<typeof setTimeout> | null = null;
const SEARCH_PARAMS_DEBOUNCE_MS = 400;

onUnmounted(() => {
	if (searchParamsDebounce !== null) {
		clearTimeout(searchParamsDebounce);
		searchParamsDebounce = null;
	}
});

/**
 * @description При изменении порога или веса пересохраняем настройки и заново
 * запрашиваем related (тот же активный чанк), чтобы список соответствовал параметрам.
 */
watch(
	[scoreThreshold, lexicalBoostWeight],
	() => {
		if (searchParamsDebounce !== null) {
			clearTimeout(searchParamsDebounce);
			searchParamsDebounce = null;
		}
		searchParamsDebounce = window.setTimeout(() => {
			searchParamsDebounce = null;
			void (async () => {
				await persistSearchParamsFromFields();
				await loadRelated();
			})();
		}, SEARCH_PARAMS_DEBOUNCE_MS);
	},
	{ flush: 'post' }
);
</script>

<template>
	<AppShell title="Related Chunks">
		<template #toolbar>
			<div class="flex w-full items-center justify-between gap-1.5">
				<SummaryChip
					variant="accent"
					size="xs"
					:text="`Related: ${relatedChunks.length}`"
				/>
				<IconButton
					size="sm"
					icon="rotate-ccw"
					label="Обновить related chunks"
					title="Обновить"
					:disabled="isLoading || isLoadingRelated"
					@click="refreshContext"
				/>
			</div>
		</template>

		<template #message>
			<StatusBanner
				v-if="message"
				:kind="message.kind"
				:text="message.text"
				@dismiss="clearMessage"
			/>
		</template>

		<div
			class="grid h-full min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden lg:grid-cols-[minmax(320px,1fr)_minmax(300px,0.85fr)]"
		>
			<PanelFrame class="min-h-0" :scroll="true" padding="sm" gap="sm">
				<template #header>
					<SectionHeader
						title="Related Results"
						:subtitle="
							activeChunk
								? `Active chunk: ${activeChunk.chunkType}`
								: 'Поставьте курсор на чанк'
						"
					/>
				</template>
				<MessageCard
					compact
					title="Параметры поиска (related)"
					:subtitle="'Порог и лексический буст применяются к запросам related chunks.'"
				>
					<template #body>
						<div class="flex flex-col gap-2">
							<label class="flex flex-col gap-0.5">
								<span
									class="text-[11px] text-[var(--text-muted)]"
									v-text="'Порог score (0–1)'"
								/>
								<input
									v-model.number="scoreThreshold"
									type="number"
									class="w-full rounded border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2 py-1 text-xs"
									min="0"
									max="1"
									step="0.05"
								/>
							</label>
							<label class="flex flex-col gap-0.5">
								<span
									class="text-[11px] text-[var(--text-muted)]"
									v-text="'Вес лексического (FTS) буста'"
								/>
								<input
									v-model.number="lexicalBoostWeight"
									type="number"
									class="w-full rounded border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2 py-1 text-xs"
									min="0"
									step="0.05"
								/>
							</label>
						</div>
					</template>
				</MessageCard>
				<PlaceholderState
					v-if="isLoading || isLoadingRelated"
					variant="loading"
					text="Ищем связанные чанки…"
				/>
				<PlaceholderState
					v-else-if="!activeChunk"
					variant="empty"
					text="Сфокусируйте курсор на markdown-чанке, чтобы увидеть связанные элементы."
				/>
				<PlaceholderState
					v-else-if="relatedChunks.length === 0"
					variant="empty"
					text="Связанные чанки не найдены."
				/>
				<EntityList
					v-else
					:items="relatedChunks"
					:get-key="item => item.chunkId"
					:get-title="
						item => `${item.chunkType} — ${item.headingsPath.join(' > ')}`
					"
					:get-body="
						item =>
							item.contentRaw.slice(0, 220) +
							(item.contentRaw.length > 220 ? '…' : '')
					"
					:on-select="item => openRelated(item)"
				>
					<template #badges="{ item }">
						<SummaryChip
							variant="warning"
							size="xs"
							:text="`score ${formatScore(item.scoreDetails?.combinedScore ?? item.score)}`"
						/>
						<SummaryChip
							v-if="item.scoreDetails?.vectorScore != null"
							size="xs"
							:text="`sem ${formatScore(item.scoreDetails?.vectorScore)}`"
						/>
						<SummaryChip
							v-if="item.scoreDetails?.lexicalScore != null"
							size="xs"
							variant="accent"
							:text="`fts ${formatScore(item.scoreDetails?.lexicalScore)}`"
						/>
						<SummaryChip
							v-if="item.scoreDetails?.lexicalContribution != null"
							size="xs"
							:text="`boost ${formatScore(item.scoreDetails?.lexicalContribution)}`"
						/>
					</template>
					<template #footer="{ item }">
						<div
							class="text-[10px] text-[var(--text-muted)]"
							v-text="`📄 ${item.sourceFile}`"
						/>
					</template>
				</EntityList>
			</PanelFrame>

			<PanelFrame class="min-h-0" :scroll="true" padding="sm" gap="sm">
				<template #header>
					<SectionHeader
						title="Unsynced Notes"
						:subtitle="`/Organize not indexed: ${unsyncedNotes.length}`"
					/>
				</template>
				<PlaceholderState
					v-if="unsyncedNotes.length === 0"
					variant="empty"
					text="Все заметки из /Organize уже синхронизированы."
				/>
				<EntityList
					v-else
					:items="unsyncedNotes"
					:get-key="note => note.path"
					:get-title="note => note.basename"
					:get-meta="note => note.path"
					:get-body="() => 'Нужна индексация для векторного поиска.'"
				/>
			</PanelFrame>
		</div>
	</AppShell>
</template>
