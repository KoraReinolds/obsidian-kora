<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type {
	SqliteViewerColumnRecord,
	SqliteViewerDatabaseRecord,
	SqliteViewerTableRowsResponse,
	SqliteViewerTargetRecord,
} from '../../../../../../packages/contracts/src/sqlite-viewer';
import {
	AppShell,
	IconButton,
	MessageCard,
	PanelFrame,
	PlaceholderState,
	StatusBanner,
	SummaryChip,
	Toolbar,
} from '../../../ui-vue';
import { SqliteViewerBridge } from '../transport/sqlite-viewer-bridge';

const LAYOUT_STORAGE_V2 = 'kora.sqliteViewer.columnLayout.v2';
const LEGACY_VISIBLE_V1 = 'kora.sqliteViewer.visibleColumns.v1';

interface ColumnLayoutPersist {
	visible: string[];
	order: string[];
}

/**
 * @description Ключ localStorage для layout колонок (path + table).
 */
function layoutStorageKey(path: string, table: string): string {
	return `${LAYOUT_STORAGE_V2}:${path}:${table}`;
}

function legacyVisibleStorageKey(path: string, table: string): string {
	return `${LEGACY_VISIBLE_V1}:${path}:${table}`;
}

/**
 * @description Объединяет сохранённый порядок с актуальным списком имён колонок API.
 */
function mergeOrderWithApi(savedOrder: string[], apiNames: string[]): string[] {
	const valid = new Set(apiNames);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const name of savedOrder) {
		if (valid.has(name) && !seen.has(name)) {
			out.push(name);
			seen.add(name);
		}
	}
	for (const name of apiNames) {
		if (!seen.has(name)) {
			out.push(name);
		}
	}
	return out;
}

/**
 * @description Загружает visible + order из v2 или мигрирует из v1 (только visible).
 */
function loadColumnLayout(
	path: string,
	table: string,
	apiColumns: SqliteViewerColumnRecord[]
): { visible: Set<string>; order: string[] } {
	const allNames = apiColumns.map(c => c.name);
	if (allNames.length === 0) {
		return { visible: new Set(), order: [] };
	}
	try {
		const rawV2 = localStorage.getItem(layoutStorageKey(path, table));
		if (rawV2) {
			const parsed = JSON.parse(rawV2) as unknown;
			if (
				parsed &&
				typeof parsed === 'object' &&
				Array.isArray((parsed as ColumnLayoutPersist).visible) &&
				Array.isArray((parsed as ColumnLayoutPersist).order)
			) {
				const p = parsed as ColumnLayoutPersist;
				const valid = new Set(allNames);
				let visible = new Set(
					p.visible.filter(
						(n): n is string => typeof n === 'string' && valid.has(n)
					)
				);
				if (visible.size === 0) {
					visible = new Set(allNames);
				}
				const order = mergeOrderWithApi(p.order, allNames);
				return { visible, order };
			}
		}
		const rawV1 = localStorage.getItem(legacyVisibleStorageKey(path, table));
		if (rawV1) {
			const parsed = JSON.parse(rawV1) as unknown;
			if (Array.isArray(parsed)) {
				const valid = new Set(allNames);
				const filtered = parsed.filter(
					(n): n is string => typeof n === 'string' && valid.has(n)
				);
				const visible =
					filtered.length > 0 ? new Set(filtered) : new Set(allNames);
				return { visible, order: [...allNames] };
			}
		}
	} catch {
		// fallthrough
	}
	return { visible: new Set(allNames), order: [...allNames] };
}

/**
 * @description Сохраняет layout и при успехе удаляет legacy v1 ключ.
 */
function persistColumnLayout(
	path: string,
	table: string,
	visible: Set<string>,
	order: string[]
): void {
	try {
		const payload: ColumnLayoutPersist = {
			visible: [...visible],
			order: [...order],
		};
		localStorage.setItem(
			layoutStorageKey(path, table),
			JSON.stringify(payload)
		);
		try {
			localStorage.removeItem(legacyVisibleStorageKey(path, table));
		} catch {
			// ignore
		}
	} catch {
		// quota / private mode
	}
}

const props = defineProps<{
	transport: SqliteViewerBridge;
}>();

