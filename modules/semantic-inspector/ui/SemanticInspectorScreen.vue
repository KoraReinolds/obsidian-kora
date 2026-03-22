<script setup lang="ts">
/**
 * @module semantic-inspector/ui/SemanticInspectorScreen
 *
 * @description Отладочный экран: состояние бэкенда в рантайме, объединённые строки
 * (локальный парсинг против индекса) с привязкой к курсору, инкрементальная синхронизация
 * дельт, переиндексация и удаление.
 */

import {
	AppShell,
	DetailsPane,
	DiffPreview,
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
import type {
	SemanticInspectorTransportPort,
	SemanticInspectorUnifiedRow,
} from '../ports/semantic-inspector-transport-port';

const PREVIEW_MAX = 220;

/**
 * @description Обрезает текст превью строки для списка.
 * @param {string} text - Исходный текст.
 * @param {number} max - Максимум символов до многоточия.
 * @returns {string}
 */
const clip = (text: string, max: number): string => {
	const t = text || '';
	return t.length > max ? `${t.slice(0, max)}…` : t;
};

/**
 * @description Схлопывает пробелы для стабильного сравнения локального тела и индекса.
 * @param {string} value - Сырой чанк или сохранённый контент.
 * @returns {string}
 */
const normalizeForCompare = (value: string): string =>
	(value || '').replace(/\s+/g, ' ').trim();

/**
 * @description Одна колонка в списке только если чанк есть и в заметке, и в индексе,
 * и нормализованный текст совпадает. Удалённый из заметки чанк (`deleted`) всегда
 * две колонки: слева пусто, справа индекс.
 * @param {SemanticInspectorUnifiedRow} row - Строка объединённого списка.
 * @returns {boolean}
 */
const isSameChunkBothSides = (row: SemanticInspectorUnifiedRow): boolean => {
	if (!row.localItem || !row.indexRecord) {
		return false;
	}
	if (row.localItem.status === 'deleted') {
		return false;
	}
	const a = normalizeForCompare(row.localItem.content);
	const b = normalizeForCompare(row.indexRecord.content);
	return a === b;
};

/**
 * @description Превью для одноколоночной строки: вызывается только при {@link isSameChunkBothSides}.
 * @param {SemanticInspectorUnifiedRow} row - Строка объединённого списка.
 * @returns {string}
 */
const mergedRowPreview = (row: SemanticInspectorUnifiedRow): string =>
	clip(row.localItem?.content ?? '', PREVIEW_MAX);

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
					icon-label="Поиск по union-строкам"
					placeholder="Фильтр: chunkId, pointId, текст..."
					input-class="rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)]"
					clearable
					:disabled="!screen.hasUnifiedRows.value"
				/>
				<SummaryChip
					v-if="screen.chunkContext.value"
					:variant="screen.changedChunkCount.value > 0 ? 'warning' : 'success'"
					size="xs"
					class="text-[9px]"
					:text="`Δ локально: ${screen.changedChunkCount.value}`"
				/>
				<IconButton
					icon="rotate-ccw"
					label="Обновить"
					title="Обновить локальный + индексный контекст"
					:loading="screen.isRefreshing.value"
					:disabled="screen.isBusy.value"
					@click="screen.refresh"
				/>
				<IconButton
					icon="refresh-cw"
					label="Синхронизировать дельты"
					title="Инкрементальный sync в индекс"
					variant="accent"
					:loading="screen.isSyncingDeltas.value"
					:disabled="
						screen.changedChunkCount.value === 0 ||
						!screen.chunkContext.value ||
						screen.isBusy.value
					"
					@click="screen.syncChunkDeltas"
				/>
				<IconButton
					icon="rotate-cw"
					label="Переиндексировать заметку"
					title="Reindex current note"
					:loading="screen.isRunningReindex.value"
					:disabled="!screen.hasActiveNote.value || screen.isBusy.value"
					@click="screen.reindexCurrentNote"
				/>
				<IconButton
					icon="trash-2"
					label="Удалить из индекса"
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
					screen.noteContext.value || screen.chunkContext.value
						? `originalId: ${screen.noteContext.value?.originalId ?? screen.chunkContext.value?.originalId}\npath: ${screen.noteContext.value?.filePath ?? screen.chunkContext.value?.filePath}`
						: 'Открой markdown-заметку с frontmatter `date created`.'
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
				class="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
			>
				<EntityListPane padding="sm" gap="sm" scroll>
					<template #header>
						<SectionHeader
							title="Список"
							:subtitle="
								screen.hasUnifiedRows.value
									? `${screen.filteredUnifiedRows.value.length} / ${screen.unifiedRows.value.length} видно`
									: 'Текущая заметка'
							"
						/>
					</template>

					<LoadingState
						v-if="screen.isRefreshing.value && !screen.hasActiveNote.value"
						text="Загружаем контекст…"
					/>

					<EmptyState
						v-else-if="!screen.hasActiveNote.value"
						title="Нет активной заметки"
						text="Открой markdown-заметку с frontmatter `date created`."
					/>

					<EmptyState
						v-else-if="!screen.hasUnifiedRows.value"
						title="Нет строк"
						text="Нет локальных чанков и записей индекса для объединённого списка."
					/>

					<EmptyState
						v-else-if="screen.filteredUnifiedRows.value.length === 0"
						title="Ничего не найдено"
						text="Фильтр не совпал ни с одной строкой."
					/>

					<div v-else class="flex flex-col gap-1.5">
						<MessageCard
							v-for="row in screen.filteredUnifiedRows.value"
							:key="row.chunkId"
							clickable
							compact
							stacked
							:selected="screen.selectedChunkId.value === row.chunkId"
							@click="screen.selectRow(row.chunkId)"
						>
							<template #title>
								<div
									class="flex w-full min-w-0 flex-wrap items-center gap-1 border-b border-solid border-[var(--background-modifier-border)] pb-1.5"
								>
									<template v-if="row.indexRecord">
										<SummaryChip
											:text="row.indexRecord.contentType"
											size="xs"
											variant="accent"
										/>
										<SummaryChip
											size="xs"
											class="max-w-[min(100%,12rem)] shrink truncate font-mono text-[9px]"
											:text="row.indexRecord.pointId"
										/>
									</template>
								</div>
							</template>
							<template #body>
								<div
									v-if="!isSameChunkBothSides(row)"
									class="grid w-full min-w-0 grid-cols-2 gap-2 text-[11px] leading-snug"
								>
									<div
										class="min-h-[1.25em] min-w-0 border-r border-solid border-[var(--background-modifier-border)] pr-2 text-[var(--text-normal)]"
									>
										<span
											v-if="row.localItem && row.localItem.status !== 'deleted'"
											v-text="clip(row.localItem.content, PREVIEW_MAX)"
										/>
										<span
											v-else-if="!row.localItem"
											class="text-[var(--text-muted)] italic"
											v-text="'—'"
										/>
									</div>
									<div class="min-w-0 text-[var(--text-normal)]">
										<span
											v-if="row.indexRecord"
											v-text="clip(row.indexRecord.preview, PREVIEW_MAX)"
										/>
										<span
											v-else
											class="text-[var(--text-muted)] italic"
											v-text="'—'"
										/>
									</div>
								</div>
								<div
									v-else
									class="text-[11px] leading-snug text-[var(--text-normal)]"
								>
									<span v-text="mergedRowPreview(row)" />
								</div>
							</template>
						</MessageCard>
					</div>
				</EntityListPane>

				<DetailsPane padding="sm" gap="sm" scroll>
					<template #header>
						<SectionHeader
							title="Детали"
							:subtitle="
								screen.selectedUnifiedRow.value
									? `chunkId: ${screen.selectedUnifiedRow.value.chunkId}`
									: 'Выберите строку слева'
							"
						/>
					</template>

					<EmptyState
						v-if="!screen.selectedUnifiedRow.value"
						title="Нет выбранной строки"
						text="Выбери строку в списке: локальный чанк, индекс и diff ниже."
					/>

					<template v-else>
						<MessageCard
							v-if="screen.selectedUnifiedRow.value.localItem"
							title="Локальный чанк"
							compact
						>
							<template #body>
								<p
									v-if="
										screen.selectedUnifiedRow.value.localItem?.status ===
										'deleted'
									"
									class="m-0 text-[11px] leading-normal text-[var(--text-muted)]"
									v-text="
										'Нет в тексте заметки (чанк удалён из текста; в индексе запись ещё есть — см. справа).'
									"
								/>
								<pre
									v-else
									class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
									v-text="
										screen.selectedUnifiedRow.value.localItem?.content || ''
									"
								/>
							</template>
						</MessageCard>

						<DiffPreview
							v-if="
								screen.selectedUnifiedRow.value.localItem?.status === 'modified'
							"
							:previous="
								screen.selectedUnifiedRow.value.localItem?.previousContent || ''
							"
							:current="
								screen.selectedUnifiedRow.value.localItem?.content || ''
							"
						/>

						<template v-if="screen.selectedUnifiedRow.value.indexRecord">
							<MessageCard
								:title="screen.selectedUnifiedRow.value.indexRecord.title"
								:subtitle="screen.selectedUnifiedRow.value.indexRecord.preview"
								compact
							>
								<template #badges>
									<SummaryChip
										:text="`pointId: ${screen.selectedUnifiedRow.value.indexRecord.pointId}`"
										size="xs"
									/>
									<SummaryChip
										:text="`chunkId: ${screen.selectedUnifiedRow.value.indexRecord.chunkId}`"
										size="xs"
									/>
									<SummaryChip
										:text="`originalId: ${screen.selectedUnifiedRow.value.indexRecord.originalId}`"
										size="xs"
									/>
									<SummaryChip
										:text="
											screen.selectedUnifiedRow.value.indexRecord.contentType
										"
										size="xs"
										variant="accent"
									/>
								</template>
							</MessageCard>

							<MessageCard title="Content (index)" compact>
								<template #body>
									<pre
										class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
										v-text="
											screen.selectedUnifiedRow.value.indexRecord.content ||
											'Пустой content'
										"
									/>
								</template>
							</MessageCard>

							<MessageCard title="Metadata" compact>
								<template #body>
									<pre
										class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
										v-text="
											stringifyJson(
												screen.selectedUnifiedRow.value.indexRecord.metadata
											)
										"
									/>
								</template>
							</MessageCard>

							<MessageCard title="Raw payload" compact>
								<template #body>
									<pre
										class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
										v-text="
											stringifyJson(
												screen.selectedUnifiedRow.value.indexRecord.payload
											)
										"
									/>
								</template>
							</MessageCard>
						</template>
					</template>
				</DetailsPane>
			</div>
		</div>
	</AppShell>
</template>
