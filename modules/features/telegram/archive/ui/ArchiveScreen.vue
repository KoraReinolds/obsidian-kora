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

void refreshData();
</script>

<template>
	<AppShell title="Архив Telegram">
		<template #toolbar>
			<Toolbar>
				<input
					v-model="peerInputValue"
					type="text"
					placeholder="@channel или -1001234567890"
					class="min-w-0 max-w-full flex-[1_1_280px] rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2.5 py-2"
					@keydown.enter.prevent="handleSync"
				/>
				<button
					class="mod-cta"
					:disabled="isSyncing || isRefreshing"
					@click="handleSync"
				>
					{{ isSyncing ? 'Синхронизация…' : 'Синхронизировать' }}
				</button>
				<button
					:disabled="isSyncing || isRefreshing"
					@click="refreshData"
				>
					Обновить
				</button>
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
			class="grid h-full min-h-0 flex-1 grid-cols-[minmax(260px,320px)_minmax(0,1fr)] items-stretch gap-3 overflow-hidden"
		>
			<EntityListPane>
				<div class="text-sm font-semibold">Чаты</div>
				<input
					v-model="searchQuery"
					type="text"
					placeholder="Поиск по архивным чатам"
					class="w-full shrink-0 rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2.5 py-2"
				/>
				<div class="text-xs text-[var(--text-muted)]">
					{{
						isRefreshing
							? 'Обновляем список чатов…'
							: `Архивных чатов: ${filteredChats.length}`
					}}
				</div>
				<div
					class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-0.5"
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
						class="flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg border border-solid bg-[var(--background-primary)] p-2.5 text-left hover:border-[var(--interactive-accent-hover)]"
						:class="
							selectedChatId === chat?.chatId
								? 'border-[var(--interactive-accent)]'
								: 'border-[var(--background-modifier-border)]'
						"
						@click="chat?.chatId && handleChatSelection(chat.chatId)"
					>
						<div class="font-semibold">{{ chat?.title || 'Без названия' }}</div>
						<div class="text-xs text-[var(--text-muted)]">
							{{ chat?.messageCount || 0 }} сообщений • {{ formatDate(chat?.lastSyncedAt) }}
						</div>
						<div v-if="chat?.username" class="text-xs text-[var(--text-muted)]">
							@{{ chat.username.replace(/^@/, '') }}
						</div>
					</button>
				</div>
			</EntityListPane>

			<DetailsPane>
				<template v-if="selectedChat">
					<div class="flex items-center justify-between gap-3">
						<div>
							<div class="text-sm font-semibold">{{ selectedChat.title }}</div>
							<div v-if="selectedChat.username" class="text-xs text-[var(--text-muted)]">
								@{{ selectedChat.username.replace(/^@/, '') }}
							</div>
						</div>
					</div>

					<div class="flex flex-wrap gap-2">
						<SummaryChip :text="`Сообщений: ${selectedChat.messageCount}`" />
						<SummaryChip
							:text="`Последний синк: ${formatDate(selectedChat.lastSyncedAt)}`"
						/>
						<SummaryChip :text="`Показано: ${selectedChatMessages.length}`" />
					</div>

					<div class="flex items-center justify-between gap-3">
						<div class="text-sm">Сообщения</div>
						<div class="text-xs text-[var(--text-muted)]">
							{{
								isLoadingMessages
									? 'Загрузка…'
									: `Всего в архиве: ${selectedChatTotal}`
							}}
						</div>
					</div>

					<div
						class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-0.5"
					>
						<LoadingState v-if="isLoadingMessages" text="Загружаем сообщения…" />
						<EmptyState
							v-else-if="selectedChatMessages.length === 0"
							text="В этом чате пока нет архивных сообщений."
						/>
						<template v-else>
							<MessageCard
								v-for="message in selectedChatMessages"
								:key="message.messagePk"
								:meta="`#${message.messageId} • ${new Date(message.timestampUtc).toLocaleString()}`"
								:body="
									message.textNormalized ||
									message.textRaw ||
									'[сообщение без текстового содержимого]'
								"
							/>
						</template>
					</div>
				</template>

				<template v-else>
					<div class="text-sm font-semibold">Ничего не выбрано</div>
					<div class="text-xs text-[var(--text-muted)]">
						Синхронизируйте новый peer или выберите чат слева.
					</div>
				</template>
			</DetailsPane>
		</div>
	</AppShell>
</template>
