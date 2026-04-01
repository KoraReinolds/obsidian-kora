<script setup lang="ts">
/**
 * @description Универсальный bubble-рендер для одного элемента chat timeline.
 * Поле `bubbleChrome: 'messenger'` даёт компактный чат с таймстампом как в мессенджере.
 */
import { computed, inject, ref } from 'vue';
import type { ChatTimelineItem, ChatTimelineMessageItem } from '../types';
import { HOST_CHAT_MESSAGE_CONTEXT_MENU } from '../injection-keys';
import { useImageLightbox } from '../composables';
import AttachmentPreviewThumb from './AttachmentPreviewThumb.vue';
import ImageLightbox from './ImageLightbox.vue';
import SummaryChip from './SummaryChip.vue';

const props = withDefaults(
	defineProps<{
		item: ChatTimelineItem;
		highlighted?: boolean;
	}>(),
	{
		highlighted: false,
	}
);

const emit = defineEmits<{
	(event: 'jump', targetId: string): void;
	(event: 'delete', messageId: string): void;
}>();

const hostChatMessageContextMenu = inject(
	HOST_CHAT_MESSAGE_CONTEXT_MENU,
	undefined
);

/**
 * @description ПКМ по пузырю открывает host-меню удаления, если оно доступно.
 * @param {MouseEvent} event - Событие `contextmenu`.
 * @returns {void}
 */
const onBubbleContextMenu = (event: MouseEvent): void => {
	if (!hostChatMessageContextMenu) {
		return;
	}
	const target = event.target;
	if (target instanceof Element && target.closest('img')) {
		return;
	}
	event.preventDefault();
	const raw = (props.item as ChatTimelineMessageItem | undefined)
		?.rawPayload as Record<string, unknown> | undefined;
	const hasTurn = Boolean(raw && typeof raw.turnId === 'string' && raw.turnId);
	const messageText =
		typeof (props.item as ChatTimelineMessageItem).text === 'string'
			? (props.item as ChatTimelineMessageItem).text
			: '';
	hostChatMessageContextMenu(event, {
		messageId: props.item.id,
		copyText: messageText,
		hasTurn,
		onDelete: () => emit('delete', props.item.id),
	});
};

const messagePayload = computed((): ChatTimelineMessageItem | null =>
	props.item.kind === 'custom' ? null : (props.item as ChatTimelineMessageItem)
);

const isMessengerChrome = computed(
	() => messagePayload.value?.bubbleChrome === 'messenger'
);

const isEndAligned = computed(() => props.item.align === 'end');

const bubbleBackground = computed(() => {
	const item = props.item as ChatTimelineMessageItem;
	return (
		item.accent?.bubbleBg ||
		(item.role === 'user'
			? 'color-mix(in srgb, var(--interactive-accent) 40%, var(--background-primary))'
			: 'rgba(29, 29, 29, 0.96)')
	);
});

const bubbleBorder = computed(() => {
	const item = props.item as ChatTimelineMessageItem;
	return (
		item.accent?.bubbleBorder ||
		(item.role === 'user'
			? 'color-mix(in srgb, var(--interactive-accent) 55%, var(--background-modifier-border))'
			: 'rgba(255, 255, 255, 0.08)')
	);
});

const bodyTextClass = computed(() =>
	isMessengerChrome.value
		? 'kora-messenger-body whitespace-pre-wrap break-words text-[16px] leading-[21px]'
		: 'whitespace-pre-wrap text-sm leading-6'
);

const handleReplyClick = (): void => {
	if (!props.item.replyPreview?.targetId) {
		return;
	}

	emit('jump', props.item.replyPreview.targetId);
};

const {
	src: lightboxSrc,
	suggestedFileName: lightboxSuggestedName,
	open: openLightbox,
	close: closeLightbox,
} = useImageLightbox();

const inlineAttachment = computed(() => {
	const attachments = props.item.attachments || [];
	if (!props.item.text || attachments.length !== 1) {
		return null;
	}
	const [attachment] = attachments;
	if (!attachment?.isImage && !attachment?.isVideo) {
		return null;
	}
	if (attachment.isGenerating) {
		return attachment;
	}
	if (!attachment?.isImage || !attachment.previewSrc) {
		return null;
	}
	return attachment;
});

