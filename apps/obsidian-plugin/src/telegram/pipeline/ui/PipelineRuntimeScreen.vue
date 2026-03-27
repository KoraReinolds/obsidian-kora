<script setup lang="ts">
/**
 * @module telegram/pipeline/ui/PipelineRuntimeScreen
 *
 * @description Экран minimal pipeline runtime: selection slice, ручной запуск
 * шагов и preview артефактов для Telegram archive.
 */

import {
	AppShell,
	DiffPreview,
	IconButton,
	IconTextField,
	MessageCard,
	PanelFrame,
	PlaceholderState,
	SectionHeader,
	StatusBanner,
	SummaryChip,
	Toolbar,
} from '../../../ui-vue';
import { computed, ref } from 'vue';
import { usePipelineRuntimeScreen } from '../model/use-pipeline-runtime-screen';
import type { PipelineRuntimeTransportPort } from '../ports/pipeline-runtime-port';

const props = defineProps<{
	transport: PipelineRuntimeTransportPort;
	defaultPageLimit: number;
	defaultChunkSize: number;
	defaultGapMinutes: number;
	embedded?: boolean;
}>();

const model = usePipelineRuntimeScreen({
	transport: props.transport,
	defaultPageLimit: props.defaultPageLimit,
	defaultChunkSize: props.defaultChunkSize,
	defaultGapMinutes: props.defaultGapMinutes,
});

const {
	chats,
	selectedChatId,
	selectedChat,
	selectedChatFullRange,
	orderedRawMessages,
	pageLimitValue,
	pageNumberValue,
	chunkSizeValue,
	gapMinutesValue,
	includeServiceMessages,
	includeReplies,
	includeMediaOnlyMessages,
	selectedSelectionSnapshot,
	selectedChatLabel,
	selectedChatType,
	currentPage,
	totalPages,
	visibleRangeText,
	rawMessageCount,
	filteredMessageCount,
	isRefreshingChats,
	isLoadingSelection,
	isRunningStep,
	vectorHealthText,
	isVectorReady,
	selectedStepKey,
	selectedStepState,
	stepStates,
	pipelineSteps,
	normalizedRecords,
	orderedNormalizedMessages,
	chunkRecords,
	orderedChunkRecords,
	embeddingPayloads,
	embeddingResults,
	sampleNormalizedRecord,
	samplePayload,
	screenMessage,
	refreshData,
	handleChatSelection,
	handlePageSubmit,
	goToPrevPage,
	goToNextPage,
	runSelectedStep,
	formatDate,
	getMessageAuthorLabel,
	getMessageInitials,
	getMessageAccent,
} = model;

const selectedPreview = ref<'raw' | 'normalize' | 'chunk' | 'embed'>(
	'normalize'
);
const MAX_PREVIEW_ITEMS = 8;

const fieldClass =
	'box-border h-8 min-h-8 w-full min-w-0 rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2 text-sm text-[var(--text-normal)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-accent)] focus:ring-offset-1 focus:ring-offset-[var(--background-secondary)]';

const toolbarFieldClass =
	'box-border h-8 min-h-8 w-full min-w-0 rounded-md border-0 bg-transparent px-0 text-sm text-[var(--text-normal)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-accent)] focus:ring-inset';

const selectionSummary = computed(() => {
	if (!selectedChat.value) {
		return 'Выберите чат и загрузите slice сообщений.';
	}
	return `${selectedChatLabel.value} · page ${currentPage.value}/${totalPages.value} · ${visibleRangeText.value}`;
});

const getStatusVariant = (
	status: string
): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' => {
	if (status === 'success') return 'success';
	if (status === 'running') return 'accent';
	if (status === 'warning') return 'warning';
	if (status === 'error') return 'danger';
	return 'neutral';
};

const getStepStatusText = (stepKey: 'normalize' | 'chunk' | 'embed'): string =>
	stepStates[stepKey].status;

const rawSlicePreview = computed(() =>
	orderedRawMessages.value.slice(0, MAX_PREVIEW_ITEMS)
);
const normalizedPreview = computed(() =>
	orderedNormalizedMessages.value.slice(0, MAX_PREVIEW_ITEMS)
);
const chunkPreview = computed(() =>
	orderedChunkRecords.value.slice(0, MAX_PREVIEW_ITEMS)
);
const embedPreview = computed(() =>
	embeddingPayloads.value.slice(0, MAX_PREVIEW_ITEMS)
);

