<script setup lang="ts">
import {
	AppShell,
	ChatTimeline,
	IconButton,
	IconTextField,
	MessageCard,
	PanelFrame,
	PlaceholderState,
	StatusBanner,
	SummaryChip,
	Toolbar,
} from '../../../ui-vue';
import { ref, watch } from 'vue';
import { useArchiveScreen } from '../model/use-archive-screen';
import type { ArchiveTransportPort } from '../ports/archive-transport-port';
import { PipelineRuntimeScreen } from '../../pipeline';
import type { PipelineRuntimeTransportPort } from '../../pipeline';

const props = defineProps<{
	transport: ArchiveTransportPort;
	pipelineTransport?: PipelineRuntimeTransportPort;
	defaultPeer?: string;
	defaultSyncLimit: number;
	recentMessagesLimit: number;
	defaultChunkSize?: number;
	defaultGapMinutes?: number;
	resolveAttachmentSrc?: (absolutePath: string) => string | null;
}>();

const model = useArchiveScreen({
	transport: props.transport,
	defaultPeer: props.defaultPeer,
	defaultSyncLimit: props.defaultSyncLimit,
	recentMessagesLimit: props.recentMessagesLimit,
	resolveAttachmentSrc: props.resolveAttachmentSrc,
});

const {
	peerInputValue,
	selectedFolderLabel,
	searchQuery,
	filteredChats,
	chats,
	selectedChatId,
	selectedChatMessages,
	selectedTimelineItems,
	selectedChat,
	selectedMessageStats,
	currentPage,
	totalPages,
	canGoPrevPage,
	canGoNextPage,
	isRefreshing,
	isLoadingMessages,
	isSyncing,
	isDeletingChatId,
	highlightedMessageId,
	screenMessage,
	clearScreenMessage,
	refreshData,
	handleDesktopExportSelection,
	handleChatSelection,
	goToPrevPage,
	goToNextPage,
	goToPage,
	reloadCurrentPage,
	jumpToMessageInCurrentView,
	visibleRangeText,
	fullTimeRangeText,
	handleDeleteChat,
	formatDate,
} = model;

const fileInputRef = ref<HTMLInputElement | null>(null);
const pageInputValue = ref('1');
const activeTab = ref<'archive' | 'pipeline'>('archive');

watch(
	() => currentPage.value,
	value => {
		pageInputValue.value = String(value);
	},
	{ immediate: true }
);

const fieldClass =
	'box-border h-8 min-h-8 w-full min-w-0 rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-0 text-sm text-[var(--text-normal)] focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--interactive-accent)] focus-within:ring-offset-1 focus-within:ring-offset-[var(--background-secondary)]';

const toolbarFieldClass =
	'box-border h-8 min-h-8 w-full min-w-0 rounded-md border-0 bg-transparent px-0 text-sm text-[var(--text-normal)] focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--interactive-accent)] focus-within:ring-inset';

const handlePageInputSubmit = (): void => {
	const page = Number(pageInputValue.value);
	if (!Number.isFinite(page) || page <= 0) {
		pageInputValue.value = String(currentPage.value);
		return;
	}
	void goToPage(page);
};

const openDirectoryPicker = (): void => {
	fileInputRef.value?.click();
};

const handleFileSelection = async (event: Event): Promise<void> => {
	const input = event.target as HTMLInputElement;
	if (!input.files || input.files.length === 0) {
		return;
	}
	await handleDesktopExportSelection(input.files);
	input.value = '';
};

const handleTimelineJump = (targetId: string): void => {
	const numericId = Number(targetId);
	if (!Number.isFinite(numericId)) {
		return;
	}
	jumpToMessageInCurrentView(numericId);
};

void refreshData();
</script>