const attachmentList = computed(() => {
	const attachments = props.item.attachments || [];
	if (!inlineAttachment.value) {
		return attachments;
	}
	return attachments.filter(
		attachment => attachment.id !== inlineAttachment.value?.id
	);
});

const richParts = computed(() => props.item.parts || []);

const hasRichParts = computed(() => {
	if (!richParts.value.length) {
		return false;
	}
	return (
		richParts.value.some(part => part.kind !== 'speech') ||
		richParts.value.length > 1
	);
});

const MESSENGER_INLINE_TIME_MAX_CHARS = 48;

const isCompactMessengerTime = computed(() => {
	if (!isMessengerChrome.value || hasRichParts.value) {
		return false;
	}
	const m = messagePayload.value;
	if (!m?.meta) {
		return false;
	}
	const t = m.text?.trim() ?? '';
	if (!t || t.includes('\n')) {
		return false;
	}
	if (t.length > MESSENGER_INLINE_TIME_MAX_CHARS) {
		return false;
	}
	if (m.replyPreview || m.forwardedLabel) {
		return false;
	}
	if ((m.attachments || []).length > 0) {
		return false;
	}
	return true;
});

const messengerFooterMeta = computed(
	() =>
		isMessengerChrome.value &&
		Boolean(messagePayload.value?.meta) &&
		!isCompactMessengerTime.value
);

const revealedThoughts = ref<Record<string, boolean>>({});

const getThoughtKey = (index: number): string => `${props.item.id}:${index}`;

const isThoughtRevealed = (index: number): boolean =>
	Boolean(revealedThoughts.value[getThoughtKey(index)]);

const toggleThoughtReveal = (index: number): void => {
	const key = getThoughtKey(index);
	revealedThoughts.value = {
		...revealedThoughts.value,
		[key]: !revealedThoughts.value[key],
	};
};

/**
 * @description Текст для чипа реакции.
 * @returns {string}
 */
const reactionLabel = (label: string, count?: number): string =>
	count ? `${label} ${count}` : label;
</script>

