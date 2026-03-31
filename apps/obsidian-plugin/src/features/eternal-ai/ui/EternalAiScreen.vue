<script setup lang="ts">
import { computed, ref } from 'vue';
import {
	AppShell,
	ChatTimeline,
	EntityEditorModal,
	EntityList,
	IconButton,
	ImageLightbox,
	MessageCard,
	PanelFrame,
	PlaceholderState,
	SelectableEntityList,
	SectionHeader,
	StatusBanner,
	SummaryChip,
	Toolbar,
	useImageLightbox,
} from '../../../ui-vue';
import type { IEntityEditorField } from '../../../ui-vue';
import type {
	EternalAiArtifactRecord,
	EternalAiConversationSummary,
} from '../../../../../../packages/contracts/src/eternal-ai';
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
	isDeletingTurnId,
	isDeletingArtifactId,
	isUpdatingArtifactId,
	screenMessage,
	clearScreenMessage,
	clearOpenClawCatalogError,
	timelineDebugEnabled,
	timelineItems,
	refreshData,
	selectConversation,
	startNewConversation,
	sendCurrentDraft,
	handleDeleteConversation,
	handleDeleteTurn,
	leftTab,
	effectsQuery,
	selectedEffectId,
	selectedEffect,
	filteredEffects,
	artifacts,
	visualSourceDataUrl,
	isLoadingEffects,
	isLoadingArtifacts,
	isCreativeRunning,
	isCustomCatalogEffectSelected,
	customMode,
	isCustomRunning,
	selectEffect,
	canManageArtifacts,
	setVisualSourceFromFileList,
	runCreativeEffect,
	runCustomGeneration,
	createArtifactManual,
	isCreatingArtifact,
	updateArtifact,
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
		Boolean(isDeletingTurnId.value)
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

const editingArtifactId = ref<string | null>(null);
const isArtifactCreateMode = ref(false);
const editingConversationId = ref<string | null>(null);

/** @description Начальные значения модалки создания artifact (без readonly-полей редактора). */
const artifactCreateDefaults: Record<string, unknown> = {
	type: 'semantic_memory',
	context: '',
	text: '',
	metadata: null,
};

const artifactEditorFields = computed<
	IEntityEditorField<EternalAiArtifactRecord>[]
>(() => [
	{
		key: 'type',
		label: 'Type',
		kind: 'select',
		options: [
			{ value: 'semantic_memory', label: 'semantic_memory' },
			{ value: 'episodic_memory', label: 'episodic_memory' },
			{ value: 'environment_state', label: 'environment_state' },
			{ value: 'session_summary', label: 'session_summary' },
			{ value: 'dialogue_window', label: 'dialogue_window' },
		],
	},
	{
		key: 'context',
		label: 'Context',
		kind: 'text',
		placeholder: 'persona / relationship / environment / source',
	},
	{
		key: 'text',
		label: 'Text',
		kind: 'textarea',
		rows: 8,
		placeholder: 'Текст artifact',
	},
	{
		key: 'metadata',
		label: 'Metadata',
		kind: 'json',
		rows: 8,
		placeholder: '{\n  "note": "manual edit"\n}',
	},
	{
		key: 'scope',
		label: 'Scope',
		kind: 'readonly',
		read: artifact => artifact.scope,
	},
	{
		key: 'sourceType',
		label: 'Source Type',
		kind: 'readonly',
	},
	{
		key: 'sourceId',
		label: 'Source Id',
		kind: 'readonly',
	},
	{
		key: 'createdAt',
		label: 'Created At',
		kind: 'readonly',
	},
	{
		key: 'updatedAt',
		label: 'Updated At',
		kind: 'readonly',
	},
]);

const artifactCreateEditorFields = computed<
	IEntityEditorField<Record<string, unknown>>[]
>(() => [
	{
		key: 'type',
		label: 'Type',
		kind: 'select',
		options: [
			{ value: 'semantic_memory', label: 'semantic_memory' },
			{ value: 'episodic_memory', label: 'episodic_memory' },
			{ value: 'environment_state', label: 'environment_state' },
			{ value: 'session_summary', label: 'session_summary' },
			{ value: 'dialogue_window', label: 'dialogue_window' },
		],
	},
	{
		key: 'context',
		label: 'Context',
		kind: 'text',
		placeholder: 'persona / relationship / environment / source',
	},
	{
		key: 'text',
		label: 'Text',
		kind: 'textarea',
		rows: 8,
		placeholder: 'Текст artifact',
	},
	{
		key: 'metadata',
		label: 'Metadata',
		kind: 'json',
		rows: 6,
		placeholder: '{\n  "note": "optional"\n}',
	},
]);

const editingArtifact = computed(
	() =>
		artifacts.value.find(artifact => artifact.id === editingArtifactId.value) ||
		null
);

const artifactModalFields = computed(() =>
	isArtifactCreateMode.value
		? artifactCreateEditorFields.value
		: artifactEditorFields.value
);

