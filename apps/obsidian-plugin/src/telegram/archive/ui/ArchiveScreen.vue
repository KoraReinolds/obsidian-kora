<script setup lang="ts">
import {
	AppShell,
	DetailsPane,
	EmptyState,
	EntityListPane,
	IconButton,
	IconTextField,
	LoadingState,
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
}>();

const model = useArchiveScreen({
	transport: props.transport,
	defaultPeer: props.defaultPeer,
	defaultSyncLimit: props.defaultSyncLimit,
	recentMessagesLimit: props.recentMessagesLimit,
});

const {
	peerInputValue,
	selectedFolderLabel,
	searchQuery,
	filteredChats,
	chats,
	selectedChatId,
	selectedChatMessages,
	orderedSelectedChatMessages,
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
	formatMessageMeta,
	getMessageAuthorLabel,
	getMessageInitials,
	getMessageAccent,
	getReplyPreview,
	getMediaItems,
	isImageAttachment,
	resolveAttachmentSrc,
	summarizeMessagePayload,
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
			/>
		</template>

		<div
			v-if="activeTab === 'archive'"
			class="grid h-full min-h-0 flex-1 grid-cols-1 items-stretch gap-3 overflow-hidden lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]"
		>
			<EntityListPane class="min-h-0">
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
					<EmptyState
						v-if="filteredChats.length === 0"
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
						<button
							type="button"
							class="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 rounded-2xl border border-solid px-3 py-3 text-left shadow-sm transition-[border-color,box-shadow] hover:border-[var(--interactive-accent-hover)] hover:shadow"
							:class="
								selectedChatId === chat?.chatId
									? 'border-[var(--interactive-accent)] bg-[var(--background-modifier-hover)] ring-1 ring-[var(--interactive-accent)]/25'
									: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
							"
							@click="chat?.chatId && handleChatSelection(chat.chatId)"
						>
							<div class="min-w-0 w-full truncate text-sm font-semibold">
								{{ chat?.title || 'Без названия' }}
							</div>
							<div class="text-xs text-[var(--text-muted)]">
								{{ chat?.type || 'unknown' }} · {{ chat?.messageCount || 0 }}
								сообщений
							</div>
							<div class="text-xs text-[var(--text-muted)]">
								chatId: {{ chat?.chatId }}
							</div>
						</button>
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
			</EntityListPane>

			<DetailsPane
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

					<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
						<LoadingState
							v-if="isLoadingMessages"
							text="Загружаем страницу сообщений..."
						/>
						<EmptyState
							v-else-if="selectedChatMessages.length === 0"
							text="В этом чате пока нет архивных сообщений."
						/>
						<div
							v-else
							class="kora-archive-thread flex min-h-0 flex-1 flex-col overflow-y-scroll overflow-x-hidden rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[#161616] p-3"
						>
							<div
								v-for="message in orderedSelectedChatMessages"
								:key="message.messagePk"
								:id="`archive-message-${message.messageId}`"
								class="mb-3 flex items-end gap-2 last:mb-0"
							>
								<div
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white/95 shadow-sm"
									:style="{ backgroundColor: getMessageAccent(message).bg }"
								>
									{{ getMessageInitials(message) }}
								</div>

								<div
									class="max-w-[min(100%,48rem)] min-w-0 rounded-[18px] border px-3 py-2.5 shadow-sm"
									:style="{
										backgroundColor:
											highlightedMessageId === message.messageId
												? 'rgba(255, 214, 10, 0.12)'
												: 'rgba(29, 29, 29, 0.96)',
										borderColor:
											highlightedMessageId === message.messageId
												? 'rgba(255, 214, 10, 0.35)'
												: 'rgba(255, 255, 255, 0.08)',
										color: 'var(--text-normal)',
									}"
								>
									<div class="mb-1 flex items-center gap-2">
										<div
											class="truncate text-sm font-semibold"
											:style="{ color: 'var(--text-normal)' }"
										>
											{{ getMessageAuthorLabel(message) }}
										</div>
										<div class="truncate text-[11px] text-[var(--text-muted)]">
											{{ formatMessageMeta(message) }}
										</div>
									</div>

									<div
										v-if="getReplyPreview(message)"
										class="mb-2 cursor-pointer rounded-2xl border border-solid px-3 py-2 transition-colors hover:bg-white/6"
										:style="{
											borderColor: 'rgba(255, 255, 255, 0.08)',
											backgroundColor: 'rgba(255, 255, 255, 0.03)',
										}"
										@click="
											message.replyToMessageId &&
											jumpToMessageInCurrentView(message.replyToMessageId)
										"
									>
										<div
											class="text-[11px] font-semibold text-[var(--text-muted)]"
										>
											{{ getReplyPreview(message)?.author }}
										</div>
										<div class="line-clamp-2 text-xs text-[var(--text-muted)]">
											{{ getReplyPreview(message)?.text }}
										</div>
									</div>

									<div
										v-if="(message.forward as any)?.forwardedFrom"
										class="mb-2 text-xs text-[var(--text-muted)]"
									>
										Переслано из
										{{ (message.forward as any).forwardedFrom }}
									</div>

									<div
										v-if="message.textNormalized || message.textRaw"
										class="whitespace-pre-wrap text-sm leading-6"
									>
										{{ message.textNormalized || message.textRaw }}
									</div>

									<div
										v-for="(attachment, index) in getMediaItems(message)"
										:key="`${message.messagePk}-attachment-${index}`"
										class="mt-2 overflow-hidden rounded-2xl border border-solid bg-[rgba(255,255,255,0.03)]"
										:style="{ borderColor: 'rgba(255, 255, 255, 0.08)' }"
									>
										<img
											v-if="
												isImageAttachment(attachment) &&
												resolveAttachmentSrc(attachment)
											"
											:src="resolveAttachmentSrc(attachment) || undefined"
											alt=""
											class="block max-h-72 w-full object-cover"
										/>
										<div class="p-3">
											<div class="text-sm font-medium">
												{{
													String(
														attachment.fileName ||
															attachment.relativePath ||
															attachment.kind ||
															'Вложение'
													)
												}}
											</div>
											<div class="mt-1 text-xs text-[var(--text-muted)]">
												{{ String(attachment.kind || 'file') }}
												<span v-if="attachment.size">
													· {{ attachment.size }} bytes
												</span>
												<span v-if="attachment.mimeType">
													· {{ String(attachment.mimeType) }}
												</span>
											</div>
										</div>
									</div>

									<div
										v-if="(message.reactions as any[])?.length"
										class="mt-2 flex flex-wrap gap-1.5"
									>
										<div
											v-for="(reaction, index) in message.reactions as any[]"
											:key="`${message.messagePk}-reaction-${index}`"
											class="rounded-full border border-solid px-2 py-0.5 text-xs"
											:style="{
												borderColor: 'rgba(255, 255, 255, 0.08)',
												backgroundColor: 'rgba(255, 255, 255, 0.05)',
											}"
										>
											{{ reaction.emoji || reaction.type || 'reaction' }}
											<span v-if="reaction.count"> {{ reaction.count }}</span>
										</div>
									</div>

									<div
										v-if="summarizeMessagePayload(message).length"
										class="mt-2 flex flex-wrap gap-1.5"
									>
										<div
											v-for="hint in summarizeMessagePayload(message)"
											:key="`${message.messagePk}-${hint}`"
											class="rounded-full px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
											:style="{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }"
										>
											{{ hint }}
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
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
			</DetailsPane>
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
			<EmptyState v-else text="Pipeline transport недоступен." />
		</div>
	</AppShell>
</template>

<style scoped>
.kora-archive-thread {
	scrollbar-width: thin;
	scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}

.kora-archive-thread::-webkit-scrollbar {
	width: 10px;
}

.kora-archive-thread::-webkit-scrollbar-thumb {
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.14);
}

.kora-archive-thread::-webkit-scrollbar-track {
	background: transparent;
}
</style>
