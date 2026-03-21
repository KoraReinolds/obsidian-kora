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
	DetailsPane,
	EmptyState,
	EntityListPane,
	IconButton,
	LoadingState,
	MessageCard,
	SectionHeader,
	StatusBanner,
	SummaryChip,
} from '../../core/ui-vue';
import { defaultVectorSettings } from '../../vector/types';
import type KoraPlugin from '../../../main';
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
	refreshContext,
	loadRelated,
	openRelated,
} = useRelatedChunksScreen({ transport: props.transport });

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
			<StatusBanner v-if="message" :kind="message.kind" :text="message.text" />
		</template>

		<div
			class="grid h-full min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden lg:grid-cols-[minmax(320px,1fr)_minmax(300px,0.85fr)]"
		>
			<EntityListPane class="min-h-0" :scroll="true" padding="sm" gap="sm">
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
				<LoadingState
					v-if="isLoading || isLoadingRelated"
					text="Ищем связанные чанки…"
				/>
				<EmptyState
					v-else-if="!activeChunk"
					text="Сфокусируйте курсор на markdown-чанке, чтобы увидеть связанные элементы."
				/>
				<EmptyState
					v-else-if="relatedChunks.length === 0"
					text="Связанные чанки не найдены."
				/>
				<div v-else class="flex min-h-0 flex-1 flex-col gap-1.5">
					<MessageCard
						v-for="item in relatedChunks"
						:key="item.chunkId"
						clickable
						compact
						:title="`${item.chunkType} — ${item.headingsPath.join(' > ')}`"
						:body="
							item.contentRaw.slice(0, 220) +
							(item.contentRaw.length > 220 ? '…' : '')
						"
						@click="openRelated(item)"
					>
						<template #badges>
							<SummaryChip
								variant="warning"
								size="xs"
								:text="`${Math.round(item.score * 100)}%`"
							/>
						</template>
						<template #footer>
							<div
								class="text-[10px] text-[var(--text-muted)]"
								v-text="`📄 ${item.sourceFile}`"
							/>
						</template>
					</MessageCard>
				</div>
			</EntityListPane>

			<DetailsPane class="min-h-0" :scroll="true" padding="sm" gap="sm">
				<template #header>
					<SectionHeader
						title="Unsynced Notes"
						:subtitle="`/Organize not indexed: ${unsyncedNotes.length}`"
					/>
				</template>
				<EmptyState
					v-if="unsyncedNotes.length === 0"
					text="Все заметки из /Organize уже синхронизированы."
				/>
				<div v-else class="flex flex-col gap-1.5">
					<MessageCard
						v-for="note in unsyncedNotes"
						:key="note.path"
						compact
						:title="note.basename"
						:meta="note.path"
						body="Нужна индексация для векторного поиска."
					/>
				</div>
			</DetailsPane>
		</div>
	</AppShell>
</template>