const artifactModalOpen = computed(
	() => Boolean(editingArtifact.value) || isArtifactCreateMode.value
);

const artifactModalValue = computed((): Record<string, unknown> | null =>
	isArtifactCreateMode.value
		? { ...artifactCreateDefaults }
		: (editingArtifact.value as unknown as Record<string, unknown> | null)
);

const editingConversation = computed(
	() =>
		conversations.value.find(
			conversation => conversation.id === editingConversationId.value
		) ?? null
);

const conversationEditorFields = computed<
	IEntityEditorField<EternalAiConversationSummary>[]
>(() => [
	{ key: 'id', label: 'ID', kind: 'readonly' },
	{ key: 'title', label: 'Title', kind: 'readonly' },
	{ key: 'model', label: 'Model', kind: 'readonly' },
	{ key: 'turnCount', label: 'Turns', kind: 'readonly' },
	{
		key: 'lastMessagePreview',
		label: 'Last message',
		kind: 'readonly',
	},
	{ key: 'lastMessageAt', label: 'Last message at', kind: 'readonly' },
	{ key: 'createdAt', label: 'Created', kind: 'readonly' },
	{ key: 'updatedAt', label: 'Updated', kind: 'readonly' },
	{ key: 'systemPrompt', label: 'System prompt', kind: 'readonly' },
]);

const getConversationKey = (conversation: unknown): string =>
	String((conversation as { id: string }).id);

const getConversationTitle = (conversation: unknown): string =>
	String((conversation as { title: string }).title);

const getConversationSubtitle = (conversation: unknown): string => {
	const item = conversation as { model: string; turnCount: number };
	return `${item.model} · ${item.turnCount} turns`;
};

const getConversationPreview = (conversation: unknown): string =>
	(conversation as { lastMessagePreview?: string | null }).lastMessagePreview ||
	'Пока без ответов';

const handleConversationSelect = (conversation: unknown): void => {
	selectConversation(String((conversation as { id: string }).id));
};

const getArtifactKey = (artifact: unknown): string =>
	String((artifact as EternalAiArtifactRecord).id);

/** Макс. длина превью текста в meta строке списка (остальное в модалке редактора). */
const ARTIFACT_TEXT_META_MAX = 400;

/**
 * @description Заголовок карточки: приоритет `metadata.title` (строка от Eternal),
 * иначе компактный `type · context`.
 */
const getArtifactTitle = (artifact: unknown): string => {
	const item = artifact as EternalAiArtifactRecord;
	const raw = item.metadata?.title;
	if (typeof raw === 'string') {
		const t = raw.trim();
		if (t) {
			return t;
		}
	}
	return `${item.type} · ${item.context}`;
};

/**
 * @description Текст артефакта в приглушённой meta-зоне `MessageCard`; основной body не используем.
 */
const getArtifactMeta = (artifact: unknown): string => {
	const text = String((artifact as EternalAiArtifactRecord).text ?? '').trim();
	if (text.length <= ARTIFACT_TEXT_META_MAX) {
		return text;
	}
	return `${text.slice(0, ARTIFACT_TEXT_META_MAX)}…`;
};

const getArtifactBody = (_artifact: unknown): string => '';

const openConversationEditor = (item: unknown): void => {
	editingConversationId.value = String((item as { id: string }).id);
};

const closeConversationEditor = (): void => {
	editingConversationId.value = null;
};

const deleteConversationFromModal = async (): Promise<void> => {
	const id = editingConversationId.value;
	if (!id) {
		return;
	}
	await handleDeleteConversation(id);
	editingConversationId.value = null;
};

const openArtifactEditor = (item: unknown): void => {
	isArtifactCreateMode.value = false;
	editingArtifactId.value = String((item as EternalAiArtifactRecord).id);
};

const openArtifactCreate = (): void => {
	editingArtifactId.value = null;
	isArtifactCreateMode.value = true;
};

const closeArtifactEditor = (): void => {
	editingArtifactId.value = null;
	isArtifactCreateMode.value = false;
};

const deleteArtifactFromModal = async (): Promise<void> => {
	const id = editingArtifactId.value;
	if (!id) {
		return;
	}
	await deleteArtifact(id);
	editingArtifactId.value = null;
};

