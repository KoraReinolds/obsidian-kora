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
	getPersistedChatModelId: () => string;
	persistChatModelId: (apiModelId: string) => Promise<void>;
	openSqliteViewer?: () => Promise<void> | void;
}>();

const model = useEternalAiScreen({
	transport: props.transport,
	defaultSystemPrompt: props.defaultSystemPrompt,
	getPersistedChatModelId: props.getPersistedChatModelId,
	persistChatModelId: props.persistChatModelId,
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
	isDeletingArtifactId,
	screenMessage,
	clearScreenMessage,
	clearOpenClawCatalogError,
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
	artifacts,
	toggleTimelineInspectorTrace,
	visualSourceDataUrl,
	isLoadingEffects,
	isLoadingArtifacts,
	isSavingSeedArtifact,
	isCreativeRunning,
	isCustomCatalogEffectSelected,
	customMode,
	isCustomRunning,
	selectEffect,
	canManageArtifacts,
	seedType,
	seedContext,
	seedText,
	setVisualSourceFromFileList,
	runCreativeEffect,
	runCustomGeneration,
	createSeedArtifact,
	deleteArtifact,
	customS4DebugError,
	chatModelOptions,
	openClawConfigPath,
	openClawCatalogError,
	selectedChatModelRef,
	setSelectedChatModelRef,
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

/**
 * @description Смена модели чата: значение из native select → сохранение в настройках и на сервере.
 * @param {Event} event - change на `<select>`
 * @returns {Promise<void>}
 */
const onChatModelSelect = async (event: Event): Promise<void> => {
	const target = event.target as HTMLSelectElement | null;
	if (!target) {
		return;
	}
	await setSelectedChatModelRef(target.value);
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
						icon="database"
						label="Открыть SQLite Viewer"
						title="SQLite Viewer"
						@click="props.openSqliteViewer?.()"
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
					<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
						<label
							class="flex min-w-[12rem] max-w-[min(100%,22rem)] flex-col gap-0.5"
						>
							<span
								class="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
								v-text="'Модель чата (Open Claw)'"
							/>
							<select
								class="kora-eternal-model-select rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2 py-1.5 text-xs text-[var(--text-normal)]"
								:value="selectedChatModelRef"
								:title="
									health?.status !== 'healthy'
										? 'Модель чата можно менять всегда. Отправка сообщений и эффекты зависят от ключа Eternal и выбранной модели.'
										: undefined
								"
								:disabled="isSending || isCreativeRunning || isCustomRunning"
								@change="onChatModelSelect"
							>
								<option
									v-for="(opt, idx) in chatModelOptions"
									:key="opt.openClawRef || `${opt.apiModelId}-${idx}`"
									:value="opt.openClawRef"
									v-text="opt.label"
								/>
							</select>
						</label>
						<div class="flex flex-wrap gap-2">
							<SummaryChip :text="`Диалогов: ${conversations.length}`" />
							<SummaryChip
								:text="`Сервер default: ${health?.model || 'n/a'}`"
							/>
							<SummaryChip :text="`Статус: ${health?.status || 'loading'}`" />
							<SummaryChip
								v-if="openClawConfigPath"
								:text="`Open Claw: ${openClawConfigPath}`"
							/>
						</div>
					</div>
				</div>
			</Toolbar>
		</template>

		<template #message>
			<StatusBanner
				v-if="openClawCatalogError"
				kind="warning"
				:text="`Open Claw: ${openClawCatalogError}`"
				@dismiss="clearOpenClawCatalogError"
			/>
			<StatusBanner
				v-if="screenMessage"
				:kind="screenMessage.kind"
				:text="screenMessage.text"
				@dismiss="clearScreenMessage"
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
					<button
						type="button"
						class="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
						:class="
							leftTab === 'debug'
								? 'bg-[var(--interactive-accent)] text-white'
								: 'text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)]'
						"
						@click="leftTab = 'debug'"
					>
						Debug
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
							<MessageCard
								class="min-w-0 flex-1 shadow-sm"
								compact
								:selected="selectedConversationId === conversation.id"
								:clickable="true"
								:title="conversation.title"
								:subtitle="`${conversation.model} · ${conversation.messageCount} сообщений`"
								@click="selectConversation(conversation.id)"
							>
								<template #meta>
									<div class="line-clamp-2">
										{{ conversation.lastMessagePreview || 'Пока без ответов' }}
									</div>
								</template>
							</MessageCard>
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

				<div
					v-else-if="leftTab === 'effects'"
					class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
				>
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
				<div v-else class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
					<div
						class="shrink-0 rounded-2xl border border-solid border-[var(--background-modifier-border)] p-2.5"
					>
						<SectionHeader
							title="Memory"
							subtitle="Manual seed artifacts для выбранного диалога. Отладка turn — в ленте чата (Runtime под сообщением)."
						/>
					</div>
					<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
						<div
							class="rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] p-3"
						>
							<div
								class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
								v-text="'Seed Memory'"
							/>
							<div
								v-if="!canManageArtifacts"
								class="mt-2 text-xs text-[var(--text-muted)]"
								v-text="
									'Сначала выберите существующий диалог: manual seed привязывается к conversation scope.'
								"
							/>
							<div v-else class="mt-2 flex flex-col gap-2">
								<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
									<label class="flex flex-col gap-1 text-xs">
										<span class="text-[var(--text-muted)]" v-text="'Type'" />
										<select
											v-model="seedType"
											class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-sm"
										>
											<option value="semantic_memory">semantic_memory</option>
											<option value="episodic_memory">episodic_memory</option>
											<option value="environment_state">
												environment_state
											</option>
											<option value="session_summary">session_summary</option>
											<option value="dialogue_window">dialogue_window</option>
										</select>
									</label>
									<label class="flex flex-col gap-1 text-xs">
										<span class="text-[var(--text-muted)]" v-text="'Context'" />
										<input
											v-model="seedContext"
											type="text"
											class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-sm"
											placeholder="persona / relationship / environment"
										/>
									</label>
								</div>
								<label class="flex flex-col gap-1 text-xs">
									<span class="text-[var(--text-muted)]" v-text="'Text'" />
									<textarea
										v-model="seedText"
										rows="4"
										class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-sm"
										placeholder="Короткий факт, baseline persona detail, relationship state или environment seed"
									/>
								</label>
								<div class="flex justify-end">
									<IconButton
										size="sm"
										variant="accent"
										icon="plus"
										label="Сохранить seed artifact"
										title="Сохранить seed artifact"
										:loading="isSavingSeedArtifact"
										:disabled="!seedText.trim() || !seedContext.trim()"
										@click="createSeedArtifact()"
									/>
								</div>
							</div>
						</div>

						<div
							class="rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] p-3"
						>
							<div
								class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
								v-text="'Artifacts'"
							/>
							<PlaceholderState
								v-if="isLoadingArtifacts"
								variant="loading"
								text="Загрузка artifacts..."
							/>
							<PlaceholderState
								v-else-if="artifacts.length === 0"
								variant="empty"
								text="Для этого диалога artifacts пока нет."
							/>
							<div v-else class="flex flex-col gap-2">
								<div
									v-for="artifact in artifacts"
									:key="artifact.id"
									class="rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)]/50 p-3"
								>
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<div class="text-sm font-semibold">
												{{ artifact.type }} · {{ artifact.context }}
											</div>
											<div class="text-[11px] text-[var(--text-muted)]">
												{{ artifact.updatedAt }}
											</div>
										</div>
										<IconButton
											size="sm"
											variant="danger"
											icon="trash-2"
											label="Удалить artifact"
											title="Удалить artifact"
											:loading="isDeletingArtifactId === artifact.id"
											:disabled="isDeletingArtifactId === artifact.id"
											@click="deleteArtifact(artifact.id)"
										/>
									</div>
									<div
										class="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--text-normal)]"
										v-text="artifact.text"
									/>
								</div>
							</div>
						</div>
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
						@toggle-timeline-inspector="toggleTimelineInspectorTrace"
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
