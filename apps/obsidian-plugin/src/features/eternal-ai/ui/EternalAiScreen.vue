<script setup lang="ts">
import {
	AppShell,
	ChatTimeline,
	DetailsPane,
	EmptyState,
	EntityListPane,
	IconButton,
	StatusBanner,
	SummaryChip,
	Toolbar,
} from '../../../ui-vue';
import { useEternalAiScreen } from '../model/use-eternal-ai-screen';
import type { EternalAiTransportPort } from '../ports/eternal-ai-transport-port';

const props = defineProps<{
	transport: EternalAiTransportPort;
	defaultSystemPrompt?: string;
}>();

const model = useEternalAiScreen({
	transport: props.transport,
	defaultSystemPrompt: props.defaultSystemPrompt,
});

const {
	conversations,
	selectedConversationId,
	selectedConversation,
	draft,
	health,
	isRefreshing,
	isLoadingMessages,
	isSending,
	isDeletingConversationId,
	screenMessage,
	timelineItems,
	systemPromptSummary,
	refreshData,
	selectConversation,
	startNewConversation,
	sendCurrentDraft,
	handleDeleteConversation,
} = model;

const handleDraftKeydown = async (event: KeyboardEvent): Promise<void> => {
	if (event.key !== 'Enter' || event.shiftKey) {
		return;
	}

	event.preventDefault();
	await sendCurrentDraft();
};

void refreshData();
</script>

<template>
	<AppShell title="Eternal AI">
		<template #toolbar>
			<Toolbar>
				<div class="flex min-w-0 w-full flex-wrap items-center gap-2">
					<IconButton
						size="sm"
						variant="accent"
						icon="plus"
						label="Новый чат Eternal AI"
						title="Новый чат"
						@click="startNewConversation"
					/>
					<IconButton
						size="sm"
						variant="muted"
						icon="rotate-ccw"
						label="Обновить Eternal AI экран"
						title="Обновить"
						:disabled="isRefreshing || isSending"
						:loading="isRefreshing"
						@click="refreshData()"
					/>
					<div class="flex flex-wrap gap-2">
						<SummaryChip :text="`Диалогов: ${conversations.length}`" />
						<SummaryChip :text="`Модель: ${health?.model || 'n/a'}`" />
						<SummaryChip :text="`Статус: ${health?.status || 'loading'}`" />
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
			class="grid h-full min-h-0 flex-1 grid-cols-1 items-stretch gap-3 overflow-hidden lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]"
		>
			<EntityListPane class="min-h-0">
				<div
					class="shrink-0 border-b border-solid border-[var(--background-modifier-border)] pb-3"
				>
					<div
						class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
					>
						История диалогов
					</div>
					<div class="mt-2 text-xs text-[var(--text-muted)]">
						Kora server хранит диалоги локально и отправляет полный контекст в
						Eternal AI как OpenAI-compatible chat completion.
					</div>
				</div>

				<div
					class="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
				>
					<EmptyState
						v-if="conversations.length === 0"
						text="Локальная история пуста. Начните новый чат справа."
					/>
					<div
						v-for="conversation in conversations"
						:key="conversation.id"
						class="flex items-center gap-1.5"
					>
						<button
							type="button"
							class="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 rounded-2xl border border-solid px-3 py-3 text-left shadow-sm transition-[border-color,box-shadow] hover:border-[var(--interactive-accent-hover)] hover:shadow"
							:class="
								selectedConversationId === conversation.id
									? 'border-[var(--interactive-accent)] bg-[var(--background-modifier-hover)] ring-1 ring-[var(--interactive-accent)]/25'
									: 'border-[var(--background-modifier-border)] bg-[var(--background-primary)]'
							"
							@click="selectConversation(conversation.id)"
						>
							<div class="min-w-0 w-full truncate text-sm font-semibold">
								{{ conversation.title }}
							</div>
							<div class="text-xs text-[var(--text-muted)]">
								{{ conversation.model }} · {{ conversation.messageCount }}
								сообщений
							</div>
							<div class="line-clamp-2 text-xs text-[var(--text-muted)]">
								{{ conversation.lastMessagePreview || 'Пока без ответов' }}
							</div>
						</button>
						<IconButton
							size="sm"
							variant="danger"
							icon="trash-2"
							label="Удалить Eternal AI диалог"
							title="Удалить"
							:disabled="isDeletingConversationId === conversation.id"
							:loading="isDeletingConversationId === conversation.id"
							@click.stop="handleDeleteConversation(conversation.id)"
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
				<div class="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
					<div
						class="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-solid border-[var(--background-modifier-border)] pb-3"
					>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-semibold leading-snug">
								{{ selectedConversation?.title || 'Новый чат Eternal AI' }}
							</div>
							<div class="mt-1 text-xs text-[var(--text-muted)]">
								{{ systemPromptSummary }}
							</div>
						</div>
						<div class="flex flex-wrap gap-2">
							<SummaryChip
								:text="`Модель: ${
									selectedConversation?.model || health?.model || 'n/a'
								}`"
							/>
							<SummaryChip
								:text="`Последнее: ${
									selectedConversation?.lastMessageAt
										? new Date(
												selectedConversation.lastMessageAt
											).toLocaleString()
										: 'ещё не было'
								}`"
							/>
						</div>
					</div>

					<ChatTimeline
						:items="timelineItems"
						:loading="isLoadingMessages"
						empty-text="История ещё не началась. Отправьте первое сообщение."
					/>

					<div
						class="shrink-0 rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] p-3"
					>
						<textarea
							v-model="draft"
							class="min-h-[108px] w-full resize-y rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-sm text-[var(--text-normal)] outline-none"
							placeholder="Напишите сообщение Eternal AI. Enter отправляет, Shift+Enter добавляет новую строку."
							:disabled="isSending"
							@keydown="handleDraftKeydown"
						/>
						<div class="mt-3 flex items-center justify-between gap-2">
							<div class="text-xs text-[var(--text-muted)]">
								Контекст диалога хранится локально в Kora server.
							</div>
							<IconButton
								size="sm"
								variant="accent"
								icon="send"
								label="Отправить сообщение Eternal AI"
								title="Отправить"
								:disabled="isSending || !draft.trim()"
								:loading="isSending"
								@click="sendCurrentDraft"
							/>
						</div>
					</div>
				</div>
			</DetailsPane>
		</div>
	</AppShell>
</template>
