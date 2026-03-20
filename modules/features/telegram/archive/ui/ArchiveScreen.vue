<script setup lang="ts">
/**
 * @description Reference feature UI для архива Telegram на базе core Vue компонентов.
 */

import {
	AppShell,
	DetailsPane,
	EmptyState,
	EntityListPane,
	LoadingState,
	MessageCard,
	StatusBanner,
	SummaryChip,
	Toolbar,
} from '../../../../core/ui-vue';
import { useArchiveScreen } from '../model/use-archive-screen';
import type { ArchiveTransportPort } from '../ports/archive-transport-port';

const props = defineProps<{
	transport: ArchiveTransportPort;
	defaultPeer?: string;
	defaultSyncLimit: number;
	recentMessagesLimit: number;
}>();

const model = useArchiveScreen({
	transport: props.transport,
	defaultPeer: props.defaultPeer,
	defaultSyncLimit: props.defaultSyncLimit,
	recentMessagesLimit: props.recentMessagesLimit,
});

const {
	peerInputValue,
	searchQuery,
	chats,
	filteredChats,
	selectedChatId,
	selectedChatMessages,
	selectedChatTotal,
	isRefreshing,
	isLoadingMessages,
	isSyncing,
	screenMessage,
	selectedChat,
	refreshData,
	handleSync,
	handleChatSelection,
	formatDate,
} = model;

/**
 * @description Единые стили полей ввода и фокуса для панели и списка чатов.
 */
const fieldClass =
	'h-9 min-h-9 w-full min-w-0 rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2.5 text-sm text-[var(--text-normal)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background-secondary)]';

/**
 * @description Поле внутри уже обведённого блока toolbar — без второй рамки, одна «полоска» снаружи.
 */
const toolbarFieldClass =
	'h-9 min-h-9 w-full min-w-0 rounded-md border-0 bg-transparent px-2.5 text-sm text-[var(--text-normal)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-accent)] focus-visible:ring-inset';

void refreshData();
</script>

