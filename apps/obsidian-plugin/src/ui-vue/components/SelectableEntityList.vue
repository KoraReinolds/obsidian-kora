<script setup lang="ts">
/**
 * @module ui-vue/components/SelectableEntityList
 * @description Тонкая обёртка над `EntityList` для экранов, где явное имя
 * selectable-режима повышает читаемость usage-кода. Пробрасывает `onEdit` и
 * прочие пропы в базовый список.
 */
import type { PropType } from 'vue';
import type { IEntityListAction, TEntityListKey } from '../types/entity-list';
import EntityList from './EntityList.vue';

defineProps({
	items: {
		type: Array as PropType<unknown[]>,
		required: true,
	},
	getKey: {
		type: Function as PropType<(item: unknown) => TEntityListKey>,
		required: true,
	},
	getTitle: {
		type: Function as PropType<(item: unknown) => string>,
		default: undefined,
	},
	getSubtitle: {
		type: Function as PropType<(item: unknown) => string>,
		default: undefined,
	},
	getMeta: {
		type: Function as PropType<(item: unknown) => string>,
		default: undefined,
	},
	getBody: {
		type: Function as PropType<(item: unknown) => string>,
		default: undefined,
	},
	actions: {
		type: Array as PropType<IEntityListAction[]>,
		default: () => [],
	},
	loading: {
		type: Boolean,
		default: false,
	},
	loadingText: {
		type: String,
		default: 'Загрузка…',
	},
	emptyText: {
		type: String,
		default: 'Список пуст.',
	},
	emptyTitle: {
		type: String,
		default: '',
	},
	selectedKey: {
		type: [String, Number, null] as PropType<TEntityListKey | null>,
		default: null,
	},
	onSelect: {
		type: Function as PropType<(item: unknown) => void>,
		default: undefined,
	},
	compact: {
		type: Boolean,
		default: true,
	},
	stacked: {
		type: Boolean,
		default: false,
	},
	hoverable: {
		type: Boolean,
		default: true,
	},
	onEdit: {
		type: Function as PropType<(item: unknown) => void>,
		default: undefined,
	},
	showEditButton: {
		type: Boolean,
		default: true,
	},
	editButtonLabel: {
		type: String,
		default: 'Редактировать',
	},
	editButtonTitle: {
		type: String,
		default: 'Редактировать',
	},
	editButtonIcon: {
		type: String,
		default: 'pencil',
	},
	listHeaderTitle: {
		type: String,
		default: '',
	},
	onCreate: {
		type: Function as PropType<() => void>,
		default: undefined,
	},
	showCreateButton: {
		type: Boolean,
		default: true,
	},
	createButtonLabel: {
		type: String,
		default: 'Добавить',
	},
	createButtonTitle: {
		type: String,
		default: 'Добавить запись',
	},
	createButtonIcon: {
		type: String,
		default: 'plus',
	},
	createDisabled: {
		type: Boolean,
		default: false,
	},
	createLoading: {
		type: Boolean,
		default: false,
	},
});
</script>

<template>
	<EntityList v-bind="$props" selectable>
		<template v-if="$slots['list-header']" #list-header>
			<slot name="list-header" />
		</template>
		<template v-if="$slots.title" #title="slotProps">
			<slot name="title" v-bind="slotProps" />
		</template>
		<template v-if="$slots.subtitle" #subtitle="slotProps">
			<slot name="subtitle" v-bind="slotProps" />
		</template>
		<template v-if="$slots.meta" #meta="slotProps">
			<slot name="meta" v-bind="slotProps" />
		</template>
		<template v-if="$slots.badges" #badges="slotProps">
			<slot name="badges" v-bind="slotProps" />
		</template>
		<template v-if="$slots.actions" #actions="slotProps">
			<slot name="actions" v-bind="slotProps" />
		</template>
		<template v-if="$slots.body" #body="slotProps">
			<slot name="body" v-bind="slotProps" />
		</template>
		<template v-if="$slots.footer" #footer="slotProps">
			<slot name="footer" v-bind="slotProps" />
		</template>
	</EntityList>
</template>
