<script setup lang="ts">
/**
 * @description Renderer одного turn Eternal AI в обычном режиме. Вместо
 * инлайн-инспектора turn целиком выглядит как чистый диалог: user и assistant
 * сообщения живут в одном блоке ленты и переключаются целиком между режимами.
 */
import type {
	ChatTimelineEternalTracePayload,
	ChatTimelineMessageItem,
} from '../types';
import ChatMessageBubble from './ChatMessageBubble.vue';

defineProps<{
	turnId: string;
	userMessage?: ChatTimelineMessageItem | null;
	assistantMessage?: ChatTimelineMessageItem | null;
	trace?: ChatTimelineEternalTracePayload | null;
}>();

const emit = defineEmits<{
	(event: 'jump', targetId: string): void;
	(event: 'delete', messageId: string): void;
}>();
</script>

<template>
	<div class="flex min-w-0 flex-col gap-2.5">
		<ChatMessageBubble
			v-if="userMessage"
			:item="userMessage"
			@jump="emit('jump', $event)"
			@delete="emit('delete', $event)"
		/>
		<ChatMessageBubble
			v-if="assistantMessage"
			:item="assistantMessage"
			@jump="emit('jump', $event)"
			@delete="emit('delete', $event)"
		/>
	</div>
</template>
