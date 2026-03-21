<script setup lang="ts">
/**
 * @module semantic-inspector/ui/SemanticInspectorScreen
 *
 * @description Right-panel debug screen for inspecting runtime semantic backend
 * state and indexed records of the current note. The layout intentionally
 * reuses shared list/detail primitives instead of introducing a new bespoke UI.
 */

import {
	AppShell,
	DetailsPane,
	EmptyState,
	EntityListPane,
	IconButton,
	IconTextField,
	LoadingState,
	MessageCard,
	SectionHeader,
	StatusBanner,
	SummaryChip,
	Toolbar,
} from '../../core/ui-vue';
import { computed } from 'vue';
import { useSemanticInspectorScreen } from '../model/use-semantic-inspector-screen';
import type { SemanticInspectorTransportPort } from '../ports/semantic-inspector-transport-port';

const props = defineProps<{
	transport: SemanticInspectorTransportPort;
}>();

const screen = useSemanticInspectorScreen({
	transport: props.transport,
});

const stringifyJson = (value: unknown): string =>
	JSON.stringify(value, null, 2);

const backendVariant = computed<
	'neutral' | 'success' | 'warning' | 'danger' | 'accent'
>(() => {
	if (screen.backendStatus.value.status === 'healthy') {
		return 'success';
	}
	if (
		screen.backendStatus.value.status === 'unhealthy' ||
		screen.backendStatus.value.status === 'error'
	) {
		return 'danger';
	}
	return 'warning';
});
</script>