const targets = ref<SqliteViewerTargetRecord[]>([]);
const selectedTargetPath = ref('');
const customPath = ref('');
const database = ref<SqliteViewerDatabaseRecord | null>(null);
const selectedTable = ref('');
const rowsResult = ref<SqliteViewerTableRowsResponse | null>(null);
const filterText = ref('');
const limit = ref(100);
const orderBy = ref('');
const orderDir = ref<'asc' | 'desc'>('asc');
const isLoadingTargets = ref(false);
const isLoadingDatabase = ref(false);
const isLoadingRows = ref(false);
const screenMessage = ref<{
	kind: 'error' | 'warning' | 'success' | 'neutral';
	text: string;
} | null>(null);

/** Имена колонок в порядке отображения (чипы и таблица). */
const columnOrder = ref<string[]>([]);
const visibleColumnNames = ref<Set<string>>(new Set());

const activePath = computed(
	() => customPath.value.trim() || selectedTargetPath.value
);
const availableTables = computed(() => database.value?.tables || []);

const displayedColumns = computed((): SqliteViewerColumnRecord[] => {
	if (!rowsResult.value?.columns?.length) {
		return [];
	}
	const map = new Map(rowsResult.value.columns.map(c => [c.name, c]));
	return columnOrder.value
		.filter(name => visibleColumnNames.value.has(name) && map.has(name))
		.map(name => map.get(name)!);
});

/** Порядок имён для ряда чипов (совпадает с columnOrder, синхронизирован с API). */
const orderedColumnNamesForChips = computed(() => {
	const apiNames = rowsResult.value?.columns.map(c => c.name) ?? [];
	return mergeOrderWithApi(columnOrder.value, apiNames);
});

/** Все колонки из ответа видимы. */
const allColumnsVisible = computed(() => {
	const cols = rowsResult.value?.columns;
	if (!cols?.length) {
		return false;
	}
	return visibleColumnNames.value.size === cols.length;
});

watch(
	[activePath, selectedTable, rowsResult],
	() => {
		const path = activePath.value;
		const table = selectedTable.value;
		const cols = rowsResult.value?.columns;
		if (!path || !table || !cols?.length) {
			visibleColumnNames.value = new Set();
			columnOrder.value = [];
			return;
		}
		const layout = loadColumnLayout(path, table, cols);
		visibleColumnNames.value = layout.visible;
		columnOrder.value = layout.order;
	},
	{ immediate: true, deep: true }
);

function persistCurrentLayout(): void {
	const path = activePath.value;
	const table = selectedTable.value;
	if (!path || !table) {
		return;
	}
	persistColumnLayout(path, table, visibleColumnNames.value, columnOrder.value);
}

/**
 * @description Переключает видимость колонки и сохраняет layout.
 */
const toggleColumnVisibility = (columnName: string, checked: boolean): void => {
	if (!rowsResult.value?.columns?.length) {
		return;
	}
	const allNames = rowsResult.value.columns.map(c => c.name);
	const next = new Set(visibleColumnNames.value);
	if (checked) {
		next.add(columnName);
	} else {
		next.delete(columnName);
	}
	if (next.size === 0) {
		return;
	}
	visibleColumnNames.value = next;
	persistCurrentLayout();
};

/**
 * @description Все колонки ↔ только первая колонка.
 */
const toggleAllOrMinimalColumns = (): void => {
	if (!rowsResult.value?.columns?.length) {
		return;
	}
	const allNames = rowsResult.value.columns.map(c => c.name);
	if (allColumnsVisible.value) {
		const first = allNames[0];
		visibleColumnNames.value = first ? new Set([first]) : new Set();
	} else {
		visibleColumnNames.value = new Set(allNames);
	}
	persistCurrentLayout();
};

const isColumnVisible = (name: string): boolean =>
	visibleColumnNames.value.has(name);

const onColumnChipClick = (columnName: string): void => {
	toggleColumnVisibility(columnName, !isColumnVisible(columnName));
};

let dragColumnName = '';

/**
 * @description HTML5 DnD: начало перетаскивания порядка колонки (ручка).
 */
const onColumnDragStart = (event: DragEvent, columnName: string): void => {
	dragColumnName = columnName;
	event.dataTransfer?.setData('text/plain', columnName);
	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = 'move';
	}
};