<template>
	<div
		:id="item.anchorId"
		class="flex items-end gap-2"
		:class="[
			isEndAligned ? 'flex-row-reverse self-end' : 'self-start',
			item.align === 'center' ? 'self-center' : '',
		]"
	>
		<div
			v-if="item.initials || item.author"
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white/95 shadow-sm"
			:style="{
				backgroundColor: item.accent?.avatarBg || 'hsl(220 18% 48%)',
				color: item.accent?.avatarText || 'rgba(255, 255, 255, 0.95)',
			}"
		>
			{{ item.initials || '?' }}
		</div>

		<div
			class="kora-chat-bubble max-w-[min(100%,48rem)] min-w-0 select-text border px-3 py-2.5 shadow-sm"
			:class="[
				isMessengerChrome
					? 'rounded-[13px] px-2.5 py-2 shadow-none'
					: 'rounded-[18px]',
			]"
			:style="{
				backgroundColor: highlighted
					? 'rgba(255, 214, 10, 0.12)'
					: bubbleBackground,
				borderColor: highlighted ? 'rgba(255, 214, 10, 0.35)' : bubbleBorder,
				color: 'var(--text-normal)',
			}"
			@contextmenu="onBubbleContextMenu"
		>
			<div
				v-if="(item.author || item.meta) && !isMessengerChrome"
				class="mb-1 flex items-center gap-2"
				:class="isEndAligned ? 'justify-end text-right' : ''"
			>
				<div v-if="item.author" class="truncate text-sm font-semibold">
					{{ item.author }}
				</div>
				<div
					v-if="item.meta"
					class="truncate text-[11px] text-[var(--text-muted)]"
				>
					{{ item.meta }}
				</div>
			</div>

			<button
				v-if="item.replyPreview"
				type="button"
				class="mb-2 block w-full cursor-pointer rounded-2xl border border-solid px-3 py-2 text-left transition-colors hover:bg-white/6"
				:class="item.replyPreview.targetId ? '' : 'cursor-default'"
				:style="{
					borderColor: 'rgba(255, 255, 255, 0.08)',
					backgroundColor: 'rgba(255, 255, 255, 0.03)',
				}"
				@click="handleReplyClick"
			>
				<div class="text-[11px] font-semibold text-[var(--text-muted)]">
					{{ item.replyPreview.label }}
				</div>
				<div class="line-clamp-2 text-xs text-[var(--text-muted)]">
					{{ item.replyPreview.text }}
				</div>
			</button>

			<div
				v-if="item.forwardedLabel"
				class="mb-2 text-xs text-[var(--text-muted)]"
			>
				{{ item.forwardedLabel }}
			</div>

			<div
				v-if="isMessengerChrome && isCompactMessengerTime && item.text"
				class="flex items-end gap-1.5"
				:class="isEndAligned ? 'justify-end' : ''"
			>
				<span
					class="min-w-0"
					:class="[
						bodyTextClass,
						isEndAligned ? 'text-right' : 'flex-1 text-left',
					]"
					v-text="item.text"
				/>
				<span
					class="kora-messenger-time shrink-0 pb-px text-[11px] tabular-nums text-[var(--text-muted)]"
					v-text="item.meta"
				/>
			</div>

			<div
				v-else-if="
					!hasRichParts &&
					item.text &&
					inlineAttachment &&
					!inlineAttachment.isGenerating
				"
				class="mt-2 flex items-start gap-3"
			>
				<AttachmentPreviewThumb
					:src="inlineAttachment.previewSrc!"
					:is-image="true"
					:zoomable="true"
					:context-menu-suggested-name="inlineAttachment.name"
					@open="openLightbox"
				/>
				<div class="min-w-0 flex-1">
					<div :class="bodyTextClass" v-text="item.text" />
					<div class="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
						<span v-text="inlineAttachment.name" />
						<span v-text="' · '" />
						<span v-text="inlineAttachment.kind" />
						<span v-if="inlineAttachment.mimeType" v-text="' · '" />
						<span
							v-if="inlineAttachment.mimeType"
							v-text="inlineAttachment.mimeType"
						/>
					</div>
				</div>
			</div>

			<div
				v-else-if="!hasRichParts && item.text && inlineAttachment?.isGenerating"
				class="mt-2 flex flex-col gap-3"
			>
				<div :class="bodyTextClass" v-text="item.text" />
				<div
					class="flex min-h-[8rem] items-center justify-center rounded-2xl border border-solid bg-[rgba(255,255,255,0.03)]"
					:style="{ borderColor: 'rgba(255, 255, 255, 0.08)' }"
				>
					<span class="sr-only">Генерация…</span>
					<div
						class="h-10 w-10 shrink-0 animate-spin rounded-full border-2 border-solid border-white/15 border-t-[var(--interactive-accent)]"
						aria-hidden="true"
					/>
				</div>
			</div>

			<div
				v-else-if="!hasRichParts && item.text"
				:class="bodyTextClass"
				v-text="item.text"
			/>

			<div v-else-if="hasRichParts" class="flex flex-col gap-2">
				<template
					v-for="(part, index) in richParts"
					:key="`${part.kind}-${index}`"
				>
					<div
						v-if="part.kind === 'speech'"
						class="whitespace-pre-wrap text-sm leading-6"
						v-text="part.text"
					/>
					<div
						v-else-if="part.kind === 'action'"
						class="whitespace-pre-wrap text-sm italic leading-6 text-[var(--text-muted)]"
						v-text="part.text"
					/>
					<span
						v-else-if="part.kind === 'thought' && part.visibility === 'spoiler'"
						role="button"
						tabindex="0"
						class="kora-thought-inline"
						:class="isThoughtRevealed(index) ? 'is-revealed' : ''"
						@click="toggleThoughtReveal(index)"
						@keydown.enter.prevent="toggleThoughtReveal(index)"
						@keydown.space.prevent="toggleThoughtReveal(index)"
					>
						<span class="kora-thought-inline__label">
							{{ isThoughtRevealed(index) ? 'мысль:' : 'скрытая мысль:' }}
						</span>
						<span class="kora-thought-inline__text" v-text="part.text" />
					</span>
					<div
						v-else-if="part.kind === 'thought'"
						class="whitespace-pre-wrap text-sm italic leading-6 text-[var(--text-muted)]"
						v-text="part.text"
					/>
				</template>
			</div>

			<div
				v-for="attachment in attachmentList"
				:key="attachment.id"
				class="mt-2 overflow-hidden rounded-2xl border border-solid bg-[rgba(255,255,255,0.03)]"
				:style="{ borderColor: 'rgba(255, 255, 255, 0.08)' }"
			>
				<div v-if="attachment.previewSrc" class="flex items-start gap-3 p-3">
					<AttachmentPreviewThumb
						:src="attachment.previewSrc"
						:is-image="attachment.isImage"
						:is-video="attachment.isVideo"
						:zoomable="attachment.isImage"
						:context-menu-suggested-name="attachment.name"
						@open="openLightbox"
					/>
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm font-medium">
							{{ attachment.name }}
						</div>
						<div class="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
							{{ attachment.kind }}
							<span v-if="attachment.size">
								· {{ attachment.size }} bytes
							</span>
							<span v-if="attachment.mimeType">
								· {{ attachment.mimeType }}
							</span>
							<span v-if="attachment.description">
								· {{ attachment.description }}
							</span>
						</div>
					</div>
				</div>
				<div
					v-else-if="attachment.isGenerating"
					class="flex min-h-[6rem] items-center justify-center p-3"
				>
					<span class="sr-only">Генерация…</span>
					<div
						class="h-9 w-9 shrink-0 animate-spin rounded-full border-2 border-solid border-white/15 border-t-[var(--interactive-accent)]"
						aria-hidden="true"
					/>
				</div>
				<div v-else class="p-3">
					<div class="text-sm font-medium">
						{{ attachment.name }}
					</div>
					<div class="mt-1 text-xs text-[var(--text-muted)]">
						{{ attachment.kind }}
						<span v-if="attachment.size"> · {{ attachment.size }} bytes </span>
						<span v-if="attachment.mimeType">
							· {{ attachment.mimeType }}
						</span>
						<span v-if="attachment.description">
							· {{ attachment.description }}
						</span>
					</div>
				</div>
			</div>

			<div v-if="messengerFooterMeta" class="mt-1 flex justify-end">
				<span
					class="kora-messenger-time text-[11px] tabular-nums text-[var(--text-muted)]"
					v-text="item.meta"
				/>
			</div>

			<div
				v-if="(item.reactions || []).length"
				class="mt-2 flex flex-wrap gap-1.5"
			>
				<SummaryChip
					v-for="reaction in item.reactions || []"
					:key="reaction.id"
					size="xs"
					variant="neutral"
					:text="reactionLabel(reaction.label, reaction.count)"
				/>
			</div>

			<div
				v-if="(item.badges || []).length"
				class="mt-2 flex flex-wrap gap-1.5"
			>
				<SummaryChip
					v-for="badge in item.badges || []"
					:key="badge"
					size="xs"
					variant="neutral"
					:text="badge"
				/>
			</div>
		</div>
	</div>

	<ImageLightbox
		v-if="lightboxSrc"
		:image-url="lightboxSrc"
		:suggested-file-name="lightboxSuggestedName"
		@close="closeLightbox"
	/>
