<script setup lang="ts">
import {
	AppShell,
	AttachmentPreviewThumb,
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
	isDeletingMessageId,
	screenMessage,
	timelineItems,
	systemPromptSummary,
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
	effectSourceDataUrl,
	isLoadingEffects,
	isCreativeRunning,
	customMode,
	customPrompt,
	customSourceDataUrl,
	isCustomRunning,
	selectEffect,
	setEffectSourceFromFileList,
	runCreativeEffect,
	setCustomSourceFromFileList,
	runCustomGeneration,
} = model;

const {
	src: lightboxSrc,
	open: openLightbox,
	close: closeLightbox,
} = useImageLightbox();

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
					<button
						type="button"
						class="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
						:class="
							leftTab === 'custom'
								? 'bg-[var(--interactive-accent)] text-white'
								: 'text-[var(--text-muted)] hover:bg-[var(--background-modifier-hover)]'
						"
						@click="leftTab = 'custom'"
					>
						Кастом
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
					<div v-if="leftTab === 'effects'" class="contents">
						<div
							class="shrink-0 rounded-2xl border border-solid border-[var(--background-modifier-border)] p-2.5"
						>
							<SectionHeader
								title="Creative / Easy Effect"
								subtitle="Каталог проксируется через Kora server (без AES-полей). Выберите эффект и исходный кадр справа."
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
									:title="effect.tag"
									:subtitle="`ID: ${effect.effect_id}`"
									:selected="selectedEffectId === effect.effect_id"
									:clickable="true"
									:compact="true"
									class="overflow-hidden"
									@click="selectEffect(effect.effect_id)"
								>
									<template #meta>
										<div class="flex flex-wrap items-center gap-1">
											<SummaryChip :text="effect.effect_type" />
											<SummaryChip :text="`Цена: ${effect.price}`" />
											<SummaryChip
												v-if="effect.duration"
												:text="`${effect.duration}s`"
											/>
										</div>
									</template>
									<template #body>
										<div
											class="relative overflow-hidden rounded-xl bg-black/20"
										>
											<video
												v-if="
													effect.effect_type === 'video' &&
													effect.sampleOutputURL
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
											<div
												class="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
											>
												<span v-text="effect.effect_type" />
											</div>
										</div>
									</template>
								</MessageCard>
							</div>
						</div>
					</div>
					<div
						v-else
						class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
					>
						<div class="shrink-0">
							<div
								class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
							>
								Кастомная генерация
							</div>
							<div class="mt-2 text-xs text-[var(--text-muted)]">
								Режимы сосуществуют с эффектами: фото, редактирование фото,
								видео.
							</div>
						</div>
						<div class="grid gap-2">
							<select
								v-model="customMode"
								class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-sm text-[var(--text-normal)] outline-none"
							>
								<option value="photo_generate">Генерация фото</option>
								<option value="photo_edit">Редактирование фото</option>
								<option value="video_generate">Генерация видео</option>
							</select>
							<textarea
								v-model="customPrompt"
								class="min-h-[92px] w-full resize-y rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-sm text-[var(--text-normal)] outline-none"
								placeholder="Опишите желаемое изменение..."
							/>
							<label
								class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-xs font-semibold text-[var(--text-normal)]"
							>
								<input
									class="hidden"
									type="file"
									accept="image/png,image/jpeg,image/webp"
									@change="
										event =>
											setCustomSourceFromFileList(
												(event.target as HTMLInputElement).files
											)
									"
								/>
								Исходное изображение (опционально для фото)
							</label>
							<img
								v-if="customSourceDataUrl"
								:src="customSourceDataUrl"
								alt=""
								class="max-h-40 w-full rounded-xl object-contain"
							/>
							<IconButton
								size="sm"
								variant="accent"
								icon="wand-2"
								label="Запустить кастомную генерацию"
								title="Запустить кастом"
								:disabled="
									isCustomRunning ||
									!customPrompt.trim() ||
									((customMode === 'photo_edit' ||
										customMode === 'video_generate') &&
										!customSourceDataUrl) ||
									health?.status !== 'healthy'
								"
								:loading="isCustomRunning"
								@click="runCustomGeneration"
							/>
						</div>
					</div>
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

					<div
						class="shrink-0 rounded-2xl border border-dashed border-[var(--background-modifier-border)] bg-[var(--background-primary)]/40 p-3"
					>
						<div class="text-xs font-semibold text-[var(--text-muted)]">
							Easy Effect
						</div>
						<div class="mt-2 text-xs text-[var(--text-muted)]">
							Выберите эффект во вкладке «Эффекты», загрузите исходное
							изображение и запустите генерацию. Результат появится в ленте
							ниже.
						</div>
						<div class="mt-3 flex items-start gap-3">
							<AttachmentPreviewThumb
								:src="effectSourceDataUrl"
								:is-image="true"
								:zoomable="true"
								@open="openLightbox"
							/>
							<div class="min-w-0 flex-1">
								<div
									v-if="selectedEffect"
									class="flex flex-wrap items-center gap-2"
								>
									<SummaryChip
										:text="`Эффект: ${selectedEffect.tag} (${selectedEffect.effect_type})`"
									/>
									<SummaryChip :text="`ID: ${selectedEffect.effect_id}`" />
								</div>
								<div class="mt-3 flex flex-wrap items-center gap-3">
									<label
										class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-xs font-semibold text-[var(--text-normal)]"
									>
										<input
											class="hidden"
											type="file"
											accept="image/png,image/jpeg,image/webp"
											@change="
												event =>
													setEffectSourceFromFileList(
														(event.target as HTMLInputElement).files
													)
											"
										/>
										Исходное изображение
									</label>
									<div class="text-xs text-[var(--text-muted)]">
										<span v-if="effectSourceDataUrl" v-text="'Файл загружен'" />
										<span v-else v-text="'Файл не выбран'" />
									</div>
									<IconButton
										size="sm"
										variant="accent"
										icon="wand-2"
										label="Запустить визуальный эффект"
										title="Запустить эффект"
										:disabled="
											isCreativeRunning ||
											!selectedEffect ||
											!effectSourceDataUrl ||
											health?.status !== 'healthy'
										"
										:loading="isCreativeRunning"
										@click="runCreativeEffect"
									/>
								</div>
							</div>
						</div>
					</div>

					<ChatTimeline
						:items="timelineItems"
						:loading="isLoadingMessages"
						empty-text="История ещё не началась. Отправьте первое сообщение."
						@delete="handleDeleteMessage"
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
								:disabled="
									isSending || Boolean(isDeletingMessageId) || !draft.trim()
								"
								:loading="isSending"
								@click="sendCurrentDraft"
							/>
						</div>
					</div>
				</div>
			</PanelFrame>
		</div>
	</AppShell>

	<ImageLightbox
		v-if="lightboxSrc"
		:image-url="lightboxSrc"
		@close="closeLightbox"
	/>
</template>