<template>
	<AppShell title="Архив Telegram">
		<template #toolbar>
			<Toolbar>
				<div
					class="flex min-w-0 flex-[1_1_280px] flex-wrap items-center gap-2 rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] p-1.5 sm:flex-nowrap"
				>
					<input
						v-model="peerInputValue"
						type="text"
						placeholder="@channel или -1001234567890"
						:class="toolbarFieldClass"
						class="flex-1 sm:min-w-[200px]"
						@keydown.enter.prevent="handleSync"
					/>
					<button
						class="mod-cta h-9 shrink-0 px-3"
						:disabled="isSyncing || isRefreshing"
						@click="handleSync"
					>
						<span v-text="isSyncing ? 'Синхронизация…' : 'Синхронизировать'" />
					</button>
				</div>
				<div
					class="flex shrink-0 items-center self-stretch border-l border-solid border-[var(--background-modifier-border)] pl-2"
				>
					<button
						class="h-9 px-3"
						:disabled="isSyncing || isRefreshing"
						@click="refreshData"
					>
						Обновить
					</button>
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
			class="grid h-full min-h-0 flex-1 grid-cols-1 items-stretch gap-3 overflow-hidden lg:grid-cols-[minmax(288px,380px)_minmax(0,1fr)]"
		>
			<EntityListPane class="min-h-0">
				<div
					class="shrink-0 border-b border-solid border-[var(--background-modifier-border)] pb-3"
				>
					<div
						class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
						v-text="'Чаты'"
					/>
					<input
						v-model="searchQuery"
						type="text"
						placeholder="Поиск по архивным чатам"
						:class="fieldClass"
						class="mt-2"
					/>
					<div class="mt-2 text-xs text-[var(--text-muted)]">
						<span
							v-if="isRefreshing"
							v-text="'Обновляем список чатов…'"
						/>
						<span
							v-else
							v-text="`Архивных чатов: ${filteredChats.length}`"
						/>
					</div>
				</div>
				<div
					class="isolate flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden pb-2 pr-1"
				>
					<EmptyState
						v-if="filteredChats.length === 0"
						:text="
							chats.length === 0
								? 'Пока нет архивных чатов. Введите peer и выполните синхронизацию.'
								: 'По текущему поиску чаты не найдены.'
						"
					/>
					<button
						v-for="(chat, index) in filteredChats"
						:key="chat?.chatId || `chat-fallback-${index}`"
						type="button"
						class="flex w-full min-w-0 shrink-0 cursor-pointer flex-row items-center gap-2 rounded-xl border border-solid px-3 py-2.5 text-left shadow-sm transition-[border-color,box-shadow] hover:border-[var(--interactive-accent-hover)] hover:shadow"
						:class="
							selectedChatId === chat?.chatId
								? 'border-[var(--interactive-accent)] bg-[var(--background-modifier-hover)] ring-1 ring-[var(--interactive-accent)]/25'
								: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
						"
						@click="chat?.chatId && handleChatSelection(chat.chatId)"
					>
						<div
							class="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-[var(--text-normal)]"
						>
							{{ chat?.title || 'Без названия' }}
						</div>
						<div
							class="max-w-[min(100%,12.5rem)] shrink-0 truncate text-right text-[11px] leading-tight tabular-nums text-[var(--text-muted)]"
						>
							<span
								v-text="`${chat?.messageCount || 0} · ${formatDate(chat?.lastSyncedAt)}`"
							/>
							<span
								v-if="chat?.username"
								v-text="` · @${chat.username.replace(/^@/, '')}`"
							/>
						</div>
					</button>
				</div>
			</EntityListPane>

			<DetailsPane class="min-h-0">
				<div
					v-if="selectedChat"
					class="flex min-h-0 flex-1 flex-col gap-3"
				>
					<div
						class="shrink-0 border-b border-solid border-[var(--background-modifier-border)] pb-3"
					>
						<div class="text-sm font-semibold leading-snug">
							{{ selectedChat.title }}
						</div>
						<div
							v-if="selectedChat.username"
							class="mt-0.5 text-xs text-[var(--text-muted)]"
						>
							@{{ selectedChat.username.replace(/^@/, '') }}
						</div>
					</div>

					<div class="flex flex-wrap gap-2">
						<SummaryChip :text="`Сообщений: ${selectedChat.messageCount}`" />
						<SummaryChip
							:text="`Последний синк: ${formatDate(selectedChat.lastSyncedAt)}`"
						/>
						<SummaryChip :text="`Показано: ${selectedChatMessages.length}`" />
					</div>

					<div
						class="flex shrink-0 flex-wrap items-baseline justify-between gap-2 border-b border-solid border-[var(--background-modifier-border)] pb-2"
					>
						<div class="text-sm font-semibold">Сообщения</div>
						<div class="text-xs text-[var(--text-muted)]">
							{{
								isLoadingMessages
									? 'Загрузка…'
									: `Всего в архиве: ${selectedChatTotal}`
							}}
						</div>
					</div>

					<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
						<LoadingState
							v-if="isLoadingMessages"
							text="Загружаем сообщения…"
						/>
						<EmptyState
							v-else-if="selectedChatMessages.length === 0"
							text="В этом чате пока нет архивных сообщений."
						/>
						<div
							v-else
							class="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] pb-2"
						>
							<MessageCard
								v-for="message in selectedChatMessages"
								:key="message.messagePk"
								stacked
								:meta="`#${message.messageId} • ${new Date(message.timestampUtc).toLocaleString()}`"
								:body="
									message.textNormalized ||
									message.textRaw ||
									'[сообщение без текстового содержимого]'
								"
							/>
						</div>
					</div>
				</div>

				<div
					v-else
					class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center"
				>
					<div class="text-sm font-semibold">Ничего не выбрано</div>
					<div class="max-w-sm text-xs text-[var(--text-muted)]">
						Синхронизируйте новый peer или выберите чат слева.
					</div>
				</div>
			</DetailsPane>
		</div>
	</AppShell>
</template>