/**
 * @description Сброс имени при отмене drag.
 */
const onColumnDragEnd = (): void => {
	dragColumnName = '';
};

/**
 * @description Вставляет перетаскиваемую колонку перед целевой в `columnOrder`.
 */
const onColumnDrop = (event: DragEvent, targetName: string): void => {
	event.preventDefault();
	const fromName =
		dragColumnName || event.dataTransfer?.getData('text/plain') || '';
	if (!fromName || fromName === targetName) {
		return;
	}
	const arr = [...columnOrder.value];
	const fi = arr.indexOf(fromName);
	if (fi < 0) {
		return;
	}
	arr.splice(fi, 1);
	const insertAt = arr.indexOf(targetName);
	if (insertAt < 0) {
		return;
	}
	arr.splice(insertAt, 0, fromName);
	columnOrder.value = arr;
	persistCurrentLayout();
};

const setMessage = (
	kind: 'error' | 'warning' | 'success' | 'neutral',
	text: string
): void => {
	screenMessage.value = { kind, text };
};

const clearScreenMessage = (): void => {
	screenMessage.value = null;
};

const formatCell = (value: unknown): string => {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'string') {
		return value;
	}
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
};

const loadTargets = async (): Promise<void> => {
	isLoadingTargets.value = true;
	try {
		targets.value = await props.transport.listTargets();
		if (!selectedTargetPath.value) {
			selectedTargetPath.value =
				targets.value.find(target => target.exists)?.path ||
				targets.value[0]?.path ||
				'';
		}
	} catch (error) {
		setMessage(
			'error',
			`Не удалось загрузить список SQLite targets: ${(error as Error).message}`
		);
	} finally {
		isLoadingTargets.value = false;
	}
};

const openDatabase = async (): Promise<void> => {
	if (!activePath.value) {
		setMessage('warning', 'Укажите путь к sqlite-файлу или выберите preset.');
		return;
	}

	isLoadingDatabase.value = true;
	try {
		database.value = await props.transport.inspectDatabase(activePath.value);
		selectedTable.value = database.value.tables[0]?.name || '';
		orderBy.value = database.value.tables[0]?.columns[0]?.name || '';
		rowsResult.value = null;
		if (selectedTable.value) {
			await loadRows();
		}
	} catch (error) {
		database.value = null;
		rowsResult.value = null;
		setMessage(
			'error',
			`Не удалось открыть sqlite-файл: ${(error as Error).message}`
		);
	} finally {
		isLoadingDatabase.value = false;
	}
};

const loadRows = async (): Promise<void> => {
	if (!activePath.value || !selectedTable.value) {
		return;
	}

	isLoadingRows.value = true;
	try {
		rowsResult.value = await props.transport.queryTable({
			path: activePath.value,
			table: selectedTable.value,
			limit: limit.value,
			offset: 0,
			orderBy: orderBy.value || undefined,
			orderDir: orderDir.value,
			filterText: filterText.value.trim() || undefined,
		});
	} catch (error) {
		rowsResult.value = null;
		setMessage(
			'error',
			`Не удалось загрузить строки таблицы: ${(error as Error).message}`
		);
	} finally {
		isLoadingRows.value = false;
	}
};

const selectTable = async (tableName: string): Promise<void> => {
	selectedTable.value = tableName;
	orderBy.value =
		database.value?.tables.find(table => table.name === tableName)?.columns[0]
			?.name || '';
	await loadRows();
};

const toggleSort = async (columnName: string): Promise<void> => {
	if (orderBy.value === columnName) {
		orderDir.value = orderDir.value === 'asc' ? 'desc' : 'asc';
	} else {
		orderBy.value = columnName;
		orderDir.value = 'asc';
	}
	await loadRows();
};

onMounted(async () => {
	await loadTargets();
	if (selectedTargetPath.value) {
		await openDatabase();
	}
});
</script>

