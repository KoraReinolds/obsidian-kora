<script setup lang="ts">
/**
 * @description Vue screen для related chunks по активному чанку.
 */
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
import { useRelatedChunksScreen } from '../model/use-related-chunks-screen';
import type { ChunkTransportPort } from '../ports/chunk-transport-port';

const props = defineProps<{
	transport: ChunkTransportPort;
}>();

const {
	relatedChunks,
	unsyncedNotes,
	activeChunk,
	isLoading,
	isLoadingRelated,
	message,
	refreshContext,
	openRelated,
} = useRelatedChunksScreen({ transport: props.transport });
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
