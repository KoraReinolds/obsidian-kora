<script setup lang="ts">
import { computed } from 'vue';
import {
	AppShell,
	ChatTimeline,
	IconButton,
	ImageLightbox,
	MessageCard,
	PanelFrame,
	PlaceholderState,
	SectionHeader,
	StatusBanner,
	SummaryChip,
	Toolbar,
	useImageLightbox,
} from '../../../ui-vue';
import { useEternalAiScreen } from '../model/use-eternal-ai-screen';
import type { EternalAiTransportPort } from '../ports/eternal-ai-transport-port';
import EternalAiMessageComposer from './EternalAiMessageComposer.vue';

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
	draft,
	health,
	isRefreshing,
	isLoadingMessages,
	isSending,
	isDeletingConversationId,
	isDeletingMessageId,
	screenMessage,
	timelineItems,
	refreshData,
	selectConversation,
	startNewConversation,
	sendCurrentDraft,
	handleDeleteConversation,
	handleDeleteMessage,
	leftTab,
	effectsQuery,
	selectedEffectId,
	selectedEffect,
	filteredEffects,
	visualSourceDataUrl,
	isLoadingEffects,
	isCreativeRunning,
	isCustomCatalogEffectSelected,
	customMode,
	isCustomRunning,
	selectEffect,
	setVisualSourceFromFileList,
	runCreativeEffect,
	runCustomGeneration,
	customS4DebugError,
} = model;

const {
	src: lightboxSrc,
	suggestedFileName: lightboxSuggestedName,
	open: openLightbox,
	close: closeLightbox,
} = useImageLightbox();

const draftPlaceholder = computed(() =>
	isCustomCatalogEffectSelected.value
		? 'Промпт для base: перед генерацией автоматически вызывается S4. Или сообщение в чат — Enter как кнопка отправки.'
		: 'Сообщение в чат. При выбранном эффекте и кадре Enter запускает эффект. Shift+Enter — новая строка.'
);

const composerFooterDebug = computed(() =>
	isCustomCatalogEffectSelected.value ? customS4DebugError.value : null
);

const isEasyEffectReady = computed(() =>
	Boolean(
		selectedEffect.value &&
		!selectedEffect.value.effect_id.startsWith('__kora_custom_') &&
		visualSourceDataUrl.value
	)
);

const composerSubmitTitle = computed(() => {
	if (isCustomCatalogEffectSelected.value) {
		return 'Запустить base generate';
	}
	if (isEasyEffectReady.value) {
		return 'Запустить эффект';
	}
	return 'Отправить в чат';
});

const composerTextareaDisabled = computed(
	() => isSending.value || isCreativeRunning.value || isCustomRunning.value
);

const composerSubmitLoading = computed(
	() => isSending.value || isCreativeRunning.value || isCustomRunning.value
);

const composerSubmitDisabled = computed(() => {
	if (health.value?.status !== 'healthy') {
		return true;
	}
	if (
		isSending.value ||
		isCreativeRunning.value ||
		isCustomRunning.value ||
		Boolean(isDeletingMessageId.value)
	) {
		return true;
	}
	if (isCustomCatalogEffectSelected.value) {
		const text = draft.value.trim();
		if (!text) {
			return true;
		}
		if (
			(customMode.value === 'photo_edit' ||
				customMode.value === 'video_generate') &&
			!visualSourceDataUrl.value
		) {
			return true;
		}
		return false;
	}
	if (isEasyEffectReady.value) {
		return false;
	}
	return !draft.value.trim();
});

/**
 * @description Один сабмит композера: родитель решает — base generate, Easy Effect (кадр + эффект из каталога) или сообщение в чат.
 */
const handleComposerSubmit = async (): Promise<void> => {
	if (composerSubmitDisabled.value) {
		return;
	}
	if (isCustomCatalogEffectSelected.value) {
		await runCustomGeneration();
		return;
	}
	if (isEasyEffectReady.value) {
		await runCreativeEffect();
		return;
	}
	await sendCurrentDraft();
};

const onComposerImageFiles = (files: FileList | null): void => {
	setVisualSourceFromFileList(files);
};

const onComposerClearImage = (): void => {
	setVisualSourceFromFileList(null);
};

const onComposerPreviewOpen = (
	src: string,
	meta?: { suggestedFileName?: string | null }
): void => {
	openLightbox(src, meta);
};

void refreshData();
</script>