<template>
	<AppShell title="SQLite Viewer">
		<template #toolbar>
			<Toolbar>
				<div class="flex min-w-0 w-full flex-wrap items-end gap-2">
					<label class="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs">
						<span class="text-[var(--text-muted)]" v-text="'Preset target'" />
						<select
							v-model="selectedTargetPath"
							class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-3 py-2 text-sm"
						>
							<option
								v-for="target in targets"
								:key="target.id"
								:value="target.path"
								v-text="`${target.label} · ${target.path}`"
							/>
						</select>
					</label>
					<label class="flex min-w-[18rem] flex-[2] flex-col gap-1 text-xs">
						<span class="text-[var(--text-muted)]" v-text="'Custom path'" />
						<input
							v-model="customPath"
							type="text"
							class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-3 py-2 text-sm"
							placeholder="C:\path\to\database.sqlite"
						/>
					</label>
					<IconButton
						size="sm"
						variant="muted"
						icon="rotate-ccw"
						label="Обновить viewer"
						title="Обновить viewer"
						:loading="isLoadingTargets"
						@click="loadTargets()"
					/>
					<IconButton
						size="sm"
						variant="accent"
						icon="database"
						label="Открыть SQLite"
						title="Открыть SQLite"
						:loading="isLoadingDatabase"
						@click="openDatabase()"
					/>
				</div>
			</Toolbar>
		</template>

		<template #message>
			<StatusBanner
				v-if="screenMessage"
				:kind="screenMessage.kind"
				:text="screenMessage.text"
				@dismiss="clearScreenMessage"
			/>
		</template>

		<div
			class="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]"
		>
			<PanelFrame class="min-h-0" :scroll="true">
				<div class="flex min-h-0 flex-1 flex-col gap-3">
					<div class="text-xs text-[var(--text-muted)]">
						Read-only viewer для low-level debug. Поддерживает preset базы и
						произвольный путь к sqlite-файлу.
					</div>
					<PlaceholderState
						v-if="isLoadingDatabase"
						variant="loading"
						text="Чтение структуры базы..."
					/>
					<PlaceholderState
						v-else-if="!database"
						variant="empty"
						text="Откройте sqlite-файл, чтобы увидеть таблицы."
					/>
					<div v-else class="flex flex-col gap-2">
						<div
							class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
						>
							Таблицы
						</div>
						<div class="flex flex-col gap-2">
							<MessageCard
								v-for="table in availableTables"
								:key="table.name"
								:title="table.name"
								:meta="`${table.rowCount} · ${table.columns.length}`"
								:selected="selectedTable === table.name"
								:clickable="true"
								compact
								@click="selectTable(table.name)"
							/>
						</div>
					</div>
				</div>
			</PanelFrame>

			<PanelFrame class="min-h-0" :scroll="true">
				<div class="flex min-h-0 flex-1 flex-col gap-3">
					<details
						v-if="database"
						class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2"
					>
						<summary
							class="cursor-pointer select-none text-xs font-semibold text-[var(--text-normal)]"
							v-text="'Фильтр и лимит'"
						/>
						<div
							class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_8rem]"
						>
							<label class="flex flex-col gap-1 text-xs">
								<span
									class="text-[var(--text-muted)]"
									v-text="'Фильтр по строкам'"
								/>
								<input
									v-model="filterText"
									type="search"
									class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-3 py-2 text-sm text-[var(--text-normal)]"
									placeholder="LIKE по всем колонкам"
									@keydown.enter.prevent="loadRows()"
								/>
							</label>
							<label class="flex flex-col gap-1 text-xs">
								<span class="text-[var(--text-muted)]" v-text="'Лимит'" />
								<input
									v-model.number="limit"
									type="number"
									min="1"
									max="500"
									class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-3 py-2 text-sm text-[var(--text-normal)]"
								/>
							</label>
							<div class="md:col-span-2 flex justify-end">
								<IconButton
									size="sm"
									variant="muted"
									icon="search"
									label="Применить фильтр"
									title="Применить фильтр"
									:loading="isLoadingRows"
									@click="loadRows()"
								/>
							</div>
						</div>
					</details>

					<details
						v-if="rowsResult?.columns?.length"
						class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2"
					>
						<summary
							class="cursor-pointer select-none text-xs font-semibold text-[var(--text-normal)]"
							v-text="'Видимые колонки'"
						/>
						<div class="mt-2 flex flex-col gap-2">
							<div class="flex flex-wrap items-center gap-2">
								<span
									class="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
									v-text="'Показать'"
								/>
								<SummaryChip
									text="Все / только первая"
									size="xs"
									:variant="allColumnsVisible ? 'accent' : 'neutral'"
									:pressed="allColumnsVisible"
									toggle
									:title="
										allColumnsVisible
											? 'Сейчас видны все колонки. Нажмите — оставить только первую.'
											: 'Сейчас не все колонки. Нажмите — показать все.'
									"
									@click="toggleAllOrMinimalColumns()"
								/>
							</div>
							<div class="text-[10px] text-[var(--text-muted)]">
								Порядок: перетащите ⋮⋮ у колонки.
							</div>
							<div class="flex flex-wrap items-center gap-2 gap-y-1.5">
								<div
									v-for="columnName in orderedColumnNamesForChips"
									:key="columnName"
									class="flex max-w-full items-center gap-0.5"
									@dragover.prevent
									@drop="onColumnDrop($event, columnName)"
								>
									<span
										class="cursor-grab select-none px-0.5 text-[10px] leading-none text-[var(--text-muted)] hover:text-[var(--text-normal)]"
										draggable="true"
										title="Порядок колонок"
										@dragstart="onColumnDragStart($event, columnName)"
										@dragend="onColumnDragEnd"
										v-text="'⋮⋮'"
									/>
									<SummaryChip
										:text="columnName"
										size="xs"
										:variant="
											isColumnVisible(columnName) ? 'accent' : 'neutral'
										"
										:pressed="isColumnVisible(columnName)"
										toggle
										mono
										truncate-label
										@click="onColumnChipClick(columnName)"
									/>
								</div>
							</div>
						</div>
					</details>

					<PlaceholderState
						v-if="!database"
						variant="empty"
						text="Здесь появятся строки выбранной таблицы."
					/>
					<PlaceholderState
						v-else-if="isLoadingRows"
						variant="loading"
						text="Загрузка строк..."
					/>
					<PlaceholderState
						v-else-if="!rowsResult"
						variant="empty"
						text="Выберите таблицу для просмотра."
					/>
					<div v-else class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
						<div class="text-xs text-[var(--text-muted)]">
							{{ rowsResult.path }} · {{ rowsResult.table }} ·
							{{ rowsResult.totalRows }}
							rows
						</div>
						<div
							class="max-w-full overflow-x-auto rounded-2xl border border-solid border-[var(--background-modifier-border)]"
						>
							<table
								class="border-collapse text-xs"
								:style="{
									tableLayout: 'fixed',
									width: `max(100%, ${Math.max(displayedColumns.length, 1) * 12}rem)`,
								}"
							>
								<thead class="bg-[var(--background-secondary)]">
									<tr>
										<th
											v-for="column in displayedColumns"
											:key="column.name"
											class="box-border w-[12rem] max-w-[12rem] min-w-[12rem] border-b border-solid border-[var(--background-modifier-border)] px-2 py-2 text-left align-top font-semibold text-[var(--text-normal)]"
										>
											<button
												type="button"
												class="flex w-full min-w-0 max-w-full items-center gap-1 truncate text-left"
												@click="toggleSort(column.name)"
											>
												<span class="truncate font-mono" v-text="column.name" />
												<span
													v-if="orderBy === column.name"
													class="shrink-0 text-[var(--text-muted)]"
													v-text="orderDir === 'asc' ? '↑' : '↓'"
												/>
											</button>
										</th>
									</tr>
								</thead>
								<tbody>
									<tr
										v-for="(row, rowIndex) in rowsResult.rows"
										:key="`${rowsResult.table}-${rowIndex}`"
										class="align-top"
									>
										<td
											v-for="column in displayedColumns"
											:key="`${rowIndex}-${column.name}`"
											class="box-border w-[12rem] max-w-[12rem] min-w-[12rem] border-b border-solid border-[var(--background-modifier-border)] px-2 py-2 align-top text-[var(--text-normal)]"
											:title="formatCell(row[column.name])"
										>
											<div
												class="truncate font-mono text-xs leading-snug"
												v-text="formatCell(row[column.name])"
											/>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</PanelFrame>
		</div>
	</AppShell>
</template>