const submitArtifactModal = async (
	patch: Record<string, unknown>
): Promise<void> => {
	try {
		if (isArtifactCreateMode.value) {
			const type = String(
				patch.type ?? artifactCreateDefaults.type
			) as EternalAiArtifactRecord['type'];
			const created = await createArtifactManual({
				type,
				context: String(patch.context ?? ''),
				text: String(patch.text ?? ''),
				metadata:
					patch.metadata !== undefined
						? (patch.metadata as Record<string, unknown> | null)
						: null,
			});
			if (created) {
				isArtifactCreateMode.value = false;
			}
			return;
		}
		if (!editingArtifact.value) {
			return;
		}
		await updateArtifact({
			artifactId: editingArtifact.value.id,
			type: String(
				patch.type ?? editingArtifact.value.type
			) as EternalAiArtifactRecord['type'],
			context: String(patch.context ?? editingArtifact.value.context),
			text: String(patch.text ?? editingArtifact.value.text),
			metadata:
				patch.metadata !== undefined
					? (patch.metadata as Record<string, unknown> | null)
					: (editingArtifact.value.metadata ?? null),
		});
		editingArtifactId.value = null;
	} catch {
		/* сообщение уже выставлено в composable */
	}
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

					<div class="mt-1 min-h-0 flex-1 overflow-auto pr-1">
						<SelectableEntityList
							:items="conversations"
							:get-key="getConversationKey"
							:get-title="getConversationTitle"
							:get-subtitle="getConversationSubtitle"
							:selected-key="selectedConversationId"
							:on-select="handleConversationSelect"
							:on-edit="openConversationEditor"
							empty-text="Локальная история пуста. Начните новый чат справа."
						>
							<template #meta="{ item }">
								<div
									class="line-clamp-2"
									v-text="getConversationPreview(item)"
								/>
							</template>
						</SelectableEntityList>
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
							subtitle="Artifacts выбранного диалога: «Новый artifact» в списке открывает ту же форму, что и раньше был seed. Отладка turn — в ленте чата (Runtime под сообщением)."
						/>
					</div>
					<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
						<div
							class="rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] p-3"
						>
							<EntityList
								list-header-title="Artifacts"
								:items="artifacts"
								:get-key="getArtifactKey"
								:get-title="getArtifactTitle"
								:get-meta="getArtifactMeta"
								:get-body="getArtifactBody"
								:on-edit="canManageArtifacts ? openArtifactEditor : undefined"
								:on-create="canManageArtifacts ? openArtifactCreate : undefined"
								:create-loading="isCreatingArtifact"
								create-button-label="Новый artifact"
								create-button-title="Создать artifact в текущем диалоге"
								:loading="isLoadingArtifacts"
								loading-text="Загрузка artifacts..."
								empty-text="Для этого диалога artifacts пока нет."
							/>
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
					<label
						class="flex shrink-0 cursor-pointer items-center justify-end gap-2 rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)]/35 px-2.5 py-1.5"
						:title="
							timelineDebugEnabled
								? 'Обычный вид: user/assistant пузыри. Включено: полный debug turn в одном блоке.'
								: 'Показать полный debug turn (prompt, raw, trace).'
						"
					>
						<input
							v-model="timelineDebugEnabled"
							type="checkbox"
							class="m-0 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--interactive-accent)]"
						/>
						<span
							class="text-[11px] font-medium text-[var(--text-muted)]"
							v-text="'Debug turn'"
						/>
					</label>

					<ChatTimeline
						surface-variant="messenger"
						:items="timelineItems"
						:loading="isLoadingMessages"
						empty-text="История ещё не началась. Отправьте первое сообщение."
						@delete="handleDeleteTurn"
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
	<EntityEditorModal
		:open="artifactModalOpen"
		:title="isArtifactCreateMode ? 'Новый artifact' : 'Artifact Editor'"
		:description="
			isArtifactCreateMode
				? 'Создание записи памяти: type, context, text и опционально metadata (POST artifacts).'
				: 'Редактирование одной записи памяти без выноса transport-логики в shared UI.'
		"
		:value="artifactModalValue"
		:fields="artifactModalFields"
		:loading="
			isArtifactCreateMode
				? isCreatingArtifact
				: Boolean(
						editingArtifact && isUpdatingArtifactId === editingArtifact.id
					)
		"
		:allow-delete="!isArtifactCreateMode && Boolean(editingArtifact)"
		:delete-loading="
			Boolean(editingArtifact && isDeletingArtifactId === editingArtifact.id)
		"
		delete-label="Удалить artifact"
		delete-confirm-hint="Artifact будет удалён без восстановления."
		:submit-label="isArtifactCreateMode ? 'Создать' : 'Save Artifact'"
		cancel-label="Cancel"
		@close="closeArtifactEditor()"
		@submit="submitArtifactModal"
		@delete="deleteArtifactFromModal"
	/>
	<EntityEditorModal
		:open="Boolean(editingConversation)"
		title="Диалог"
		description="Метаданные локального conversation. Удаление стирает историю и артефакты в этом scope."
		:value="editingConversation as unknown as Record<string, unknown> | null"
		:fields="conversationEditorFields"
		allow-delete
		:delete-loading="
			Boolean(
				editingConversation &&
				isDeletingConversationId === editingConversation.id
			)
		"
		delete-label="Удалить диалог"
		delete-confirm-hint="Все сообщения и связанные данные этого диалога будут удалены."
		cancel-label="Закрыть"
		@close="closeConversationEditor()"
		@delete="deleteConversationFromModal"
	/>
</template>
