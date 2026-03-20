<script setup lang="ts">
/**
 * @description Vue screen для просмотра/синхронизации чанков активной заметки.
 */
import {
	AppShell,
	DetailsPane,
	DiffPreview,
	EmptyState,
	EntityListPane,
	IconButton,
	LoadingState,
	MessageCard,
	SectionHeader,
	StatusBanner,
	SummaryChip,
} from '../../core/ui-vue';
import { useChunkScreen } from '../model/use-chunk-screen';
import type { ChunkTransportPort } from '../ports/chunk-transport-port';

const props = defineProps<{
	transport: ChunkTransportPort;
}>();

const {
	context,
	isLoading,
	isSyncing,
	message,
	hasActiveFile,
	activeFileName,
	visibleCount,
	changedCount,
	visibleItems,
	selectedChunkId,
	selectedChunk,
	refresh,
	selectChunk,
	syncChunks,
} = useChunkScreen({ transport: props.transport });
</script>

<template>
	<AppShell title="Kora Chunks">
		<template #toolbar>
			<div class="flex w-full items-center justify-between gap-1.5">
				<div class="flex items-center gap-1.5">
					<SummaryChip
						variant="accent"
						size="xs"
						class="text-[9px]"
						:text="`Отображено: ${visibleCount}`"
					/>
					<SummaryChip
						:variant="changedCount > 0 ? 'warning' : 'success'"
						size="xs"
						class="text-[9px]"
						:text="`Изменений: ${changedCount}`"
					/>
				</div>
				<div class="flex items-center gap-1.5">
					<IconButton
						size="sm"
						icon="rotate-ccw"
						label="Обновить чанки"
						title="Обновить"
						:disabled="isLoading || isSyncing"
						@click="refresh"
					/>
					<IconButton
						size="sm"
						variant="accent"
						icon="refresh-cw"
						label="Синхронизировать чанки"
						title="Синхронизировать"
						:disabled="changedCount === 0 || isSyncing || !context"
						:loading="isSyncing"
						@click="syncChunks"
					/>
				</div>
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
						title="Chunks"
						:subtitle="
							hasActiveFile ? activeFileName : 'Нет активной markdown-заметки'
						"
					/>
				</template>
				<LoadingState v-if="isLoading" text="Загружаем чанки…" />
				<EmptyState
					v-else-if="!hasActiveFile"
					title="Нет файла"
					text="Откройте markdown заметку, чтобы увидеть список чанков."
				/>
				<div v-else class="flex min-h-0 flex-1 flex-col gap-1.5">
					<MessageCard
						v-for="item in visibleItems"
						:key="item.chunkId"
						clickable
						compact
						:selected="item.chunkId === selectedChunkId"
						hoverable
						@click="selectChunk(item.chunkId)"
					>
						<template #title>
							<div
								class="truncate text-[11px] font-semibold leading-tight text-[var(--text-muted)]"
								v-text="
									`${item.chunk?.chunkType || 'deleted'} — ${(item.chunk?.headingsPath || ['[DELETED]']).join(' > ')}`
								"
							/>
						</template>
						<template #actions>
							<SummaryChip
								:variant="
									item.status === 'unchanged'
										? 'neutral'
										: item.status === 'new'
											? 'success'
											: item.status === 'modified'
												? 'warning'
												: 'danger'
								"
								size="xs"
								outlined
								class="text-[9px]"
								:text="item.status.toUpperCase()"
							/>
						</template>
						<template #body>
							<div
								class="text-[11px] leading-snug text-[var(--text-normal)]"
								v-text="
									(item.content || '').slice(0, 220) +
									((item.content || '').length > 220 ? '…' : '')
								"
							/>
						</template>
					</MessageCard>
				</div>
			</EntityListPane>

			<DetailsPane class="min-h-0" :scroll="true" padding="sm" gap="sm">
				<template #header>
					<SectionHeader
						title="Chunk details"
						:subtitle="
							selectedChunk
								? `chunkId: ${selectedChunk.chunkId}`
								: 'Выберите чанк слева'
						"
					/>
				</template>
				<EmptyState
					v-if="!selectedChunk"
					text="Для просмотра diff и метаданных выберите чанк в списке."
				/>
				<div v-else class="flex flex-col gap-1.5">
					<MessageCard
						compact
						:title="selectedChunk.chunk?.section || '[DELETED]'"
						:meta="`Тип: ${selectedChunk.chunk?.chunkType || 'deleted'}`"
						:body="selectedChunk.content"
					>
						<template #title>
							<div
								class="text-[13px] font-semibold leading-tight text-[var(--text-normal)]"
								v-text="selectedChunk.chunk?.section || '[DELETED]'"
							/>
						</template>
						<template #meta>
							<div
								class="text-[11px] text-[var(--text-muted)]"
								v-text="`Тип: ${selectedChunk.chunk?.chunkType || 'deleted'}`"
							/>
						</template>
						<template #body>
							<div
								class="text-[11px] leading-snug text-[var(--text-normal)]"
								v-text="selectedChunk.content"
							/>
						</template>
					</MessageCard>
					<DiffPreview
						v-if="selectedChunk.status === 'modified'"
						:previous="selectedChunk.previousContent || ''"
						:current="selectedChunk.content"
					/>
				</div>
			</DetailsPane>
		</div>
	</AppShell>
</template>
