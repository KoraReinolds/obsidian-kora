<!--
  @module features/eternal-ai/ui/EternalAiMessageComposer
  @description Композер Eternal AI: превью кадра (плитка как в чате), текст, отправка.
  Сабмит только через emit — родитель решает сценарий. Сброс кадра — кнопка в AttachmentPreviewThumb.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { AttachmentPreviewThumb, IconButton } from '../../../ui-vue';

const props = withDefaults(
	defineProps<{
		/** Текст черновика (v-model). */
		modelValue: string;
		/** Data URL выбранного кадра или null. */
		visualSrc?: string | null;
		/** Проп clearable у превью: кнопка сброса справа сверху на плитке. */
		visualClearable?: boolean;
		placeholder?: string;
		textareaDisabled?: boolean;
		submitDisabled?: boolean;
		submitLoading?: boolean;
		/** Подсказка для кнопки отправки (a11y). */
		submitTitle?: string;
		/** Отладочная строка под строкой ввода (ошибки S4 и т.п.). */
		footerDebugText?: string | null;
	}>(),
	{
		visualSrc: null,
		visualClearable: false,
		placeholder: '',
		textareaDisabled: false,
		submitDisabled: false,
		submitLoading: false,
		submitTitle: 'Отправить',
		footerDebugText: null,
	}
);

const emit = defineEmits<{
	'update:modelValue': [value: string];
	submit: [];
	'image-files': [files: FileList | null];
	'clear-image': [];
	'preview-open': [src: string];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);

const onFileChange = (event: Event): void => {
	const input = event.target as HTMLInputElement;
	emit('image-files', input.files);
	input.value = '';
};

const triggerPickImage = (): void => {
	fileInputRef.value?.click();
};

const onPreviewOpen = (src: string): void => {
	emit('preview-open', src);
};

const onClearImage = (): void => {
	emit('clear-image');
};

const onKeydown = (event: KeyboardEvent): void => {
	if (event.key !== 'Enter' || event.shiftKey) {
		return;
	}
	event.preventDefault();
	if (!props.submitDisabled) {
		emit('submit');
	}
};
</script>

<template>
	<div
		class="shrink-0 rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] p-3"
	>
		<div class="flex min-w-0 items-end gap-2">
			<div class="shrink-0">
				<input
					ref="fileInputRef"
					class="hidden"
					type="file"
					accept="image/png,image/jpeg,image/webp"
					@change="onFileChange"
				/>
				<AttachmentPreviewThumb
					:src="visualSrc"
					:is-image="true"
					:zoomable="Boolean(visualSrc)"
					:clearable="visualClearable"
					empty-pickable
					@pick="triggerPickImage"
					@open="onPreviewOpen"
					@clear="onClearImage"
				/>
			</div>
			<div class="flex min-w-0 flex-1 items-end gap-2">
				<textarea
					:value="modelValue"
					class="min-h-[108px] min-w-0 flex-1 resize-y rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-sm text-[var(--text-normal)] outline-none"
					:placeholder="placeholder"
					:disabled="textareaDisabled"
					@input="
						emit(
							'update:modelValue',
							($event.target as HTMLTextAreaElement).value
						)
					"
					@keydown="onKeydown"
				/>
				<IconButton
					class="shrink-0"
					size="sm"
					variant="accent"
					icon="send"
					:label="submitTitle"
					:title="submitTitle"
					:disabled="submitDisabled"
					:loading="submitLoading"
					@click="emit('submit')"
				/>
			</div>
		</div>
		<p
			v-if="footerDebugText"
			class="mt-2 max-h-20 min-w-0 overflow-y-auto font-mono text-[10px] leading-snug text-[var(--text-error)]"
			v-text="footerDebugText"
		/>
	</div>
</template>
