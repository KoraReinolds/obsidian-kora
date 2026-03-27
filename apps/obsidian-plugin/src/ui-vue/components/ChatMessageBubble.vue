<script setup lang="ts">
/**
 * @description Универсальный bubble-рендер для одного элемента chat timeline.
 * Компонент не знает ничего о Telegram archive или Eternal AI и опирается только
 * на нормализованный `ChatTimelineItem`.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ChatTimelineItem } from '../types';
import AttachmentPreviewThumb from './AttachmentPreviewThumb.vue';
import UiHostIcon from './UiHostIcon.vue';

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

const isEndAligned = props.item.align === 'end';
const bubbleBackground =
	props.item.accent?.bubbleBg ||
	(props.item.role === 'user'
		? 'rgba(var(--interactive-accent-rgb, 124, 92, 255), 0.12)'
		: 'rgba(29, 29, 29, 0.96)');
const bubbleBorder =
	props.item.accent?.bubbleBorder ||
	(props.item.role === 'user'
		? 'rgba(var(--interactive-accent-rgb, 124, 92, 255), 0.25)'
		: 'rgba(255, 255, 255, 0.08)');

const handleReplyClick = (): void => {
	if (!props.item.replyPreview?.targetId) {
		return;
	}

	emit('jump', props.item.replyPreview.targetId);
};

const lightboxSrc = ref<string | null>(null);

const openLightbox = (src?: string | null): void => {
	if (!src) {
		return;
	}
	lightboxSrc.value = src;
};

const closeLightbox = (): void => {
	lightboxSrc.value = null;
};

const inlineAttachment = computed(() => {
	const attachments = props.item.attachments || [];
	if (!props.item.text || attachments.length !== 1) {
		return null;
	}
	const [attachment] = attachments;
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

const copyMessage = async (): Promise<void> => {
	const lines: string[] = [];
	if (props.item.text) {
		lines.push(props.item.text);
	}
	for (const attachment of props.item.attachments || []) {
		if (attachment.previewSrc) {
			lines.push(attachment.previewSrc);
		}
	}
	const payload = lines.join('\n').trim();
	if (!payload) {
		return;
	}
	try {
		await navigator.clipboard.writeText(payload);
	} catch {
		// noop: Clipboard may be unavailable in some hosts.
	}
};

const deleteMessage = (): void => {
	emit('delete', props.item.id);
};

const handleEscape = (event: KeyboardEvent): void => {
	if (event.key === 'Escape' && lightboxSrc.value) {
		closeLightbox();
	}
};

onMounted(() => {
	window.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
	window.removeEventListener('keydown', handleEscape);
});
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
			class="max-w-[min(100%,48rem)] min-w-0 rounded-[18px] border px-3 py-2.5 shadow-sm"
			:style="{
				backgroundColor: highlighted
					? 'rgba(255, 214, 10, 0.12)'
					: bubbleBackground,
				borderColor: highlighted ? 'rgba(255, 214, 10, 0.35)' : bubbleBorder,
				color: 'var(--text-normal)',
			}"
		>
			<div
				v-if="item.author || item.meta"
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
				v-if="item.text && inlineAttachment"
				class="mt-2 flex items-start gap-3"
			>
				<AttachmentPreviewThumb
					:src="inlineAttachment.previewSrc"
					:is-image="true"
					:zoomable="true"
					@open="openLightbox"
				/>
				<div class="min-w-0 flex-1">
					<div class="whitespace-pre-wrap text-sm leading-6">
						{{ item.text }}
					</div>
					<div class="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
						{{ inlineAttachment.name }} · {{ inlineAttachment.kind }}
						<span v-if="inlineAttachment.mimeType">
							· {{ inlineAttachment.mimeType }}
						</span>
					</div>
				</div>
			</div>

			<div v-else-if="item.text" class="whitespace-pre-wrap text-sm leading-6">
				{{ item.text }}
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

			<div
				v-if="(item.reactions || []).length"
				class="mt-2 flex flex-wrap gap-1.5"
			>
				<div
					v-for="reaction in item.reactions || []"
					:key="reaction.id"
					class="rounded-full border border-solid px-2 py-0.5 text-xs"
					:style="{
						borderColor: 'rgba(255, 255, 255, 0.08)',
						backgroundColor: 'rgba(255, 255, 255, 0.05)',
					}"
				>
					{{ reaction.label }}
					<span v-if="reaction.count"> {{ reaction.count }}</span>
				</div>
			</div>

			<div
				v-if="(item.badges || []).length"
				class="mt-2 flex flex-wrap gap-1.5"
			>
				<div
					v-for="badge in item.badges || []"
					:key="badge"
					class="rounded-full px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
					:style="{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }"
				>
					{{ badge }}
				</div>
			</div>

			<div class="mt-2 flex items-center justify-end gap-2">
				<button
					type="button"
					class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-solid border-[rgba(255,255,255,0.12)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-normal)]"
					title="Скопировать"
					aria-label="Скопировать"
					@click="copyMessage"
				>
					<UiHostIcon
						name="copy"
						label="Скопировать"
						icon-class="h-3.5 w-3.5 [&>svg]:h-3.5 [&>svg]:w-3.5"
					/>
				</button>
				<button
					type="button"
					class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-solid border-[rgba(255,255,255,0.12)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-error)]"
					title="Удалить"
					aria-label="Удалить"
					@click="deleteMessage"
				>
					<UiHostIcon
						name="trash-2"
						label="Удалить"
						icon-class="h-3.5 w-3.5 [&>svg]:h-3.5 [&>svg]:w-3.5"
					/>
				</button>
			</div>
		</div>
	</div>

	<Teleport to="body">
		<div
			v-if="lightboxSrc"
			class="fixed inset-0 z-[99999] flex h-screen w-screen items-center justify-center bg-black/85 p-4"
			@click="closeLightbox"
		>
			<button
				type="button"
				class="absolute right-4 top-4 rounded-full border border-solid border-white/25 bg-black/30 px-3 py-1 text-sm text-white"
				@click.stop="closeLightbox"
			>
				Close
			</button>
			<img
				:src="lightboxSrc"
				alt=""
				class="max-h-[96vh] max-w-[96vw] object-contain"
				@click.stop
			/>
		</div>
	</Teleport>
</template>
