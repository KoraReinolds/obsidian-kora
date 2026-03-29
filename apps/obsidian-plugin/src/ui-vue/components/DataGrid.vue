<script setup lang="ts">
/**
 * @module ui-vue/components/DataGrid
 * @description Узкий табличный primitive для raw/admin-экранов. Компонент берёт
 * на себя сортировку-хедер, row actions и inline edit lifecycle, а feature-код
 * остаётся владельцем commit/delete логики и специфичного парсинга значений.
 */
import { computed, ref } from 'vue';
import IconButton from './IconButton.vue';
import PlaceholderState from './PlaceholderState.vue';
import type {
	IDataGridColumn,
	IDataGridEditPayload,
	IDataGridRowAction,
} from '../types/data-grid';

type TRowKey = string | number;

interface DataGridProps {
	rows: unknown[];
	columns: IDataGridColumn[];
	getRowKey: (item: unknown, index: number) => TRowKey;
	rowActions?: IDataGridRowAction[];
	loading?: boolean;
	loadingText?: string;
	emptyText?: string;
	sortBy?: string;
	sortDir?: 'asc' | 'desc';
	onSort?: (columnId: string) => void;
	onCommitEdit?: (payload: IDataGridEditPayload) => void | Promise<void>;
	rowActionsLabel?: string;
}

const props = withDefaults(defineProps<DataGridProps>(), {
	rowActions: () => [],
	loading: false,
	loadingText: 'Загрузка…',
	emptyText: 'Данные отсутствуют.',
	sortBy: '',
	sortDir: 'asc',
	rowActionsLabel: 'Actions',
});

const editingCell = ref<{
	rowKey: TRowKey;
	columnId: string;
	draft: string;
} | null>(null);
const isSavingCell = ref(false);
const cellError = ref('');
const runningActionKey = ref<string | null>(null);

const hasRowActions = computed(() => props.rowActions.length > 0);

const getCellValue = (item: unknown, column: IDataGridColumn): unknown => {
	if (column.getValue) {
		return column.getValue(item);
	}
	if (item && typeof item === 'object') {
		return (item as Record<string, unknown>)[column.id];
	}
	return undefined;
};

const formatCellValue = (item: unknown, column: IDataGridColumn): string => {
	const value = getCellValue(item, column);
	if (column.format) {
		return column.format(value, item);
	}
	if (value === null || value === undefined) {
		return '';
	}
	return String(value);
};

const getCellTitle = (item: unknown, column: IDataGridColumn): string => {
	const value = getCellValue(item, column);
	if (column.title) {
		return column.title(value, item);
	}
	return formatCellValue(item, column);
};

const isColumnEditable = (item: unknown, column: IDataGridColumn): boolean => {
	if (!props.onCommitEdit) {
		return false;
	}
	if (typeof column.editable === 'function') {
		return column.editable(item);
	}
	return column.editable !== false;
};

const beginEdit = (
	item: unknown,
	column: IDataGridColumn,
	rowKey: TRowKey
): void => {
	if (isSavingCell.value || !isColumnEditable(item, column)) {
		return;
	}
	const value = getCellValue(item, column);
	editingCell.value = {
		rowKey,
		columnId: column.id,
		draft: column.toEditValue
			? column.toEditValue(value, item)
			: formatCellValue(item, column),
	};
	cellError.value = '';
};

const isEditingCell = (rowKey: TRowKey, columnId: string): boolean =>
	editingCell.value?.rowKey === rowKey &&
	editingCell.value?.columnId === columnId;

const cancelEdit = (): void => {
	if (isSavingCell.value) {
		return;
	}
	editingCell.value = null;
	cellError.value = '';
};

const saveEdit = async (
	item: unknown,
	column: IDataGridColumn
): Promise<void> => {
	if (!editingCell.value || !props.onCommitEdit) {
		return;
	}
	isSavingCell.value = true;
	cellError.value = '';
	try {
		await props.onCommitEdit({
			item,
			columnId: column.id,
			draft: editingCell.value.draft,
		});
		editingCell.value = null;
	} catch (error) {
		cellError.value =
			(error as Error).message || 'Не удалось сохранить ячейку.';
	} finally {
		isSavingCell.value = false;
	}
};

const actionRuntimeKey = (
	action: IDataGridRowAction,
	item: unknown,
	index: number
): string => `${action.id}:${String(props.getRowKey(item, index))}`;

const isActionLoading = (
	action: IDataGridRowAction,
	item: unknown,
	index: number
): boolean =>
	runningActionKey.value === actionRuntimeKey(action, item, index) ||
	Boolean(action.loading?.(item));

const isActionDisabled = (
	action: IDataGridRowAction,
	item: unknown,
	index: number
): boolean =>
	isActionLoading(action, item, index) || Boolean(action.disabled?.(item));