<template>
	<AppShell title="Semantic Inspector">
		<template #toolbar>
			<Toolbar>
				<IconTextField
					v-model="screen.filterQuery.value"
					icon="search"
					icon-label="Поиск по индексным записям"
					placeholder="Фильтр: chunkId, pointId, title..."
					input-class="rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)]"
					clearable
					:disabled="!screen.hasRecords.value"
				/>
				<IconButton
					icon="refresh-cw"
					label="Обновить inspector"
					title="Refresh"
					:loading="screen.isRefreshing.value"
					:disabled="screen.isBusy.value"
					@click="screen.refresh"
				/>
				<IconButton
					icon="rotate-cw"
					label="Переиндексировать текущую заметку"
					title="Reindex current note"
					variant="accent"
					:loading="screen.isRunningReindex.value"
					:disabled="!screen.hasActiveNote.value || screen.isBusy.value"
					@click="screen.reindexCurrentNote"
				/>
				<IconButton
					icon="trash-2"
					label="Удалить заметку из индекса"
					title="Delete current note from index"
					variant="danger"
					:loading="screen.isRunningDelete.value"
					:disabled="!screen.hasActiveNote.value || screen.isBusy.value"
					@click="screen.deleteCurrentNoteRecords"
				/>
			</Toolbar>
		</template>

		<template #message>
			<StatusBanner
				v-if="screen.message.value"
				:kind="screen.message.value.kind"
				:text="screen.message.value.text"
				title="Semantic Inspector"
				dismissible
				@dismiss="screen.clearMessage"
			/>
		</template>

		<div class="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
			<MessageCard
				title="Runtime status"
				:subtitle="screen.noteSummaryText.value"
				:body="
					screen.noteContext.value
						? `originalId: ${screen.noteContext.value.originalId}\npath: ${screen.noteContext.value.filePath}`
						: 'Inspector ждет активную markdown-заметку с frontmatter `date created`.'
				"
				compact
			>
				<template #badges>
					<SummaryChip
						:text="`status: ${screen.backendStatus.value.status}`"
						:variant="backendVariant"
						icon="activity"
					/>
					<SummaryChip
						:text="`backend: ${screen.backendStatus.value.backend || 'unknown'}`"
						variant="accent"
						icon="database"
					/>
					<SummaryChip
						:text="`points: ${screen.backendStatus.value.totalPoints}`"
						icon="hash"
					/>
					<SummaryChip
						v-if="screen.backendStatus.value.embeddingModel"
						:text="`model: ${screen.backendStatus.value.embeddingModel}`"
						icon="box"
					/>
					<SummaryChip
						v-if="screen.backendStatus.value.databasePath"
						:text="`db: ${screen.backendStatus.value.databasePath}`"
						icon="file-text"
					/>
					<SummaryChip
						v-if="screen.backendStatus.value.qdrantUrl"
						:text="`qdrant: ${screen.backendStatus.value.qdrantUrl}`"
						icon="globe"
					/>
					<SummaryChip
						v-for="chip in screen.breakdownChips.value"
						:key="chip"
						:text="chip"
						size="xs"
					/>
				</template>
				<template #footer>
					<div
						v-if="screen.backendStatus.value.error"
						class="rounded-lg border border-dashed border-[var(--background-modifier-border)] p-2 text-xs text-[var(--text-muted)]"
						v-text="`backend error: ${screen.backendStatus.value.error}`"
					/>
					<div
						v-else-if="screen.backendStatus.value.embeddingBaseUrl"
						class="text-xs text-[var(--text-muted)]"
						v-text="`endpoint: ${screen.backendStatus.value.embeddingBaseUrl}`"
					/>
				</template>
			</MessageCard>

			<div
				class="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
			>
				<EntityListPane padding="sm" gap="sm" scroll>
					<template #header>
						<SectionHeader
							title="Index records"
							:subtitle="
								screen.noteContext.value
									? `${screen.filteredRecords.value.length} / ${screen.records.value.length} visible`
									: 'Текущая заметка'
							"
						/>
					</template>

					<LoadingState
						v-if="screen.isRefreshing.value && !screen.hasActiveNote.value"
						text="Загружаем semantic context..."
					/>

					<EmptyState
						v-else-if="!screen.hasActiveNote.value"
						title="Нет активной заметки"
						text="Открой markdown-заметку с frontmatter `date created`, чтобы inspector смог найти записи по originalId."
					/>

					<EmptyState
						v-else-if="!screen.hasRecords.value"
						title="0 records"
						text="Для текущей заметки в semantic index пока нет записей. Это нормальное состояние до индексации."
					/>

					<EmptyState
						v-else-if="screen.filteredRecords.value.length === 0"
						title="Ничего не найдено"
						text="Фильтр не совпал ни с одной записью текущей заметки."
					/>

					<div v-else class="flex flex-col">
						<MessageCard
							v-for="record in screen.filteredRecords.value"
							:key="record.pointId"
							:title="record.title"
							:subtitle="record.preview"
							:meta="`pointId: ${record.pointId}`"
							stacked
							clickable
							compact
							:selected="screen.selectedRecordId.value === record.pointId"
							@click="screen.selectRecord(record.pointId)"
						>
							<template #badges>
								<SummaryChip
									:text="record.contentType"
									size="xs"
									variant="accent"
								/>
								<SummaryChip :text="`chunkId: ${record.chunkId}`" size="xs" />
							</template>
						</MessageCard>
					</div>
				</EntityListPane>

				<DetailsPane padding="sm" gap="sm" scroll>
					<template #header>
						<SectionHeader
							title="Record details"
							:subtitle="
								screen.selectedRecord.value
									? screen.selectedRecord.value.pointId
									: 'Выберите запись слева'
							"
						/>
					</template>

					<EmptyState
						v-if="!screen.selectedRecord.value"
						title="Нет выбранной записи"
						text="Выбери запись в списке, чтобы посмотреть payload, metadata и исходный content."
					/>

					<template v-else>
						<MessageCard
							:title="screen.selectedRecord.value.title"
							:subtitle="screen.selectedRecord.value.preview"
							compact
						>
							<template #badges>
								<SummaryChip
									:text="`pointId: ${screen.selectedRecord.value.pointId}`"
									size="xs"
								/>
								<SummaryChip
									:text="`chunkId: ${screen.selectedRecord.value.chunkId}`"
									size="xs"
								/>
								<SummaryChip
									:text="`originalId: ${screen.selectedRecord.value.originalId}`"
									size="xs"
								/>
								<SummaryChip
									:text="screen.selectedRecord.value.contentType"
									size="xs"
									variant="accent"
								/>
							</template>
						</MessageCard>

						<MessageCard title="Content" compact>
							<template #body>
								<pre
									class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
									v-text="
										screen.selectedRecord.value.content || 'Пустой content'
									"
								/>
							</template>
						</MessageCard>

						<MessageCard title="Metadata" compact>
							<template #body>
								<pre
									class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
									v-text="stringifyJson(screen.selectedRecord.value.metadata)"
								/>
							</template>
						</MessageCard>

						<MessageCard title="Raw payload" compact>
							<template #body>
								<pre
									class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
									v-text="stringifyJson(screen.selectedRecord.value.payload)"
								/>
							</template>
						</MessageCard>
					</template>
				</DetailsPane>
			</div>
		</div>
	</AppShell>
</template>
