<script setup lang="ts">
/**
 * @module ui-vue/components/EntityEditorModal
 * @description Узкий modal-редактор одной сущности. Компонент работает с
 * полями-schema и возвращает только patch изменённых editable-полей, не беря на
 * себя transport/domain логику сохранения.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { IEntityEditorField } from '../types/entity-list';
import IconButton from './IconButton.vue';

interface EntityEditorModalProps {
	open: boolean;
	title?: string;
	description?: string;
	value?: Record<string, unknown> | null;
	fields: IEntityEditorField[];
	loading?: boolean;
	submitLabel?: string;
	cancelLabel?: string;
	/**
	 * @description Показать зону удаления в подвале (двухшаговое подтверждение).
	 * Сам запрос удаления выполняет родитель по событию `delete`.
	 */
	allowDelete?: boolean;
	deleteLabel?: string;
	deleteConfirmHint?: string;
	deleteConfirmLabel?: string;
	deleteCancelLabel?: string;
	deleteLoading?: boolean;
}

const props = withDefaults(defineProps<EntityEditorModalProps>(), {
	title: 'Редактор сущности',
	description: '',
	value: null,
	loading: false,
	submitLabel: 'Save',
	cancelLabel: 'Cancel',
	allowDelete: false,
	deleteLabel: 'Удалить',
	deleteConfirmHint: 'Действие необратимо. Продолжить?',
	deleteConfirmLabel: 'Подтвердить удаление',
	deleteCancelLabel: 'Отмена',
	deleteLoading: false,
});

const emit = defineEmits<{
	close: [];
	submit: [patch: Record<string, unknown>];
	delete: [];
}>();

const baseline = ref<Record<string, unknown>>({});
const draft = ref<Record<string, unknown>>({});
const localError = ref('');
/** @description 0 — только кнопка «Удалить»; 1 — подтверждение. */
const deleteStep = ref<0 | 1>(0);

const editableFields = computed(() =>
	props.fields.filter(field => field.kind !== 'readonly')
);

const clone = (value: Record<string, unknown>): Record<string, unknown> => {
	try {
		return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
	} catch {
		return { ...value };
	}
};

const readFieldValue = (
	field: IEntityEditorField,
	source: Record<string, unknown> | null
): unknown => {
	if (!source) {
		return null;
	}
	if (field.read) {
		return field.read(source);
	}
	return source[field.key];
};

const formatFieldInput = (
	field: IEntityEditorField,
	source: Record<string, unknown> | null
): unknown => {
	const value = readFieldValue(field, source);
	if (field.kind === 'json') {
		if (value === null || value === undefined) {
			return '';
		}
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}
	if (field.kind === 'readonly') {
		return value;
	}
	return value ?? '';
};

const resetDraft = (): void => {
	const nextBaseline: Record<string, unknown> = {};
	const nextDraft: Record<string, unknown> = {};
	for (const field of props.fields) {
		nextBaseline[field.key] = formatFieldInput(field, props.value);
		nextDraft[field.key] = formatFieldInput(field, props.value);
	}
	baseline.value = clone(nextBaseline);
	draft.value = clone(nextDraft);
	localError.value = '';
};

watch(
	() => [props.open, props.value, props.fields] as const,
	() => {
		if (props.open) {
			resetDraft();
			deleteStep.value = 0;
		}
	},
	{ immediate: true, deep: true }
);

const close = (): void => {
	if (!props.loading && !props.deleteLoading) {
		deleteStep.value = 0;
		emit('close');
	}
};

const beginDeleteConfirm = (): void => {
	deleteStep.value = 1;
};

const cancelDeleteConfirm = (): void => {
	deleteStep.value = 0;
};

const emitDelete = (): void => {
	emit('delete');
};

const stringifyReadonly = (value: unknown): string => {
	if (value === null || value === undefined) {
		return '—';
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

const parseFieldPatch = (
	field: IEntityEditorField,
	rawValue: unknown
): unknown => {
	if (field.kind === 'json') {
		const text = String(rawValue ?? '').trim();
		if (!text) {
			return null;
		}
		return JSON.parse(text);
	}
	return rawValue;
};

const submit = (): void => {
	try {
		const patch: Record<string, unknown> = {};
		for (const field of editableFields.value) {
			const current = draft.value[field.key];
			const previous = baseline.value[field.key];
			if (current === previous) {
				continue;
			}
			patch[field.key] = parseFieldPatch(field, current);
		}
		localError.value = '';
		emit('submit', patch);
	} catch (error) {
		localError.value = (error as Error).message || 'Не удалось разобрать поля.';
	}
};

const onEscape = (event: KeyboardEvent): void => {
	if (
		event.key === 'Escape' &&
		props.open &&
		!props.loading &&
		!props.deleteLoading
	) {
		close();
	}
};

onMounted(() => {
	window.addEventListener('keydown', onEscape);
});

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onEscape);
});
</script>

