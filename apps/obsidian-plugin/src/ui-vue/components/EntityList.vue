<script setup lang="ts">
/**
 * @module ui-vue/components/EntityList
 * @description Базовый карточечный список сущностей. Компонент объединяет common
 * list-паттерны (`loading`, `empty`, selection, actions, slots поверх
 * канонического `ListItem`) и оставляет доменную логику получения данных и мутаций снаружи.
 * Разрушительные действия (удаление) не размещаются в строке — их место в модалке.
 */
import { computed, ref } from 'vue';
import ListItem from './ListItem.vue';
import PlaceholderState from './PlaceholderState.vue';
import IconButton from './IconButton.vue';
import type { IEntityListAction, TEntityListKey } from '../types/entity-list';

interface EntityListProps {
	items: unknown[];
	getKey: (item: unknown) => TEntityListKey;
	getTitle?: (item: unknown) => string;
	getSubtitle?: (item: unknown) => string;
	getMeta?: (item: unknown) => string;
	getBody?: (item: unknown) => string;
	actions?: IEntityListAction[];
	loading?: boolean;
	loadingText?: string;
	emptyText?: string;
	emptyTitle?: string;
	selectedKey?: TEntityListKey | null;
	selectedKeys?: TEntityListKey[];
	selectable?: boolean;
	onSelect?: (item: unknown) => void;
	compact?: boolean;
	stacked?: boolean;
	hoverable?: boolean;
	itemHeaderLayout?: 'row' | 'column';
	/**
	 * @description Открыть редактор/детали сущности. Кнопка показывается только
	 * если передан обработчик. Чтобы скрыть кнопку при наличии `onEdit`, задайте
	 * `showEditButton` в `false`.
	 */
	onEdit?: (item: unknown) => void;
	/**
	 * @description Показывать кнопку редактирования при переданном `onEdit`.
	 * По умолчанию `true`; отключайте явно для read-only списков.
	 */
	showEditButton?: boolean;
	editButtonLabel?: string;
	editButtonTitle?: string;
	editButtonIcon?: string;
	/**
	 * @description Подпись слева в одной строке с кнопкой создания (если есть).
	 * Без кастомного слота `list-header` даёт `justify-between`: название и «+» в одном ряду.
	 */
	listHeaderTitle?: string;
	/**
	 * @description Создание новой сущности: дефолтная кнопка во вложенном слоте
	 * `list-header` (если слот не задан целиком снаружи). Без `onCreate` и без
	 * `listHeaderTitle` верхняя полоса не ренерится.
	 */
	onCreate?: () => void;
	/**
	 * @description Показывать дефолтную кнопку создания при переданном `onCreate`.
	 */
	showCreateButton?: boolean;
	createButtonLabel?: string;
	createButtonTitle?: string;
	createButtonIcon?: string;
	/** @description Блокировка кнопки создания (например пока идёт запрос). */
	createDisabled?: boolean;
	createLoading?: boolean;
}

const props = withDefaults(defineProps<EntityListProps>(), {
	actions: () => [],
	loading: false,
	loadingText: 'Загрузка…',
	emptyText: 'Список пуст.',
	emptyTitle: '',
	selectedKey: null,
	selectedKeys: () => [],
	selectable: false,
	compact: true,
	stacked: false,
	hoverable: true,
	itemHeaderLayout: 'column',
	showEditButton: true,
	editButtonLabel: 'Редактировать',
	editButtonTitle: 'Редактировать',
	editButtonIcon: 'pencil',
	listHeaderTitle: '',
	showCreateButton: true,
	createButtonLabel: 'Добавить',
	createButtonTitle: 'Добавить запись',
	createButtonIcon: 'plus',
	createDisabled: false,
	createLoading: false,
});

const runningActionKey = ref<string | null>(null);

const isSelectable = computed(
	() => props.selectable || Boolean(props.onSelect)
);

const showEditControl = computed(
	() => Boolean(props.onEdit) && props.showEditButton !== false
);

const handleEditClick = (item: unknown, event: MouseEvent): void => {
	event.stopPropagation();
	props.onEdit?.(item);
};

const showCreateToolbar = computed(
	() => Boolean(props.onCreate) && props.showCreateButton !== false
);

const showListHeaderRow = computed(
	() => Boolean(props.listHeaderTitle?.trim()) || showCreateToolbar.value
);

const listHeaderRowClass = computed((): string => {
	const hasTitle = Boolean(props.listHeaderTitle?.trim());
	if (hasTitle && showCreateToolbar.value) {
		return 'flex items-center justify-between gap-2';
	}
	if (showCreateToolbar.value) {
		return 'flex items-center justify-end gap-2';
	}
	return 'flex items-center justify-start gap-2';
});

const handleCreateClick = (): void => {
	props.onCreate?.();
};

const resolveTitle = (item: unknown): string => props.getTitle?.(item) || '';
const resolveSubtitle = (item: unknown): string =>
	props.getSubtitle?.(item) || '';