const previewTitle = computed(() => {
	if (selectedPreview.value === 'raw') return 'Raw slice';
	if (selectedPreview.value === 'normalize') return 'Normalized preview';
	if (selectedPreview.value === 'chunk') return 'Chunk preview';
	return 'Embedding payload';
});

const previewSubtitle = computed(() => {
	if (selectedPreview.value === 'raw') {
		return 'Сырой slice сообщений до нормализации.';
	}
	if (selectedPreview.value === 'normalize') {
		return 'Нормализованный текст для чанкинга и embeddings.';
	}
	if (selectedPreview.value === 'chunk') {
		return 'Candidate-chunks, собранные из нормализованных сообщений.';
	}
	return 'Payload, который уйдёт в vector backend.';
});

void refreshData();
</script>

<template>
	<AppShell v-if="!embedded" title="Telegram Pipeline Runtime">
		<template #toolbar>
			<Toolbar>
				<div class="flex min-w-0 flex-1 flex-wrap items-stretch gap-2">
					<div
						class="flex min-w-0 flex-[2] flex-nowrap items-center gap-1 rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-1 py-0"
					>
						<div class="min-w-0 flex-1 basis-0">
							<label class="sr-only" for="pipeline-chat-select">Chat</label>
							<select
								id="pipeline-chat-select"
								v-model="selectedChatId"
								:class="toolbarFieldClass"
								:disabled="isRefreshingChats || chats.length === 0"
								@change="handleChatSelection(selectedChatId || '')"
							>
								<option value="">Выберите чат</option>
								<option
									v-for="chat in chats"
									:key="chat.chatId"
									:value="chat.chatId"
								>
									{{ chat.title }} · {{ chat.type }} · {{ chat.messageCount }}
								</option>
							</select>
						</div>
					</div>

					<div class="w-24">
						<IconTextField
							v-model="pageLimitValue"
							:input-class="fieldClass"
							icon="hash"
							icon-label="Размер slice"
							placeholder="60"
							submit-on-enter
							@enter="handlePageSubmit"
						/>
					</div>

					<div class="w-24">
						<IconTextField
							v-model="pageNumberValue"
							:input-class="fieldClass"
							icon="layers-3"
							icon-label="Номер страницы"
							placeholder="1"
							submit-on-enter
							@enter="handlePageSubmit"
						/>
					</div>

					<div class="w-24">
						<IconTextField
							v-model="chunkSizeValue"
							:input-class="fieldClass"
							icon="box"
							icon-label="Размер чанка"
							placeholder="6"
							submit-on-enter
							@enter="handlePageSubmit"
						/>
					</div>

					<div class="w-24">
						<IconTextField
							v-model="gapMinutesValue"
							:input-class="fieldClass"
							icon="clock"
							icon-label="Gap minutes"
							placeholder="30"
							submit-on-enter
							@enter="handlePageSubmit"
						/>
					</div>

					<IconButton
						size="sm"
						variant="accent"
						icon="play"
						label="Загрузить slice"
						title="Загрузить selection slice"
						:loading="isLoadingSelection"
						:disabled="isRefreshingChats || chats.length === 0"
						@click="handlePageSubmit"
					/>

					<IconButton
						size="sm"
						variant="muted"
						icon="chevron-left"
						label="Предыдущая страница"
						title="Назад"
						:disabled="isLoadingSelection || currentPage <= 1"
						@click="goToPrevPage"
					/>
					<IconButton
						size="sm"
						variant="muted"
						icon="chevron-right"
						label="Следующая страница"
						title="Вперёд"
						:disabled="isLoadingSelection || currentPage >= totalPages"
						@click="goToNextPage"
					/>
					<IconButton
						size="sm"
						variant="muted"
						icon="rotate-ccw"
						label="Обновить чаты"
						title="Перезагрузить список чатов"
						:loading="isRefreshingChats"
						@click="refreshData"
					/>
				</div>
			</Toolbar>
		</template>

		<template #message>
			<StatusBanner
				v-if="screenMessage"
				:kind="screenMessage.kind"
				:text="screenMessage.text"
			/>
		</template>

		<div
			class="grid h-full min-h-0 flex-1 grid-cols-1 items-stretch gap-3 overflow-hidden xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]"
		>
			<PanelFrame class="min-h-0">
				<div
					class="shrink-0 border-b border-solid border-[var(--background-modifier-border)] pb-3"
				>
					<div
						class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					>
						Selection
					</div>
					<div class="mt-2 text-xs text-[var(--text-muted)]">
						{{ selectionSummary }}
					</div>
					<div class="mt-2 flex flex-wrap gap-2">
						<SummaryChip :text="`Chats: ${chats.length}`" />
						<SummaryChip :text="`Raw: ${rawMessageCount}`" />
						<SummaryChip :text="`Filtered: ${filteredMessageCount}`" />
						<SummaryChip :text="`Page: ${currentPage}/${totalPages}`" />
						<SummaryChip
							:text="`Limit: ${selectedSelectionSnapshot.pageLimit}`"
						/>
					</div>
					<div class="mt-2 flex flex-wrap gap-2 text-xs">
						<label
							class="inline-flex items-center gap-1 rounded-full border border-solid border-[var(--background-modifier-border)] px-2 py-1"
						>
							<input v-model="includeReplies" type="checkbox" />
							<span>Replies</span>
						</label>
						<label
							class="inline-flex items-center gap-1 rounded-full border border-solid border-[var(--background-modifier-border)] px-2 py-1"
						>
							<input v-model="includeServiceMessages" type="checkbox" />
							<span>Service</span>
						</label>
						<label
							class="inline-flex items-center gap-1 rounded-full border border-solid border-[var(--background-modifier-border)] px-2 py-1"
						>
							<input v-model="includeMediaOnlyMessages" type="checkbox" />
							<span>Media only</span>
						</label>
					</div>
					<div class="mt-2 text-[11px] text-[var(--text-muted)]">
						{{
							selectedChatFullRange.oldestTimestampUtc
								? `Диапазон в базе: ${formatDate(selectedChatFullRange.newestTimestampUtc)} — ${formatDate(selectedChatFullRange.oldestTimestampUtc)}`
								: 'Диапазон в базе: нет сообщений'
						}}
					</div>
				</div>

				<div class="mt-3 flex flex-col gap-2">
					<SectionHeader
						title="Steps"
						subtitle="Запускайте каждый шаг вручную и смотрите preview ниже."
					/>
					<MessageCard
						v-for="step in pipelineSteps"
						:key="step.key"
						clickable
						:selected="selectedStepKey === step.key"
						compact
						@click="selectedStepKey = step.key"
					>
						<template #title>
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									{{ step.title }}
								</div>
								<SummaryChip
									size="xs"
									:variant="getStatusVariant(stepStates[step.key].status)"
									:text="getStepStatusText(step.key)"
								/>
							</div>
						</template>
						<template #body>
							<div class="text-[12px] leading-snug text-[var(--text-muted)]">
								{{ step.description }}
							</div>
						</template>
						<template #footer>
							<div class="flex flex-wrap items-center gap-2">
								<SummaryChip
									size="xs"
									:text="stepStates[step.key].summary"
									:variant="getStatusVariant(stepStates[step.key].status)"
								/>
								<IconButton
									size="sm"
									variant="accent"
									icon="play"
									:label="`Run ${step.title}`"
									:title="`Запустить ${step.title.toLowerCase()}`"
									:disabled="isRunningStep !== null || isLoadingSelection"
									:loading="isRunningStep === step.key"
									@click.stop="runSelectedStep(step.key)"
								/>
							</div>
						</template>
					</MessageCard>
				</div>
			</PanelFrame>

			<PanelFrame
				class="min-h-0 overflow-hidden"
				padding="md"
				gap="md"
				:scroll="false"
			>
				<div class="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
					<div
						class="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-solid border-[var(--background-modifier-border)] pb-3"
					>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-semibold leading-snug">
								{{ selectedChatLabel }}
							</div>
							<div class="mt-1 text-xs text-[var(--text-muted)]">
								chatId: {{ selectedChatId || '—' }} · type:
								{{ selectedChatType }} · page {{ currentPage }}/{{ totalPages }}
							</div>
						</div>
						<div class="flex flex-wrap gap-2">
							<SummaryChip
								:text="vectorHealthText"
								:variant="isVectorReady ? 'success' : 'warning'"
								icon="activity"
							/>
							<SummaryChip
								:text="`mode: ${selectedSelectionSnapshot.includeReplies ? 'replies' : 'no replies'}`"
							/>
						</div>
					</div>

					<PlaceholderState
						v-if="isLoadingSelection"
						variant="loading"
						text="Загружаем selection slice..."
					/>

					<PlaceholderState
						v-else-if="!selectedChat"
						variant="empty"
						text="Выберите чат слева, чтобы увидеть runtime и прогнать pipeline."
					/>

					<div
						v-else
						class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
					>
						<div class="flex flex-wrap gap-2">
							<SummaryChip
								:text="`Normalize: ${stepStates.normalize.status}`"
							/>
							<SummaryChip :text="`Chunk: ${stepStates.chunk.status}`" />
							<SummaryChip :text="`Embed: ${stepStates.embed.status}`" />
							<SummaryChip :text="`Filtered: ${filteredMessageCount}`" />
							<SummaryChip :text="`Payloads: ${embeddingPayloads.length}`" />
							<SummaryChip :text="`Responses: ${embeddingResults.length}`" />
						</div>

						<SectionHeader
							:title="previewTitle"
							:subtitle="`${selectedStepState.summary} · ${previewSubtitle}`"
						/>

						<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									class="rounded-full border border-solid px-3 py-1 text-xs transition-colors"
									:class="
										selectedPreview === 'raw'
											? 'border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/10'
											: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
									"
									@click="selectedPreview = 'raw'"
								>
									Raw
								</button>
								<button
									type="button"
									class="rounded-full border border-solid px-3 py-1 text-xs transition-colors"
									:class="
										selectedPreview === 'normalize'
											? 'border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/10'
											: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
									"
									@click="selectedPreview = 'normalize'"
								>
									Normalize
								</button>
								<button
									type="button"
									class="rounded-full border border-solid px-3 py-1 text-xs transition-colors"
									:class="
										selectedPreview === 'chunk'
											? 'border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/10'
											: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
									"
									@click="selectedPreview = 'chunk'"
								>
									Chunk
								</button>
								<button
									type="button"
									class="rounded-full border border-solid px-3 py-1 text-xs transition-colors"
									:class="
										selectedPreview === 'embed'
											? 'border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/10'
											: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
									"
									@click="selectedPreview = 'embed'"
								>
									Embed
								</button>
							</div>

							<div
								v-if="selectedPreview === 'raw'"
								class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
							>
								<MessageCard
									v-for="message in rawSlicePreview"
									:key="message.messagePk"
									compact
								>
									<template #title>
										<div class="flex items-center gap-2">
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
												:style="{
													backgroundColor: getMessageAccent(message).bg,
												}"
											>
												{{ getMessageInitials(message) }}
											</div>
											<div class="min-w-0">
												<div class="truncate text-sm font-semibold">
													{{ getMessageAuthorLabel(message) }}
												</div>
												<div class="text-[11px] text-[var(--text-muted)]">
													{{ formatDate(message.timestampUtc) }}
												</div>
											</div>
										</div>
									</template>
									<template #body>
										<div
											class="whitespace-pre-wrap text-[13px] leading-5 text-[var(--text-normal)]"
										>
											{{
												message.textNormalized ||
												message.textRaw ||
												'Сообщение без текста'
											}}
										</div>
									</template>
								</MessageCard>
							</div>

							<div
								v-else-if="selectedPreview === 'normalize'"
								class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
							>
								<DiffPreview
									v-if="sampleNormalizedRecord && rawSlicePreview[0]"
									:previous="
										rawSlicePreview[0].textNormalized ||
										rawSlicePreview[0].textRaw ||
										''
									"
									:current="sampleNormalizedRecord.content"
								/>
								<div
									class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
								>
									<MessageCard
										v-for="item in normalizedPreview"
										:key="item.messagePk"
										compact
										stacked
										:title="`${item.senderLabel} · ${item.kind}`"
										:subtitle="`${item.messageId} · ${formatDate(item.timestampUtc)}`"
										:body="item.content"
									>
										<template #badges>
											<SummaryChip size="xs" :text="item.kind" />
											<SummaryChip size="xs" :text="item.messagePk" />
										</template>
									</MessageCard>
								</div>
							</div>

							<div
								v-else-if="selectedPreview === 'chunk'"
								class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
							>
								<MessageCard
									v-for="chunk in chunkPreview"
									:key="chunk.chunkId"
									compact
									stacked
									:title="chunk.title"
									:subtitle="`${chunk.messageIds.length} messages · ${formatDate(chunk.startTimestampUtc)} → ${formatDate(chunk.endTimestampUtc)}`"
									:body="chunk.content"
								>
									<template #badges>
										<SummaryChip
											size="xs"
											:text="chunk.contentType"
											variant="accent"
										/>
										<SummaryChip
											size="xs"
											:text="chunk.sourceSenders.join(', ')"
										/>
									</template>
								</MessageCard>
							</div>

							<div
								v-else
								class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
							>
								<MessageCard
									v-if="embedPreview[0]"
									title="Embedding payload"
									compact
								>
									<template #body>
										<pre
											class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
											>{{ JSON.stringify(embedPreview[0], null, 2) }}
										</pre
										>
									</template>
								</MessageCard>

								<MessageCard title="Vector response" compact>
									<template #body>
										<pre
											class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
											>{{ JSON.stringify(embeddingResults, null, 2) }}
										</pre
										>
									</template>
								</MessageCard>
							</div>
						</div>
					</div>
				</div>
			</PanelFrame>
		</div>
	</AppShell>
	<div v-else class="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
		<div class="shrink-0">
			<Toolbar>
				<div class="flex min-w-0 flex-1 flex-wrap items-stretch gap-2">
					<div
						class="flex min-w-0 flex-[2] flex-nowrap items-center gap-1 rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-1 py-0"
					>
						<div class="min-w-0 flex-1 basis-0">
							<label class="sr-only" for="pipeline-chat-select-embedded"
								>Chat</label
							>
							<select
								id="pipeline-chat-select-embedded"
								v-model="selectedChatId"
								:class="toolbarFieldClass"
								:disabled="isRefreshingChats || chats.length === 0"
								@change="handleChatSelection(selectedChatId || '')"
							>
								<option value="">Select chat</option>
								<option
									v-for="chat in chats"
									:key="chat.chatId"
									:value="chat.chatId"
								>
									{{ chat.title }} ? {{ chat.type }} ? {{ chat.messageCount }}
								</option>
							</select>
						</div>
					</div>

					<div class="w-24">
						<IconTextField
							v-model="pageLimitValue"
							:input-class="fieldClass"
							icon="hash"
							icon-label="Slice size"
							placeholder="60"
							submit-on-enter
							@enter="handlePageSubmit"
						/>
					</div>

					<div class="w-24">
						<IconTextField
							v-model="pageNumberValue"
							:input-class="fieldClass"
							icon="layers-3"
							icon-label="Page number"
							placeholder="1"
							submit-on-enter
							@enter="handlePageSubmit"
						/>
					</div>

					<div class="w-24">
						<IconTextField
							v-model="chunkSizeValue"
							:input-class="fieldClass"
							icon="box"
							icon-label="Chunk size"
							placeholder="6"
							submit-on-enter
							@enter="handlePageSubmit"
						/>
					</div>

					<div class="w-24">
						<IconTextField
							v-model="gapMinutesValue"
							:input-class="fieldClass"
							icon="clock"
							icon-label="Gap minutes"
							placeholder="30"
							submit-on-enter
							@enter="handlePageSubmit"
						/>
					</div>

					<IconButton
						size="sm"
						variant="accent"
						icon="play"
						label="Load slice"
						title="Load selection slice"
						:loading="isLoadingSelection"
						:disabled="isRefreshingChats || chats.length === 0"
						@click="handlePageSubmit"
					/>
				</div>
			</Toolbar>
		</div>

		<div class="shrink-0">
			<StatusBanner
				v-if="screenMessage"
				:kind="screenMessage.kind"
				:text="screenMessage.text"
			/>
		</div>

		<div
			class="grid h-full min-h-0 flex-1 grid-cols-1 items-stretch gap-3 overflow-hidden xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]"
		>
			<PanelFrame class="min-h-0">
				<div
					class="shrink-0 border-b border-solid border-[var(--background-modifier-border)] pb-3"
				>
					<div
						class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					>
						Selection
					</div>
					<div class="mt-2 text-xs text-[var(--text-muted)]">
						{{ selectionSummary }}
					</div>
					<div class="mt-2 flex flex-wrap gap-2">
						<SummaryChip :text="`Chats: ${chats.length}`" />
						<SummaryChip :text="`Raw: ${rawMessageCount}`" />
						<SummaryChip :text="`Filtered: ${filteredMessageCount}`" />
						<SummaryChip :text="`Page: ${currentPage}/${totalPages}`" />
					</div>
					<div class="mt-2 flex flex-wrap gap-2 text-xs">
						<label
							class="inline-flex items-center gap-1 rounded-full border border-solid border-[var(--background-modifier-border)] px-2 py-1"
						>
							<input v-model="includeReplies" type="checkbox" />
							<span>Replies</span>
						</label>
						<label
							class="inline-flex items-center gap-1 rounded-full border border-solid border-[var(--background-modifier-border)] px-2 py-1"
						>
							<input v-model="includeServiceMessages" type="checkbox" />
							<span>Service</span>
						</label>
						<label
							class="inline-flex items-center gap-1 rounded-full border border-solid border-[var(--background-modifier-border)] px-2 py-1"
						>
							<input v-model="includeMediaOnlyMessages" type="checkbox" />
							<span>Media only</span>
						</label>
					</div>
					<div class="mt-2 text-[11px] text-[var(--text-muted)]">
						{{
							selectedChatFullRange.oldestTimestampUtc
								? `Range in DB: ${formatDate(selectedChatFullRange.newestTimestampUtc)} — ${formatDate(selectedChatFullRange.oldestTimestampUtc)}`
								: 'Range in DB: no messages'
						}}
					</div>
				</div>

				<div class="mt-3 flex flex-col gap-2">
					<SectionHeader
						title="Steps"
						subtitle="Run steps manually and validate artifacts."
					/>
					<MessageCard
						v-for="step in pipelineSteps"
						:key="step.key"
						clickable
						:selected="selectedStepKey === step.key"
						compact
						@click="selectedStepKey = step.key"
					>
						<template #title>
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">{{ step.title }}</div>
								<SummaryChip
									size="xs"
									:variant="getStatusVariant(stepStates[step.key].status)"
									:text="getStepStatusText(step.key)"
								/>
							</div>
						</template>
						<template #body>
							<div class="text-[12px] leading-snug text-[var(--text-muted)]">
								{{ step.description }}
							</div>
						</template>
						<template #footer>
							<div class="flex flex-wrap items-center gap-2">
								<SummaryChip
									size="xs"
									:text="stepStates[step.key].summary"
									:variant="getStatusVariant(stepStates[step.key].status)"
								/>
								<IconButton
									size="sm"
									variant="accent"
									icon="play"
									:label="`Run ${step.title}`"
									:title="`Run ${step.title.toLowerCase()}`"
									:disabled="isRunningStep !== null || isLoadingSelection"
									:loading="isRunningStep === step.key"
									@click.stop="runSelectedStep(step.key)"
								/>
							</div>
						</template>
					</MessageCard>
				</div>
			</PanelFrame>

			<PanelFrame
				class="min-h-0 overflow-hidden"
				padding="md"
				gap="md"
				:scroll="false"
			>
				<div class="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
					<div
						class="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-solid border-[var(--background-modifier-border)] pb-3"
					>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-semibold leading-snug">
								{{ selectedChatLabel }}
							</div>
							<div class="mt-1 text-xs text-[var(--text-muted)]">
								chatId: {{ selectedChatId || '?' }} ? type:
								{{ selectedChatType }} ? page {{ currentPage }}/{{ totalPages }}
							</div>
						</div>
						<div class="flex flex-wrap gap-2">
							<SummaryChip
								:text="vectorHealthText"
								:variant="isVectorReady ? 'success' : 'warning'"
								icon="activity"
							/>
						</div>
					</div>

					<PlaceholderState
						v-if="isLoadingSelection"
						variant="loading"
						text="Loading selection slice..."
					/>

					<PlaceholderState
						v-else-if="!selectedChat"
						variant="empty"
						text="Select a chat on the left to inspect the runtime and run the pipeline."
					/>

					<div
						v-else
						class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
					>
						<div class="flex flex-wrap gap-2">
							<SummaryChip
								:text="`Normalize: ${stepStates.normalize.status}`"
							/>
							<SummaryChip :text="`Chunk: ${stepStates.chunk.status}`" />
							<SummaryChip :text="`Embed: ${stepStates.embed.status}`" />
							<SummaryChip :text="`Filtered: ${filteredMessageCount}`" />
							<SummaryChip :text="`Payloads: ${embeddingPayloads.length}`" />
						</div>

						<SectionHeader
							:title="previewTitle"
							:subtitle="`${selectedStepState.summary} · ${previewSubtitle}`"
						/>

						<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									class="rounded-full border border-solid px-3 py-1 text-xs transition-colors"
									:class="
										selectedPreview === 'raw'
											? 'border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/10'
											: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
									"
									@click="selectedPreview = 'raw'"
								>
									Raw
								</button>
								<button
									type="button"
									class="rounded-full border border-solid px-3 py-1 text-xs transition-colors"
									:class="
										selectedPreview === 'normalize'
											? 'border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/10'
											: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
									"
									@click="selectedPreview = 'normalize'"
								>
									Normalize
								</button>
								<button
									type="button"
									class="rounded-full border border-solid px-3 py-1 text-xs transition-colors"
									:class="
										selectedPreview === 'chunk'
											? 'border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/10'
											: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
									"
									@click="selectedPreview = 'chunk'"
								>
									Chunk
								</button>
								<button
									type="button"
									class="rounded-full border border-solid px-3 py-1 text-xs transition-colors"
									:class="
										selectedPreview === 'embed'
											? 'border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/10'
											: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
									"
									@click="selectedPreview = 'embed'"
								>
									Embed
								</button>
							</div>

							<div
								v-if="selectedPreview === 'raw'"
								class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
							>
								<MessageCard
									v-for="message in rawSlicePreview"
									:key="message.messagePk"
									compact
								>
									<template #title>
										<div class="flex items-center gap-2">
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
												:style="{
													backgroundColor: getMessageAccent(message).bg,
												}"
											>
												{{ getMessageInitials(message) }}
											</div>
											<div class="min-w-0">
												<div class="truncate text-sm font-semibold">
													{{ getMessageAuthorLabel(message) }}
												</div>
												<div class="text-[11px] text-[var(--text-muted)]">
													{{ formatDate(message.timestampUtc) }}
												</div>
											</div>
										</div>
									</template>
									<template #body>
										<div
											class="whitespace-pre-wrap text-[13px] leading-5 text-[var(--text-normal)]"
										>
											{{
												message.textNormalized ||
												message.textRaw ||
												'Message without text'
											}}
										</div>
									</template>
								</MessageCard>
							</div>

							<div
								v-else-if="selectedPreview === 'normalize'"
								class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
							>
								<DiffPreview
									v-if="sampleNormalizedRecord && rawSlicePreview[0]"
									:previous="
										rawSlicePreview[0].textNormalized ||
										rawSlicePreview[0].textRaw ||
										''
									"
									:current="sampleNormalizedRecord.content"
								/>
								<div
									class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
								>
									<MessageCard
										v-for="item in normalizedPreview"
										:key="item.messagePk"
										compact
										stacked
										:title="`${item.senderLabel} ? ${item.kind}`"
										:subtitle="`${item.messageId} ? ${formatDate(item.timestampUtc)}`"
										:body="item.content"
									>
										<template #badges>
											<SummaryChip size="xs" :text="item.kind" />
											<SummaryChip size="xs" :text="item.messagePk" />
										</template>
									</MessageCard>
								</div>
							</div>

							<div
								v-else-if="selectedPreview === 'chunk'"
								class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
							>
								<MessageCard
									v-for="chunk in chunkPreview"
									:key="chunk.chunkId"
									compact
									stacked
									:title="chunk.title"
									:subtitle="`${chunk.messageIds.length} messages ? ${formatDate(chunk.startTimestampUtc)} ? ${formatDate(chunk.endTimestampUtc)}`"
									:body="chunk.content"
								>
									<template #badges>
										<SummaryChip
											size="xs"
											:text="chunk.contentType"
											variant="accent"
										/>
										<SummaryChip
											size="xs"
											:text="chunk.sourceSenders.join(', ')"
										/>
									</template>
								</MessageCard>
							</div>

							<div
								v-else
								class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
							>
								<MessageCard
									v-if="embedPreview[0]"
									title="Embedding payload"
									compact
								>
									<template #body>
										<pre
											class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
											>{{ JSON.stringify(embedPreview[0], null, 2) }}</pre
										>
									</template>
								</MessageCard>
								<MessageCard title="Vector response" compact>
									<template #body>
										<pre
											class="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-normal)]"
											>{{ JSON.stringify(embeddingResults, null, 2) }}</pre
										>
									</template>
								</MessageCard>
							</div>
						</div>
					</div>
				</div>
			</PanelFrame>
		</div>
	</div>
</template>
