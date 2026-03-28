<script setup lang="ts">
/**
 * @description Переиспользуемая прокручиваемая лента сообщений. Одна рамка и один
 * слой внутренних отступов (p-3): загрузка, пусто и список — внутри того же блока,
 * чтобы родитель мог не дублировать внешний padding (например колонка Eternal AI).
 */
import PlaceholderState from './PlaceholderState.vue';
import ChatMessageBubble from './ChatMessageBubble.vue';
import type { ChatTimelineItem } from '../types';

withDefaults(
	defineProps<{
		items: ChatTimelineItem[];
		loading?: boolean;
		emptyText?: string;
		highlightedItemId?: string | null;
	}>(),
	{
		loading: false,
		emptyText: 'Пока нет сообщений.',
		highlightedItemId: null,
	}
);

const emit = defineEmits<{
	(event: 'jump', targetId: string): void;
	(event: 'delete', messageId: string): void;
}>();
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		<div
			class="kora-chat-timeline flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[#161616]"
		>
			<div
				v-if="loading"
				class="flex min-h-0 flex-1 items-center justify-center p-3"
			>
				<PlaceholderState variant="loading" text="Загружаем сообщения..." />
			</div>
			<div
				v-else-if="items.length === 0"
				class="flex min-h-0 flex-1 items-center justify-center p-3"
			>
				<PlaceholderState variant="empty" :text="emptyText" />
			</div>
			<div
				v-else
				class="flex min-h-0 flex-1 flex-col overflow-y-scroll overflow-x-hidden p-3"
			>
				<div
					v-for="item in items"
					:key="item.id"
					class="mb-3 flex last:mb-0"
					:class="item.align === 'end' ? 'justify-end' : 'justify-start'"
				>
					<ChatMessageBubble
						:item="item"
						:highlighted="highlightedItemId === item.id"
						@jump="emit('jump', $event)"
						@delete="emit('delete', $event)"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.kora-chat-timeline {
	scrollbar-width: thin;
	scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}

.kora-chat-timeline::-webkit-scrollbar {
	width: 10px;
}

.kora-chat-timeline::-webkit-scrollbar-thumb {
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.14);
}

.kora-chat-timeline::-webkit-scrollbar-track {
	background: transparent;
}
</style>