const runAction = async (
	action: IDataGridRowAction,
	item: unknown,
	index: number
): Promise<void> => {
	const key = actionRuntimeKey(action, item, index);
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
	<PlaceholderState v-if="loading" variant="loading" :text="loadingText" />
	<PlaceholderState
		v-else-if="rows.length === 0"
		variant="empty"
		:text="emptyText"
	/>
	<div
		v-else
		class="min-h-0 overflow-auto rounded-xl border border-solid border-[var(--background-modifier-border)]"
	>
		<table
			class="w-full border-collapse text-left text-xs"
			style="table-layout: fixed"
		>
			<thead class="sticky top-0 z-10 bg-[var(--background-secondary)]">
				<tr>
					<th
						v-for="column in columns"
						:key="column.id"
						class="box-border min-w-0 overflow-hidden border-b border-solid border-[var(--background-modifier-border)] px-2 py-2 text-left align-top font-semibold text-[var(--text-muted)]"
						:style="{
							width: column.width || undefined,
							maxWidth: column.width || undefined,
						}"
					>
						<button
							v-if="column.sortable && onSort"
							type="button"
							class="flex w-full min-w-0 max-w-full items-center gap-1 truncate border-0 bg-transparent p-0 text-left text-xs font-semibold text-[var(--text-muted)]"
							@click="onSort(column.id)"
						>
							<span class="truncate" v-text="column.label" />
							<span
								v-if="sortBy === column.id"
								class="text-[10px] text-[var(--text-normal)]"
								v-text="sortDir === 'asc' ? '▲' : '▼'"
							/>
						</button>
						<span v-else class="block truncate" v-text="column.label" />
					</th>
					<th
						v-if="hasRowActions"
						class="box-border w-[4.5rem] max-w-[4.5rem] min-w-[4.5rem] border-b border-solid border-[var(--background-modifier-border)] px-2 py-2 text-left align-top font-semibold text-[var(--text-muted)]"
						v-text="rowActionsLabel"
					/>
				</tr>
			</thead>
			<tbody>
				<tr
					v-for="(item, index) in rows"
					:key="getRowKey(item, index)"
					class="align-top even:bg-[var(--background-primary)] odd:bg-[var(--background-secondary)]/40"
				>
					<td
						v-for="column in columns"
						:key="column.id"
						class="box-border min-w-0 overflow-hidden border-b border-solid border-[var(--background-modifier-border)] px-2 py-2 align-top"
						:style="{
							width: column.width || undefined,
							maxWidth: column.width || undefined,
						}"
					>
						<div
							v-if="isEditingCell(getRowKey(item, index), column.id)"
							class="flex flex-col gap-1.5"
						>
							<textarea
								v-if="(column.editor || 'textarea') === 'textarea'"
								v-model="editingCell!.draft"
								:rows="column.rows || 3"
								class="min-h-[5rem] rounded border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2 py-1 text-xs"
								@keydown.enter.exact.prevent="saveEdit(item, column)"
								@keydown.esc.prevent="cancelEdit()"
							/>
							<input
								v-else
								v-model="editingCell!.draft"
								type="text"
								class="rounded border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-2 py-1 text-xs"
								@keydown.enter.exact.prevent="saveEdit(item, column)"
								@keydown.esc.prevent="cancelEdit()"
							/>
							<div
								v-if="cellError"
								class="text-[10px] text-[var(--text-error)]"
								v-text="cellError"
							/>
							<div class="flex items-center gap-1">
								<button
									type="button"
									class="rounded border border-solid border-[var(--background-modifier-border)] px-2 py-1 text-[10px]"
									:disabled="isSavingCell"
									@click="cancelEdit()"
								>
									Cancel
								</button>
								<button
									type="button"
									class="mod-cta rounded px-2 py-1 text-[10px]"
									:disabled="isSavingCell"
									@click="saveEdit(item, column)"
								>
									<span v-text="isSavingCell ? 'Saving…' : 'Save'" />
								</button>
							</div>
						</div>
						<div
							v-else
							class="min-w-0 text-xs leading-snug"
							:class="[
								column.cellWrap
									? 'whitespace-pre-wrap break-words'
									: 'truncate',
								column.mono ? 'font-mono' : '',
								isColumnEditable(item, column)
									? 'cursor-text rounded px-1 py-0.5 transition-colors hover:bg-[var(--background-modifier-hover)]'
									: '',
							]"
							:title="getCellTitle(item, column)"
							v-text="formatCellValue(item, column) || '—'"
							@dblclick="beginEdit(item, column, getRowKey(item, index))"
						/>
					</td>
					<td
						v-if="hasRowActions"
						class="box-border w-[4.5rem] max-w-[4.5rem] min-w-[4.5rem] border-b border-solid border-[var(--background-modifier-border)] px-2 py-2 align-top"
					>
						<div class="flex items-center gap-1">
							<IconButton
								v-for="action in rowActions"
								:key="action.id"
								size="sm"
								:variant="action.variant || 'muted'"
								:icon="action.icon || 'circle'"
								:label="action.label"
								:title="action.title || action.label"
								:disabled="isActionDisabled(action, item, index)"
								:loading="isActionLoading(action, item, index)"
								@click="runAction(action, item, index)"
							/>
						</div>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>