</template>

<style scoped>
/**
 * Стек как у Telegram Web: Roboto подключается в `styles.base.css`.
 */
.kora-messenger-body {
	font-family:
		Roboto,
		-apple-system,
		'Apple Color Emoji',
		BlinkMacSystemFont,
		'Segoe UI',
		'Oxygen-Sans',
		Ubuntu,
		Cantarell,
		'Helvetica Neue',
		sans-serif;
	font-weight: 400;
	-webkit-font-smoothing: antialiased;
}

.kora-thought-inline {
	display: inline;
	cursor: pointer;
	color: color-mix(in srgb, var(--text-normal) 76%, var(--text-muted));
	transition:
		color 140ms ease,
		opacity 140ms ease;
}

.kora-thought-inline:hover {
	color: color-mix(in srgb, var(--text-normal) 84%, var(--text-muted));
}

.kora-thought-inline:focus-visible {
	outline: none;
	text-decoration: underline;
	text-decoration-color: var(--interactive-accent);
	text-underline-offset: 0.15em;
}

.kora-thought-inline__label {
	margin-right: 0.3rem;
	font-size: 0.78em;
	letter-spacing: 0.03em;
	text-transform: uppercase;
	color: var(--text-faint);
}

.kora-thought-inline__text {
	font-style: italic;
	opacity: 0.14;
}

.kora-thought-inline.is-revealed .kora-thought-inline__text {
	opacity: 0.78;
}

.kora-thought-inline.is-revealed .kora-thought-inline__label {
	color: var(--text-muted);
}
</style>