<template>
	<AppShell title="">
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
						:disabled="
							isRefreshing || isSending || isCreativeRunning || isCustomRunning
						"
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
			<PanelFrame class="min-h-0" :scroll="true">
				<div
					class="mb-3 flex shrink-0 gap-1 rounded-2xl border border-solid border-[var(--background-modifier-border)] p-1"
				>
					<button
						type="button"
						class="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
						:class="
							leftTab === 'chats'
								? 'bg-[var(--interactive-accent)] text-white'
								: 'text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)]'
						"
						@click="leftTab = 'chats'"
					>
						Диалоги
					</button>
					<button
						type="button"
						class="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
						:class="
							leftTab === 'effects'
								? 'bg-[var(--interactive-accent)] text-white'
								: 'text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)]'
						"
						@click="leftTab = 'effects'"
					>
						Эффекты
					</button>
				</div>

				<div
					v-if="leftTab === 'chats'"
					class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
				>
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

					<div class="mt-1 flex min-h-0 flex-1 flex-col gap-2 pr-1">
						<PlaceholderState
							v-if="conversations.length === 0"
							variant="empty"
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
				</div>

				<div v-else class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
					<div
						class="shrink-0 rounded-2xl border border-solid border-[var(--background-modifier-border)] p-2.5"
					>
						<SectionHeader
							title="Creative / Easy Effect"
							subtitle="Первые три карточки — base (0.76 / 0.76 / 4), далее каталог Eternal. Кадр и отправка — в композере под лентой чата."
						/>
						<input
							v-model="effectsQuery"
							type="search"
							class="mt-2.5 w-full rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-sm text-[var(--text-normal)] outline-none"
							placeholder="Поиск по названию…"
						/>
					</div>

					<div class="min-h-0 flex-1 pr-1">
						<PlaceholderState
							v-if="!isLoadingEffects && filteredEffects.length === 0"
							variant="empty"
							text="Эффекты не найдены. Смените фильтр или обновите экран."
						/>
						<PlaceholderState
							v-if="isLoadingEffects"
							variant="loading"
							text="Загрузка каталога…"
						/>
						<div v-else class="grid grid-cols-1 gap-2 pb-1 md:grid-cols-2">
							<MessageCard
								v-for="effect in filteredEffects"
								:key="effect.effect_id"
								subtitle=""
								:selected="selectedEffectId === effect.effect_id"
								:clickable="true"
								:compact="true"
								class="overflow-hidden"
								@click="selectEffect(effect.effect_id)"
							>
								<template #title>
									<div class="min-w-0 truncate pr-1" v-text="effect.tag" />
								</template>
								<template #actions>
									<span
										class="flex shrink-0 items-baseline gap-0.5 text-xs tabular-nums text-[var(--text-muted)]"
										:title="`Цена: ${effect.price}`"
									>
										<span
											aria-hidden="true"
											class="select-none font-semibold opacity-60"
											v-text="'¤'"
										/>
										<span
											class="font-medium text-[var(--text-normal)]"
											v-text="String(effect.price)"
										/>
									</span>
								</template>
								<template #body>
									<div class="relative overflow-hidden rounded-xl bg-black/20">
										<video
											v-if="
												effect.effect_type === 'video' && effect.sampleOutputURL
											"
											:src="effect.sampleOutputURL"
											class="h-32 w-full object-cover"
											muted
											playsinline
											loop
											preload="metadata"
										/>
										<img
											v-else-if="effect.sampleOutputURL"
											:src="effect.sampleOutputURL"
											alt=""
											class="h-32 w-full object-cover"
											loading="lazy"
										/>
										<div
											v-else
											class="flex h-32 w-full items-center justify-center text-xs text-[var(--text-muted)]"
										>
											Нет превью
										</div>
									</div>
								</template>
							</MessageCard>
						</div>
					</div>
					<div
						v-if="isCustomCatalogEffectSelected"
						class="shrink-0 rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)]/40 p-3"
					>
						<div
							class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
							v-text="'Base-режим'"
						/>
						<p
							class="mt-1 text-xs leading-snug text-[var(--text-muted)]"
							v-text="
								'Промпт и кадр — в композере под лентой. S4 выполняется автоматически перед base generate.'
							"
						/>
					</div>
				</div>
			</PanelFrame>

			<PanelFrame
				class="min-h-0 overflow-hidden"
				padding="none"
				gap="none"
				:scroll="false"
			>
				<div
					class="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden"
				>
					<ChatTimeline
						:items="timelineItems"
						:loading="isLoadingMessages"
						empty-text="История ещё не началась. Отправьте первое сообщение."
						@delete="handleDeleteMessage"
					/>

					<EternalAiMessageComposer
						v-model="draft"
						:visual-src="visualSourceDataUrl"
						visual-clearable
						:placeholder="draftPlaceholder"
						:textarea-disabled="composerTextareaDisabled"
						:submit-disabled="composerSubmitDisabled"
						:submit-loading="composerSubmitLoading"
						:submit-title="composerSubmitTitle"
						:footer-debug-text="composerFooterDebug"
						@submit="handleComposerSubmit"
						@image-files="onComposerImageFiles"
						@clear-image="onComposerClearImage"
						@preview-open="onComposerPreviewOpen"
					/>
				</div>
			</PanelFrame>
		</div>
	</AppShell>

	<ImageLightbox
		v-if="lightboxSrc"
		:image-url="lightboxSrc"
		:suggested-file-name="lightboxSuggestedName"
		@close="closeLightbox"
	/>
</template>
