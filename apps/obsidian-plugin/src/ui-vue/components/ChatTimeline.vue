<script setup lang="ts">
/**
 * @description Переиспользуемая прокручиваемая лента сообщений. Одна рамка и один
 * слой внутренних отступов (p-3): загрузка, пусто и список — внутри того же блока,
 * чтобы родитель мог не дублировать внешний padding (например колонка Eternal AI).
 * Renderer элемента приходит вместе с item: лента отвечает только за контейнер,
 * скролл и raw JSON режим, а сама фича подменяет представление turn.
 */
import { computed, ref, watch } from 'vue';
import PlaceholderState from './PlaceholderState.vue';
import ChatMessageBubble from './ChatMessageBubble.vue';
import ChatTimelineEternalTurnConversation from './ChatTimelineEternalTurnConversation.vue';
import ChatTimelineEternalTurnDebug from './ChatTimelineEternalTurnDebug.vue';
import IconButton from './IconButton.vue';
import type { ChatTimelineItem } from '../types';

const props = withDefaults(
	defineProps<{
		items: ChatTimelineItem[];
		loading?: boolean;
		emptyText?: string;
		highlightedItemId?: string | null;
		/** Показывать кнопку переключения «сырой JSON» (отладка). По умолчанию включено. */
		showRawDebugToggle?: boolean;
	}>(),
	{
		loading: false,
		emptyText: 'Пока нет сообщений.',
		highlightedItemId: null,
		showRawDebugToggle: true,
	}
);

const emit = defineEmits<{
	(event: 'jump', targetId: string): void;
	(event: 'delete', messageId: string): void;
}>();

const rawDebugMode = ref(false);

watch(
	() => props.items.length,
	len => {
		if (len === 0) {
			rawDebugMode.value = false;
		}
	}
);

/**
 * @description Сериализует элемент ленты в читаемый JSON для режима отладки.
 * @param {ChatTimelineItem} item - элемент из `items`
 * @returns {string}
 */
function formatTimelineItemRaw(item: ChatTimelineItem): string {
	try {
		return JSON.stringify(item.rawPayload ?? item, null, 2);
	} catch {
		return '[ChatTimelineItem: не удалось сериализовать]';
	}
}

const builtinRenderers = {
	message: ChatMessageBubble,
	'eternal-turn-conversation': ChatTimelineEternalTurnConversation,
	'eternal-turn-debug': ChatTimelineEternalTurnDebug,
} as const;

/**
 * @description Выбирает renderer элемента: кастомный из item или встроенный
 * компонент по kind. Это заменяет цепочки if/else в шаблоне.
 * @param {ChatTimelineItem} item - элемент ленты
 * @returns {object}
 */
const resolveRenderer = computed(
	() => (item: ChatTimelineItem) =>
		item.kind === 'custom'
			? item.renderer
			: builtinRenderers[item.kind || 'message']
);

/**
 * @description Пропсы для renderer-а: у custom item они приходят из `rendererProps`,
 * для обычного message renderer передаём стандартный `{ item, highlighted }`.
 * @param {ChatTimelineItem} item - элемент ленты
 * @returns {Record<string, unknown>}
 */
function getRendererProps(item: ChatTimelineItem): Record<string, unknown> {
	if (item.kind === 'custom') {
		return item.rendererProps || {};
	}
	return {
		item,
		highlighted: props.highlightedItemId === item.id,
	};
}
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		<div
			class="kora-chat-timeline relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[#161616]"
		>
			<div
				v-if="showRawDebugToggle && !loading && items.length > 0"
				class="pointer-events-none absolute right-2 top-2 z-10 flex justify-end"
			>
				<div class="pointer-events-auto">
					<IconButton
						icon="file-text"
						size="sm"
						:active="rawDebugMode"
						label="Сырой JSON элементов ленты"
						:title="
							rawDebugMode
								? 'Обычный вид чата'
								: 'Показать сырой JSON элементов (отладка)'
						"
						@click="rawDebugMode = !rawDebugMode"
					/>
				</div>
			</div>
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
				v-else-if="rawDebugMode"
				class="kora-chat-timeline-scroll flex min-h-0 flex-1 select-text flex-col overflow-y-scroll overflow-x-hidden p-3 pt-11"
			>
				<pre
					v-for="item in items"
					:key="item.id"
					class="mb-3 max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text-normal)] last:mb-0"
					v-text="formatTimelineItemRaw(item)"
				/>
			</div>
			<div
				v-else
				class="kora-chat-timeline-scroll flex min-h-0 flex-1 select-text flex-col overflow-y-scroll overflow-x-hidden p-3"
			>
				<div
					v-for="item in items"
					:key="item.id"
					class="mb-3 flex w-full min-w-0 flex-col last:mb-0"
				>
					<component
						:is="resolveRenderer(item)"
						v-bind="getRendererProps(item)"
						class="min-w-0"
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