<template>
	<AppShell title="Архив Telegram">
		<template #toolbar>
			<Toolbar>
				<div class="flex min-w-0 w-full flex-wrap items-stretch gap-2">
					<div class="flex shrink-0 items-center gap-1">
						<button
							type="button"
							class="rounded-full border border-solid px-3 py-1.5 text-xs font-medium transition-colors"
							:class="
								activeTab === 'archive'
									? 'border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/12 text-[var(--text-normal)]'
									: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)] text-[var(--text-muted)]'
							"
							@click="activeTab = 'archive'"
						>
							Просмотр
						</button>
						<button
							type="button"
							class="rounded-full border border-solid px-3 py-1.5 text-xs font-medium transition-colors"
							:class="
								activeTab === 'pipeline'
									? 'border-[var(--interactive-accent)] bg-[var(--interactive-accent)]/12 text-[var(--text-normal)]'
									: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)] text-[var(--text-muted)]'
							"
							@click="activeTab = 'pipeline'"
						>
							Pipeline
						</button>
					</div>
					<div
						v-if="activeTab === 'archive'"
						class="flex min-w-0 flex-1 flex-nowrap items-stretch gap-2"
					>
						<input
							ref="fileInputRef"
							type="file"
							multiple
							class="hidden"
							webkitdirectory
							directory
							@change="handleFileSelection"
						/>
						<div
							class="flex min-w-0 flex-1 flex-nowrap items-center gap-1 rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-1 py-0"
						>
							<div class="min-w-0 flex-1 basis-0">
								<IconTextField
									v-model="peerInputValue"
									:input-class="toolbarFieldClass"
									icon="folder-open"
									icon-label="Выбранный Telegram Desktop export"
									placeholder="Выберите папку Telegram Desktop export"
									:disabled="true"
								/>
							</div>
							<IconButton
								size="sm"
								variant="accent"
								icon="folder-open"
								label="Выбрать папку Telegram Desktop export"
								title="Выбрать папку"
								:disabled="isSyncing || isRefreshing"
								:loading="isSyncing"
								@click="openDirectoryPicker"
							/>
						</div>
						<div
							class="flex shrink-0 items-center border-l border-solid border-[var(--background-modifier-border)] pl-2"
						>
							<IconButton
								size="sm"
								variant="muted"
								icon="rotate-ccw"
								label="Обновить список архивных чатов"
								title="Обновить"
								:disabled="isRefreshing || isSyncing"
								:loading="isRefreshing"
								@click="refreshData"
							/>
						</div>
					</div>
				</div>
			</Toolbar>
		</template>

		<template #message>
			<StatusBanner
				v-if="screenMessage"
				:kind="screenMessage.kind"
				:text="screenMessage.text"
				@dismiss="clearScreenMessage"
			/>
		</template>

		<div
			v-if="activeTab === 'archive'"
			class="grid h-full min-h-0 flex-1 grid-cols-1 items-stretch gap-3 overflow-hidden lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]"
		>
			<PanelFrame class="min-h-0">
				<div
					class="shrink-0 border-b border-solid border-[var(--background-modifier-border)] pb-3"
				>
					<div
						class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					>
						Архивные чаты
					</div>
					<div class="mt-2 text-xs text-[var(--text-muted)]">
						Экран читает локальный SQLite-архив и показывает его в более
						нативном формате, не меняя исходную структуру данных.
					</div>
					<div
						v-if="selectedFolderLabel"
						class="mt-2 text-xs text-[var(--text-muted)]"
					>
						Последний выбранный export: {{ selectedFolderLabel }}
					</div>
					<div class="mt-2">
						<IconTextField
							v-model="searchQuery"
							:input-class="fieldClass"
							icon="search"
							icon-label="Поиск по архивным чатам"
							placeholder="Название, тип, chatId"
						/>
					</div>
				</div>

				<div class="mt-3 flex flex-wrap gap-2">
					<SummaryChip :text="`Чатов: ${chats.length}`" />
					<SummaryChip :text="`Найдено: ${filteredChats.length}`" />
				</div>

				<div
					class="isolate mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden pb-2 pr-1"
				>
					<PlaceholderState
						v-if="filteredChats.length === 0"
						variant="empty"
						:text="
							chats.length === 0
								? 'Архив пока пуст. Импортируйте Telegram Desktop export сверху.'
								: 'По текущему поиску чаты не найдены.'
						"
					/>
					<div
						v-for="(chat, index) in filteredChats"
						:key="chat?.chatId || `chat-fallback-${index}`"
						class="flex min-w-0 shrink-0 items-center gap-1.5"
					>
						<MessageCard
							class="min-w-0 flex-1 shadow-sm"
							compact
							:selected="selectedChatId === chat?.chatId"
							:clickable="true"
							:title="chat?.title || 'Без названия'"
							:subtitle="`${chat?.type || 'unknown'} · ${chat?.messageCount || 0} сообщений`"
							:meta="chat?.chatId != null ? `chatId: ${chat.chatId}` : ''"
							@click="chat?.chatId && handleChatSelection(chat.chatId)"
						/>
						<IconButton
							size="sm"
							variant="danger"
							icon="trash-2"
							label="Удалить чат из локального архива"
							title="Удалить из архива"
							:disabled="
								isDeletingChatId === chat?.chatId || isRefreshing || isSyncing
							"
							:loading="isDeletingChatId === chat?.chatId"
							@click.stop="chat?.chatId && handleDeleteChat(chat.chatId)"
						/>
					</div>
				</div>
			</PanelFrame>

			<PanelFrame
				class="min-h-0 overflow-hidden"
				padding="md"
				gap="md"
				:scroll="false"
			>
				<div
					v-if="selectedChat"
					class="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden"
				>
					<div
						class="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-solid border-[var(--background-modifier-border)] pb-3"
					>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-semibold leading-snug">
								{{ selectedChat.title }}
							</div>
							<div class="mt-1 text-xs text-[var(--text-muted)]">
								chatId: {{ selectedChat.chatId }}
							</div>
						</div>
						<IconButton
							variant="danger"
							icon="trash-2"
							label="Удалить чат из локального архива"
							title="Удалить из архива"
							:disabled="
								isDeletingChatId === selectedChat.chatId ||
								isRefreshing ||
								isSyncing
							"
							:loading="isDeletingChatId === selectedChat.chatId"
							@click="handleDeleteChat(selectedChat.chatId)"
						/>
					</div>

					<div class="flex flex-wrap gap-2">
						<SummaryChip :text="`Сообщений: ${selectedChat.messageCount}`" />
						<SummaryChip
							:text="`С текстом: ${selectedMessageStats.withText}`"
						/>
						<SummaryChip :text="`С media: ${selectedMessageStats.withMedia}`" />
						<SummaryChip :text="`Service: ${selectedMessageStats.service}`" />
						<SummaryChip
							:text="`Последнее обновление: ${formatDate(selectedChat.lastSyncedAt)}`"
						/>
					</div>

					<div
						class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-solid border-[var(--background-modifier-border)] pb-2"
					>
						<div class="flex items-center gap-2">
							<IconButton
								size="sm"
								variant="muted"
								icon="chevron-left"
								label="Более новые сообщения"
								title="Назад"
								:disabled="isLoadingMessages || !canGoPrevPage"
								@click="goToPrevPage"
							/>
							<div class="w-28">
								<IconTextField
									v-model="pageInputValue"
									:input-class="fieldClass"
									icon="hash"
									icon-label="Номер страницы"
									:placeholder="`стр. ${currentPage}`"
									submit-on-enter
									@enter="handlePageInputSubmit"
								/>
							</div>
							<IconButton
								size="sm"
								variant="muted"
								icon="chevron-right"
								label="Более старые сообщения"
								title="Вперёд"
								:disabled="isLoadingMessages || !canGoNextPage"
								@click="goToNextPage"
							/>
							<IconButton
								size="sm"
								variant="muted"
								icon="rotate-ccw"
								label="Перезагрузить текущую страницу"
								title="Перезагрузить"
								:disabled="isLoadingMessages"
								@click="reloadCurrentPage"
							/>
						</div>
						<div class="text-xs text-[var(--text-muted)]">
							{{ visibleRangeText }} · страница {{ currentPage }} из
							{{ totalPages }}
						</div>
					</div>

					<div
						class="shrink-0 border-b border-solid border-[var(--background-modifier-border)] pb-2 text-xs text-[var(--text-muted)]"
					>
						{{ fullTimeRangeText }}
					</div>

					<ChatTimeline
						:items="selectedTimelineItems"
						:loading="isLoadingMessages"
						empty-text="В этом чате пока нет архивных сообщений."
						:highlighted-item-id="
							highlightedMessageId ? String(highlightedMessageId) : null
						"
						@jump="handleTimelineJump"
					/>
				</div>

				<div
					v-else
					class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center"
				>
					<div class="text-sm font-semibold">Ничего не выбрано</div>
					<div class="max-w-sm text-xs text-[var(--text-muted)]">
						Импортируйте архив Telegram Desktop export или выберите чат слева.
					</div>
				</div>
			</PanelFrame>
		</div>
		<div v-else class="flex min-h-0 flex-1 overflow-hidden">
			<PipelineRuntimeScreen
				v-if="pipelineTransport"
				:transport="pipelineTransport"
				:default-page-limit="recentMessagesLimit"
				:default-chunk-size="defaultChunkSize || 6"
				:default-gap-minutes="defaultGapMinutes || 30"
				:embedded="true"
			/>
			<PlaceholderState
				v-else
				variant="empty"
				text="Pipeline transport недоступен."
			/>
		</div>
	</AppShell>
</template>