const resolveMeta = (item: unknown): string => props.getMeta?.(item) || '';
const resolveBody = (item: unknown): string => props.getBody?.(item) || '';
const isSelected = (item: unknown): boolean =>
	(props.selectedKey !== null && props.getKey(item) === props.selectedKey) ||
	props.selectedKeys.includes(props.getKey(item));

const handleSelect = (item: unknown): void => {
	if (!isSelectable.value) {
		return;
	}
	props.onSelect?.(item);
};

const actionRuntimeKey = (action: IEntityListAction, item: unknown): string =>
	`${action.id}:${String(props.getKey(item))}`;

const isActionLoading = (action: IEntityListAction, item: unknown): boolean =>
	runningActionKey.value === actionRuntimeKey(action, item) ||
	Boolean(action.loading?.(item));

const isActionDisabled = (action: IEntityListAction, item: unknown): boolean =>
	isActionLoading(action, item) || Boolean(action.disabled?.(item));

const runAction = async (
	action: IEntityListAction,
	item: unknown,
	event: MouseEvent
): Promise<void> => {
	event.stopPropagation();
	const key = actionRuntimeKey(action, item);
	if (runningActionKey.value === key) {
		return;
	}
	runningActionKey.value = key;
	try {
		await action.run(item);
	} finally {
		if (runningActionKey.value === key) {
			runningActionKey.value = null;
		}
	}
};
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col gap-2">
		<div v-if="$slots['list-header'] || showListHeaderRow" class="shrink-0">
			<slot name="list-header">
				<div v-if="showListHeaderRow" :class="listHeaderRowClass">
					<div
						v-if="listHeaderTitle?.trim()"
						class="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
						v-text="listHeaderTitle.trim()"
					/>
					<IconButton
						v-if="showCreateToolbar"
						size="sm"
						variant="accent"
						:icon="createButtonIcon"
						:label="createButtonLabel"
						:title="createButtonTitle"
						:disabled="createDisabled || createLoading"
						:loading="createLoading"
						@click="handleCreateClick()"
					/>
				</div>
			</slot>
		</div>

		<PlaceholderState v-if="loading" variant="loading" :text="loadingText" />
		<PlaceholderState
			v-else-if="items.length === 0"
			variant="empty"
			:title="emptyTitle || undefined"
			:text="emptyText"
		/>
		<div
			v-else
			class="flex min-h-0 flex-1 flex-col"
			:class="compact ? 'gap-2' : 'gap-2.5'"
		>
			<ListItem
				v-for="(item, index) in items"
				:key="getKey(item)"
				:title="resolveTitle(item)"
				:subtitle="resolveSubtitle(item)"
				:meta="resolveMeta(item)"
				:body="resolveBody(item)"
				:compact="compact"
				:stacked="stacked"
				:hoverable="hoverable"
				:clickable="isSelectable"
				:selected="isSelected(item)"
				:header-layout="itemHeaderLayout"
				@click="handleSelect(item)"
			>
				<template #title>
					<div class="min-w-0 flex-1">
						<div v-show="$slots.title" class="min-w-0">
							<slot
								name="title"
								:item="item"
								:index="index"
								:selected="isSelected(item)"
							/>
						</div>
						<span
							v-show="!$slots.title"
							class="truncate"
							v-text="resolveTitle(item)"
						/>
					</div>
				</template>
				<template v-if="$slots.subtitle" #subtitle>
					<slot
						name="subtitle"
						:item="item"
						:index="index"
						:selected="isSelected(item)"
					/>
				</template>
				<template v-if="$slots.meta" #meta>
					<slot
						name="meta"
						:item="item"
						:index="index"
						:selected="isSelected(item)"
					/>
				</template>
				<template v-if="$slots.badges" #badges>
					<slot
						name="badges"
						:item="item"
						:index="index"
						:selected="isSelected(item)"
					/>
				</template>
				<template
					v-if="showEditControl || actions.length > 0 || $slots.actions"
					#actions
				>
					<div class="flex items-center gap-1">
						<div
							v-if="showEditControl"
							class="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
						>
							<IconButton
								size="sm"
								variant="muted"
								:icon="editButtonIcon"
								:label="editButtonLabel"
								:title="editButtonTitle"
								@click="handleEditClick(item, $event)"
							/>
						</div>
						<div
							v-if="actions.length > 0 || $slots.actions"
							class="flex items-center gap-1"
						>
							<IconButton
								v-for="action in actions"
								:key="action.id"
								size="sm"
								:variant="action.variant || 'muted'"
								:icon="action.icon || 'circle'"
								:label="action.label"
								:title="action.title || action.label"
								:disabled="isActionDisabled(action, item)"
								:loading="isActionLoading(action, item)"
								@click="runAction(action, item, $event)"
							/>
							<slot name="actions" :item="item" :index="index" />
						</div>
					</div>
				</template>
				<template v-if="$slots.body" #body>
					<slot
						name="body"
						:item="item"
						:index="index"
						:selected="isSelected(item)"
					/>
				</template>
				<template v-if="$slots.footer" #footer>
					<slot
						name="footer"
						:item="item"
						:index="index"
						:selected="isSelected(item)"
					/>
				</template>
			</ListItem>
		</div>
	</div>
</template>