<template>
	<Teleport to="body">
		<div
			v-if="open"
			class="fixed inset-0 z-[99998] flex h-screen w-screen items-center justify-center bg-black/70 p-4"
			@click.self="close()"
		>
			<section
				class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] shadow-2xl"
			>
				<header
					class="flex items-start justify-between gap-3 border-b border-solid border-[var(--background-modifier-border)] px-4 py-3"
				>
					<div class="min-w-0">
						<div class="text-sm font-semibold text-[var(--text-normal)]">
							<span v-text="title" />
						</div>
						<div
							v-if="description"
							class="mt-1 text-xs text-[var(--text-muted)]"
							v-text="description"
						/>
					</div>
					<IconButton
						size="sm"
						variant="muted"
						icon="x"
						label="Закрыть редактор"
						title="Закрыть"
						:disabled="loading || deleteLoading"
						@click="close()"
					/>
				</header>

				<div class="min-h-0 flex-1 overflow-auto px-4 py-3">
					<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
						<div
							v-for="field in fields"
							:key="field.key"
							class="flex flex-col gap-1"
							:class="
								field.kind === 'textarea' || field.kind === 'json'
									? 'md:col-span-2'
									: ''
							"
						>
							<label class="text-xs font-semibold text-[var(--text-muted)]">
								<span v-text="field.label" />
							</label>
							<div
								v-if="field.description"
								class="text-[11px] text-[var(--text-muted)]"
								v-text="field.description"
							/>
							<pre
								v-if="field.kind === 'readonly'"
								class="min-h-[2.5rem] rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 whitespace-pre-wrap break-words font-mono text-xs text-[var(--text-normal)]"
								v-text="stringifyReadonly(draft[field.key])"
							/>
							<select
								v-else-if="field.kind === 'select'"
								v-model="draft[field.key]"
								class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-sm text-[var(--text-normal)]"
							>
								<option
									v-for="option in field.options || []"
									:key="option.value"
									:value="option.value"
									v-text="option.label"
								/>
							</select>
							<textarea
								v-else-if="field.kind === 'textarea' || field.kind === 'json'"
								v-model="draft[field.key]"
								:rows="field.rows || 6"
								class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 font-mono text-sm text-[var(--text-normal)]"
								:placeholder="field.placeholder || ''"
							/>
							<input
								v-else
								v-model="draft[field.key]"
								type="text"
								class="rounded-xl border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-3 py-2 text-sm text-[var(--text-normal)]"
								:placeholder="field.placeholder || ''"
							/>
						</div>
					</div>

					<div
						v-if="localError"
						class="mt-3 rounded-xl border border-solid border-[var(--text-error)]/30 bg-[var(--text-error)]/10 px-3 py-2 text-xs text-[var(--text-error)]"
						v-text="localError"
					/>
				</div>

				<footer
					class="flex flex-wrap items-center justify-between gap-2 border-t border-solid border-[var(--background-modifier-border)] px-4 py-3"
				>
					<div
						v-if="allowDelete"
						class="flex min-w-0 flex-1 flex-wrap items-center gap-2"
					>
						<template v-if="deleteStep === 0">
							<button
								type="button"
								class="rounded-xl border border-solid border-[var(--text-error)]/40 bg-[var(--text-error)]/10 px-3 py-2 text-sm text-[var(--text-error)]"
								:disabled="loading || deleteLoading"
								@click="beginDeleteConfirm()"
							>
								<span v-text="deleteLabel" />
							</button>
						</template>
						<template v-else>
							<span
								class="text-xs text-[var(--text-muted)]"
								v-text="deleteConfirmHint"
							/>
							<button
								type="button"
								class="rounded-xl border border-solid border-[var(--background-modifier-border)] px-3 py-2 text-sm text-[var(--text-muted)]"
								:disabled="deleteLoading"
								@click="cancelDeleteConfirm()"
							>
								<span v-text="deleteCancelLabel" />
							</button>
							<button
								type="button"
								class="rounded-xl border border-solid border-[var(--text-error)]/50 bg-[var(--text-error)]/15 px-3 py-2 text-sm font-medium text-[var(--text-error)]"
								:disabled="deleteLoading"
								@click="emitDelete()"
							>
								<span
									v-text="deleteLoading ? 'Удаление…' : deleteConfirmLabel"
								/>
							</button>
						</template>
					</div>
					<div v-else class="min-w-[1rem] flex-1" />

					<div class="flex shrink-0 items-center gap-2">
						<button
							type="button"
							class="rounded-xl border border-solid border-[var(--background-modifier-border)] px-3 py-2 text-sm text-[var(--text-muted)]"
							:disabled="loading || deleteLoading"
							@click="close()"
						>
							<span v-text="cancelLabel" />
						</button>
						<button
							v-if="editableFields.length > 0"
							type="button"
							class="mod-cta rounded-xl px-3 py-2 text-sm"
							:disabled="loading || deleteLoading"
							@click="submit()"
						>
							<span v-text="loading ? 'Сохранение…' : submitLabel" />
						</button>
					</div>
				</footer>
			</section>
		</div>
	</Teleport>
</template>
