<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
	AppShell,
	EntityList,
	IconButton,
	IconTextField,
	MessageCard,
	PanelFrame,
	PlaceholderState,
	SelectableEntityList,
	SectionHeader,
	StatusBanner,
	SummaryChip,
} from '../../../ui-vue';
import type {
	WorkspaceActionResult,
	WorkspaceBranchDraftInput,
	WorkspaceCommitDraftState,
	WorkspaceGitAction,
	WorkspaceStatusRepositoryRecord,
	WorkspaceStatusSnapshot,
} from '../transport/workspace-status-bridge';
import { WorkspaceStatusBridge } from '../transport/workspace-status-bridge';

interface CommitUiState extends WorkspaceCommitDraftState {
	isGenerating: boolean;
	isCommitting: boolean;
	error: string;
}

const props = defineProps<{
	transport: WorkspaceStatusBridge;
}>();

const snapshot = ref<WorkspaceStatusSnapshot | null>(null);
const filterQuery = ref('');
const isLoading = ref(false);
const runningAction = ref<WorkspaceGitAction | null>(null);
const selectedIds = ref<Set<string>>(new Set());
const actionResults = ref<WorkspaceActionResult[]>([]);
const screenMessage = ref<{
	kind: 'error' | 'warning' | 'success' | 'neutral';
	text: string;
} | null>(null);
const commitDrafts = ref<Record<string, CommitUiState>>({});
const branchDraft = ref<WorkspaceBranchDraftInput>({
	type: 'feat',
	ticketKey: 'BMSBUIL',
	ticketNumber: '',
	slug: '',
});

const repositories = computed(() => snapshot.value?.repositories ?? []);

const repositoryById = computed(() =>
	Object.fromEntries(repositories.value.map(repo => [repo.id, repo]))
);

const filteredRepositories = computed(() => {
	const query = filterQuery.value.trim().toLowerCase();
	if (!query) {
		return repositories.value;
	}

	return repositories.value.filter(repo =>
		[
			repo.name,
			repo.id,
			repo.kind,
			repo.path,
			repo.head,
			repo.upstream,
			repo.ticketId,
			repo.error,
			...repo.submodules.map(submodule => submodule.path),
		]
			.join(' ')
			.toLowerCase()
			.includes(query)
	);
});

const selectedRepositories = computed(() =>
	repositories.value.filter(repo => selectedIds.value.has(repo.id))
);

const primarySelectedRepository = computed(
	() => selectedRepositories.value[0] ?? null
);

const selectedRepositoriesWithDrafts = computed(() =>
	selectedRepositories.value.map(repo => ({
		repository: repo,
		draft:
			commitDrafts.value[repo.id] ||
			({
				repoId: repo.id,
				ticketId: repo.ticketId,
				messageText: '',
				warnings: [],
				isGenerating: false,
				isCommitting: false,
				error: '',
			} satisfies CommitUiState),
	}))
);

const allVisibleSelected = computed(
	() =>
		filteredRepositories.value.length > 0 &&
		filteredRepositories.value.every(repo => selectedIds.value.has(repo.id))
);

const someVisibleSelected = computed(() =>
	filteredRepositories.value.some(repo => selectedIds.value.has(repo.id))
);

const summary = computed(() => {
	const rows = repositories.value;
	return {
		total: rows.length,
		clean: rows.filter(
			repo =>
				repo.isGitRepository &&
				!repo.isDirty &&
				!repo.hasConflicts &&
				repo.submoduleDirtyCount === 0 &&
				repo.submoduleErrorCount === 0
		).length,
		dirty: rows.filter(repo => repo.isDirty || repo.submoduleDirtyCount > 0)
			.length,
		conflicts: rows.filter(repo => repo.hasConflicts).length,
		missing: rows.filter(repo => !repo.exists).length,
		errors: rows.filter(repo => repo.error || repo.submoduleErrorCount > 0)
			.length,
		behind: rows.filter(
			repo => repo.behind > 0 || repo.submoduleBehindCount > 0
		).length,
		ahead: rows.filter(repo => repo.ahead > 0).length,
		submodules: rows.reduce((sum, repo) => sum + repo.submoduleCount, 0),
	};
});

const branchPreview = computed(() => {
	const branchType = branchDraft.value.type.trim().toLowerCase();
	const ticketKey = branchDraft.value.ticketKey.trim().toUpperCase();
	const ticketNumber = branchDraft.value.ticketNumber.trim();
	const slug = branchDraft.value.slug
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	if (!branchType || !ticketKey || !ticketNumber) {
		return 'feat/BMSBUIL-1234';
	}

	const ticket = `${ticketKey}-${ticketNumber}`;
	return slug ? `${branchType}/${ticket}-${slug}` : `${branchType}/${ticket}`;
});

function ensureDraftState(
	repository: WorkspaceStatusRepositoryRecord
): CommitUiState {
	if (!commitDrafts.value[repository.id]) {
		commitDrafts.value = {
			...commitDrafts.value,
			[repository.id]: {
				repoId: repository.id,
				ticketId: repository.ticketId,
				messageText: '',
				warnings: [],
				isGenerating: false,
				isCommitting: false,
				error: '',
			},
		};
	}
	return commitDrafts.value[repository.id];
}

function getRepositoryVariant(
	repo: WorkspaceStatusRepositoryRecord
): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
	if (repo.error || repo.hasConflicts || repo.submoduleErrorCount > 0) {
		return 'danger';
	}
	if (!repo.exists || !repo.isGitRepository) {
		return 'warning';
	}
	if (
		repo.isDirty ||
		repo.behind > 0 ||
		repo.submoduleDirtyCount > 0 ||
		repo.submoduleBehindCount > 0
	) {
		return 'warning';
	}
	return 'success';
}

function getRepositoryStateText(repo: WorkspaceStatusRepositoryRecord): string {
	if (!repo.exists) {
		return 'missing';
	}
	if (!repo.isGitRepository) {
		return 'not git';
	}
	if (repo.hasConflicts) {
		return 'conflicts';
	}
	if (repo.error || repo.submoduleErrorCount > 0) {
		return 'error';
	}
	if (repo.isDirty || repo.submoduleDirtyCount > 0) {
		return 'dirty';
	}
	return 'clean';
}

function getTrackingText(repo: WorkspaceStatusRepositoryRecord): string {
	if (!repo.isGitRepository) {
		return '—';
	}

	const pieces: string[] = [];
	pieces.push(repo.upstream || 'no upstream');
	if (repo.ahead > 0) {
		pieces.push(`ahead ${repo.ahead}`);
	}
	if (repo.behind > 0) {
		pieces.push(`behind ${repo.behind}`);
	}
	return pieces.join(' · ');
}

function getChangesText(repo: WorkspaceStatusRepositoryRecord): string {
	if (!repo.isGitRepository) {
		return '—';
	}

	const pieces: string[] = [];
	if (repo.stagedCount > 0) {
		pieces.push(`staged ${repo.stagedCount}`);
	}
	if (repo.unstagedCount > 0) {
		pieces.push(`unstaged ${repo.unstagedCount}`);
	}
	if (repo.untrackedCount > 0) {
		pieces.push(`untracked ${repo.untrackedCount}`);
	}
	return pieces.length > 0 ? pieces.join(' · ') : 'no local changes';
}

function getSubmoduleSummary(repo: WorkspaceStatusRepositoryRecord): string {
	if (repo.submoduleCount === 0) {
		return 'no submodules';
	}

	const pieces = [`${repo.submoduleCount} submodules`];
	if (repo.submoduleDirtyCount > 0) {
		pieces.push(`dirty ${repo.submoduleDirtyCount}`);
	}
	if (repo.submoduleBehindCount > 0) {
		pieces.push(`behind ${repo.submoduleBehindCount}`);
	}
	if (repo.submoduleErrorCount > 0) {
		pieces.push(`errors ${repo.submoduleErrorCount}`);
	}
	return pieces.join(' · ');
}

function getCompactRepositoryMeta(
	repo: WorkspaceStatusRepositoryRecord
): string {
	if (!repo.isGitRepository) {
		return repo.exists ? 'not a git repository' : 'missing on disk';
	}

	const pieces: string[] = [];
	if (repo.head) {
		pieces.push(repo.head);
	}
	if (repo.isDirty) {
		pieces.push('dirty');
	}
	if (repo.stagedCount > 0) {
		pieces.push(`staged ${repo.stagedCount}`);
	}
	if (repo.untrackedCount > 0) {
		pieces.push(`untracked ${repo.untrackedCount}`);
	}
	if (repo.behind > 0) {
		pieces.push(`behind ${repo.behind}`);
	}
	if (repo.ahead > 0) {
		pieces.push(`ahead ${repo.ahead}`);
	}
	if (repo.submoduleCount > 0) {
		pieces.push(
			repo.submoduleDirtyCount > 0 || repo.submoduleBehindCount > 0
				? `submodules ${repo.submoduleCount}`
				: `${repo.submoduleCount} subs`
		);
	}

	return pieces.join(' · ') || 'clean';
}

function setMessage(
	kind: 'error' | 'warning' | 'success' | 'neutral',
	text: string
): void {
	screenMessage.value = { kind, text };
}

function clearMessage(): void {
	screenMessage.value = null;
}

function isSelected(repositoryId: string): boolean {
	return selectedIds.value.has(repositoryId);
}

function toggleRepositorySelection(repositoryId: string): void {
	const next = new Set(selectedIds.value);
	if (next.has(repositoryId)) {
		next.delete(repositoryId);
	} else {
		next.add(repositoryId);
	}
	selectedIds.value = next;
}

function toggleSelectVisible(): void {
	const next = new Set(selectedIds.value);
	if (allVisibleSelected.value) {
		for (const repo of filteredRepositories.value) {
			next.delete(repo.id);
		}
	} else {
		for (const repo of filteredRepositories.value) {
			next.add(repo.id);
		}
	}
	selectedIds.value = next;
}

function clearSelection(): void {
	selectedIds.value = new Set();
}

function syncSelectionWithSnapshot(): void {
	const knownIds = new Set(repositories.value.map(repo => repo.id));
	selectedIds.value = new Set(
		[...selectedIds.value].filter(id => knownIds.has(id))
	);
}

function syncDraftsWithSnapshot(): void {
	const next: Record<string, CommitUiState> = {};
	for (const repository of repositories.value) {
		const current = commitDrafts.value[repository.id];
		if (current) {
			next[repository.id] = {
				...current,
				ticketId: repository.ticketId,
			};
		}
	}
	commitDrafts.value = next;
}

async function refreshSnapshot(options?: {
	keepMessage?: boolean;
	preserveSelection?: boolean;
}): Promise<void> {
	isLoading.value = true;
	if (!options?.keepMessage) {
		clearMessage();
	}
	try {
		snapshot.value = await props.transport.readSnapshot();
		if (options?.preserveSelection) {
			syncSelectionWithSnapshot();
		} else {
			selectedIds.value = new Set();
		}
		syncDraftsWithSnapshot();
	} catch (error) {
		snapshot.value = null;
		setMessage(
			'error',
			`Не удалось собрать состояние workspace: ${(error as Error).message}`
		);
	} finally {
		isLoading.value = false;
	}
}

async function executeAction(action: WorkspaceGitAction): Promise<void> {
	if (selectedRepositories.value.length === 0) {
		setMessage('warning', 'Сначала выберите хотя бы один репозиторий.');
		return;
	}

	if (
		action === 'sync-hard' &&
		!window.confirm(
			'Sync Hard выполнит reset --hard для выбранных репозиториев и их submodules. Продолжить?'
		)
	) {
		return;
	}

	runningAction.value = action;
	clearMessage();
	actionResults.value = [];
	try {
		const results = await props.transport.runAction(
			action,
			selectedRepositories.value.map(repo => repo.id)
		);
		actionResults.value = results;
		const failed = results.filter(result => !result.ok);
		if (failed.length > 0) {
			setMessage(
				'warning',
				`Действие ${action} завершилось с ошибками: ${failed
					.map(result => result.name)
					.join(', ')}`
			);
		} else {
			setMessage(
				'success',
				`Действие ${action} выполнено для ${results.length} репозиториев.`
			);
		}
		await refreshSnapshot({ keepMessage: true, preserveSelection: true });
	} catch (error) {
		setMessage(
			'error',
			`Не удалось выполнить действие ${action}: ${(error as Error).message}`
		);
	} finally {
		runningAction.value = null;
	}
}

function canCreateBranches(): boolean {
	return (
		selectedRepositories.value.length > 0 &&
		branchDraft.value.type.trim().length > 0 &&
		branchDraft.value.ticketKey.trim().length > 0 &&
		branchDraft.value.ticketNumber.trim().length > 0
	);
}

async function createBranches(): Promise<void> {
	if (!canCreateBranches()) {
		setMessage(
			'warning',
			'Для создания веток выберите репозитории и заполните type, ticket key и number.'
		);
		return;
	}

	runningAction.value = 'create-branch';
	clearMessage();
	actionResults.value = [];
	try {
		const results = await props.transport.createBranches(
			selectedRepositories.value.map(repo => repo.id),
			branchDraft.value
		);
		actionResults.value = results;
		const failed = results.filter(result => !result.ok);
		if (failed.length > 0) {
			setMessage(
				'warning',
				`Не все ветки удалось создать: ${failed
					.map(result => result.name)
					.join(', ')}`
			);
		} else {
			setMessage(
				'success',
				`Ветки ${branchPreview.value} созданы в ${results.length} репозиториях.`
			);
		}
		await refreshSnapshot({ keepMessage: true, preserveSelection: true });
	} catch (error) {
		setMessage(
			'error',
			`Не удалось создать ветки: ${(error as Error).message}`
		);
	} finally {
		runningAction.value = null;
	}
}

async function generateDraftForRepository(
	repository: WorkspaceStatusRepositoryRecord
): Promise<void> {
	const draft = ensureDraftState(repository);
	draft.isGenerating = true;
	draft.error = '';
	draft.warnings = [];
	try {
		const generated = await props.transport.generateCommitDraft(repository);
		commitDrafts.value = {
			...commitDrafts.value,
			[repository.id]: {
				...draft,
				...generated,
				isGenerating: false,
				error: '',
			},
		};
	} catch (error) {
		commitDrafts.value = {
			...commitDrafts.value,
			[repository.id]: {
				...draft,
				isGenerating: false,
				error: (error as Error).message,
			},
		};
	}
}

async function commitRepository(
	repository: WorkspaceStatusRepositoryRecord
): Promise<void> {
	const draft = ensureDraftState(repository);
	draft.isCommitting = true;
	draft.error = '';
	try {
		const result = await props.transport.commitRepository(repository, draft);
		actionResults.value = [result, ...actionResults.value].slice(0, 10);
		if (!result.ok) {
			draft.error = result.error;
			setMessage('warning', `Commit не удался для ${repository.name}.`);
		} else {
			setMessage('success', `Commit выполнен для ${repository.name}.`);
			draft.messageText = '';
			draft.warnings = [];
		}
		await refreshSnapshot({ keepMessage: true, preserveSelection: true });
	} catch (error) {
		draft.error = (error as Error).message;
		setMessage(
			'error',
			`Не удалось выполнить commit для ${repository.name}: ${(error as Error).message}`
		);
	} finally {
		draft.isCommitting = false;
	}
}

function updateDraftText(repositoryId: string, value: string): void {
	const repository = repositoryById.value[repositoryId];
	if (!repository) {
		return;
	}
	const draft = ensureDraftState(repository);
	commitDrafts.value = {
		...commitDrafts.value,
		[repositoryId]: {
			...draft,
			messageText: value,
		},
	};
}

function canGenerateDraft(
	repository: WorkspaceStatusRepositoryRecord
): boolean {
	return (
		Boolean(repository.ticketId) &&
		repository.stagedCount > 0 &&
		!repository.hasConflicts
	);
}

function canCommit(
	repository: WorkspaceStatusRepositoryRecord,
	draft: CommitUiState
): boolean {
	return (
		Boolean(repository.ticketId) &&
		repository.stagedCount > 0 &&
		!repository.hasConflicts &&
		repository.submoduleDirtyCount === 0 &&
		draft.messageText.trim().length > 0
	);
}

onMounted(async () => {
	await refreshSnapshot();
});
</script>

<template>
	<AppShell title="Workspace Git Status">
		<template #toolbar>
			<div class="flex min-w-0 flex-1 flex-wrap items-start gap-3">
				<div class="min-w-[16rem] flex-1">
					<IconTextField
						v-model="filterQuery"
						icon="search"
						icon-label="Фильтр"
						placeholder="Фильтр по name, id, path, branch..."
						:input-class="
							[
								'rounded-xl border border-solid border-[var(--background-modifier-border)]',
								'bg-[var(--background-primary)]',
							].join(' ')
						"
						clearable
					/>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<IconButton
						size="sm"
						variant="muted"
						icon="download"
						label="Pull Rebase"
						title="Pull Rebase"
						:loading="runningAction === 'pull-rebase'"
						:disabled="isLoading || selectedRepositories.length === 0"
						@click="executeAction('pull-rebase')"
					/>
					<IconButton
						size="sm"
						variant="muted"
						icon="arrow-right-left"
						label="Sync Soft"
						title="Sync Soft"
						:loading="runningAction === 'sync-soft'"
						:disabled="isLoading || selectedRepositories.length === 0"
						@click="executeAction('sync-soft')"
					/>
					<IconButton
						size="sm"
						variant="danger"
						icon="shield-alert"
						label="Sync Hard"
						title="Sync Hard"
						:loading="runningAction === 'sync-hard'"
						:disabled="isLoading || selectedRepositories.length === 0"
						@click="executeAction('sync-hard')"
					/>
					<IconButton
						size="sm"
						variant="accent"
						icon="upload"
						label="Push"
						title="Push"
						:loading="runningAction === 'push'"
						:disabled="isLoading || selectedRepositories.length === 0"
						@click="executeAction('push')"
					/>
					<IconButton
						size="sm"
						variant="muted"
						icon="rotate-ccw"
						label="Обновить статусы"
						title="Обновить статусы"
						:loading="isLoading && !runningAction"
						@click="refreshSnapshot({ preserveSelection: true })"
					/>
				</div>
				<div class="grid min-w-[22rem] flex-1 grid-cols-2 gap-2">
					<input
						v-model="branchDraft.type"
						type="text"
						class="rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-3 py-2 text-sm"
						placeholder="type"
					/>
					<input
						v-model="branchDraft.ticketKey"
						type="text"
						class="rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-3 py-2 text-sm uppercase"
						placeholder="ticket key"
					/>
					<input
						v-model="branchDraft.ticketNumber"
						type="text"
						class="rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-3 py-2 text-sm"
						placeholder="number"
					/>
					<input
						v-model="branchDraft.slug"
						type="text"
						class="rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-3 py-2 text-sm"
						placeholder="optional slug"
					/>
				</div>
				<div class="flex items-center gap-2">
					<SummaryChip :text="branchPreview" size="xs" variant="neutral" mono />
					<button
						type="button"
						class="rounded-lg border border-solid border-[var(--background-modifier-border)] px-3 py-1.5 text-sm"
						:disabled="
							runningAction === 'create-branch' || !canCreateBranches()
						"
						@click="createBranches"
					>
						{{
							runningAction === 'create-branch'
								? 'Creating…'
								: 'Create Branches'
						}}
					</button>
				</div>
			</div>
		</template>

		<template #message>
			<StatusBanner
				v-if="screenMessage"
				:kind="screenMessage.kind"
				:text="screenMessage.text"
				@dismiss="clearMessage"
			/>
		</template>

		<div
			class="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]"
		>
			<PanelFrame class="min-h-0" :scroll="true" padding="none" gap="none">
				<template #header>
					<div class="px-3 pt-3">
						<SectionHeader
							title="Repositories"
							:subtitle="`Managed git repositories from workspace-meta/projects`"
						>
							<template #actions>
								<div class="flex items-center gap-2">
									<SummaryChip
										:text="`selected ${selectedRepositories.length}`"
										size="xs"
										variant="accent"
									/>
								</div>
							</template>
						</SectionHeader>
					</div>
				</template>
				<template #toolbar>
					<div class="flex flex-col gap-2 px-3 pb-3 pt-2">
						<div class="flex flex-wrap gap-1.5">
							<SummaryChip :text="`repos ${summary.total}`" size="xs" />
							<SummaryChip
								:text="`clean ${summary.clean}`"
								size="xs"
								variant="success"
							/>
							<SummaryChip
								:text="`dirty ${summary.dirty}`"
								size="xs"
								variant="warning"
							/>
							<SummaryChip
								:text="`conflicts ${summary.conflicts}`"
								size="xs"
								variant="danger"
							/>
							<SummaryChip
								:text="`errors ${summary.errors}`"
								size="xs"
								variant="danger"
							/>
						</div>

						<div class="flex flex-wrap gap-2">
							<SummaryChip
								:text="
									allVisibleSelected ? 'unselect visible' : 'select visible'
								"
								size="xs"
								toggle
								:pressed="allVisibleSelected"
								@click="toggleSelectVisible"
							/>
							<SummaryChip
								v-if="someVisibleSelected"
								text="clear selection"
								size="xs"
								toggle
								@click="clearSelection"
							/>
						</div>
					</div>
				</template>
				<div class="flex min-h-0 flex-1 flex-col gap-3">
					<PlaceholderState
						v-if="isLoading && !snapshot"
						variant="loading"
						text="Сбор git-состояния..."
					/>

					<template v-else-if="snapshot">
						<div class="min-h-0 overflow-auto px-1 pb-1">
							<SelectableEntityList
								:items="filteredRepositories"
								:get-key="repo => (repo as WorkspaceStatusRepositoryRecord).id"
								:get-title="
									repo => (repo as WorkspaceStatusRepositoryRecord).name
								"
								:get-meta="
									repo =>
										getCompactRepositoryMeta(
											repo as WorkspaceStatusRepositoryRecord
										)
								"
								:selected-keys="[...selectedIds]"
								:on-select="
									repo =>
										toggleRepositorySelection(
											(repo as WorkspaceStatusRepositoryRecord).id
										)
								"
								empty-text="Managed repositories не найдены."
								compact
								hoverable
								:show-edit-button="false"
								item-header-layout="column"
							>
								<template #badges="{ item }">
									<SummaryChip
										:text="
											getRepositoryStateText(
												item as WorkspaceStatusRepositoryRecord
											)
										"
										size="xs"
										:variant="
											getRepositoryVariant(
												item as WorkspaceStatusRepositoryRecord
											)
										"
									/>
								</template>
							</SelectableEntityList>
						</div>
					</template>
				</div>
			</PanelFrame>

			<PanelFrame class="min-h-0" :scroll="true" padding="none" gap="none">
				<template v-if="selectedRepositories.length > 0" #header>
					<div class="px-3 pt-3">
						<SectionHeader
							:title="
								selectedRepositories.length === 1
									? primarySelectedRepository?.name || 'Selected repository'
									: `Selected repositories: ${selectedRepositories.length}`
							"
							:subtitle="
								selectedRepositories.length === 1
									? `${primarySelectedRepository?.path || ''}`
									: 'Коммиты и дополнительные детали по текущему выделению.'
							"
						/>
					</div>
				</template>
				<div class="flex min-h-0 flex-1 flex-col gap-2">
					<PlaceholderState
						v-if="isLoading && !snapshot"
						variant="loading"
						text="Чтение managed repositories..."
					/>
					<PlaceholderState
						v-else-if="!snapshot"
						variant="empty"
						text="Состояние workspace появится здесь после успешного чтения registry."
					/>
					<PlaceholderState
						v-else-if="filteredRepositories.length === 0"
						variant="empty"
						text="По текущему фильтру репозитории не найдены."
					/>
					<template v-else-if="selectedRepositories.length === 0">
						<PlaceholderState
							variant="empty"
							title="Nothing selected"
							text="Выберите один или несколько репозиториев слева, чтобы открыть рабочую область."
						/>
					</template>
					<template v-else>
						<div class="flex flex-wrap gap-2 px-3 pt-3">
							<SummaryChip
								:text="`${selectedRepositories.length} selected`"
								size="xs"
								variant="accent"
							/>
							<SummaryChip
								v-if="primarySelectedRepository?.head"
								:text="primarySelectedRepository.head"
								size="xs"
								variant="neutral"
								mono
							/>
							<SummaryChip
								v-if="
									selectedRepositories.length === 1 && primarySelectedRepository
								"
								:text="getRepositoryStateText(primarySelectedRepository)"
								size="xs"
								:variant="getRepositoryVariant(primarySelectedRepository)"
							/>
						</div>

						<div
							class="grid grid-cols-1 gap-3 px-3 pb-3 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]"
						>
							<div class="flex flex-col gap-3">
								<MessageCard
									v-if="
										selectedRepositories.length === 1 &&
										primarySelectedRepository
									"
									:title="primarySelectedRepository.name"
									:subtitle="`${primarySelectedRepository.id} · ${primarySelectedRepository.kind}`"
									:meta="primarySelectedRepository.path"
									compact
								>
									<template #badges>
										<SummaryChip
											:text="getRepositoryStateText(primarySelectedRepository)"
											size="xs"
											:variant="getRepositoryVariant(primarySelectedRepository)"
										/>
										<SummaryChip
											:text="primarySelectedRepository.ticketId || 'no ticket'"
											size="xs"
											:variant="
												primarySelectedRepository.ticketId ? 'accent' : 'danger'
											"
											mono
										/>
									</template>
									<template #body>
										<div class="flex flex-col gap-1.5 text-[12px] leading-snug">
											<div
												v-text="
													`tracking: ${getTrackingText(primarySelectedRepository)}`
												"
											/>
											<div
												v-text="
													`changes: ${getChangesText(primarySelectedRepository)}`
												"
											/>
											<div
												v-text="
													`submodules: ${getSubmoduleSummary(primarySelectedRepository)}`
												"
											/>
											<div
												v-if="primarySelectedRepository.absolutePath"
												class="text-[var(--text-muted)]"
												v-text="primarySelectedRepository.absolutePath"
											/>
											<div
												v-if="primarySelectedRepository.error"
												class="text-[var(--text-error)]"
												v-text="primarySelectedRepository.error"
											/>
										</div>
									</template>
								</MessageCard>
							</div>

							<div class="flex min-h-0 flex-col gap-3">
								<div
									v-if="selectedRepositoriesWithDrafts.length > 0"
									class="flex flex-col gap-2"
								>
									<SectionHeader
										title="Commit Drafts"
										subtitle="Рабочая область для подготовки commit message по выбранным репозиториям."
									/>

									<EntityList
										:items="selectedRepositoriesWithDrafts"
										:get-key="
											item =>
												(
													item as {
														repository: WorkspaceStatusRepositoryRecord;
													}
												).repository.id
										"
										:get-title="
											item =>
												(
													item as {
														repository: WorkspaceStatusRepositoryRecord;
													}
												).repository.name
										"
										:get-subtitle="
											item => {
												const repository = (
													item as {
														repository: WorkspaceStatusRepositoryRecord;
													}
												).repository;
												return `${repository.head} · ${repository.path}`;
											}
										"
										:get-meta="
											item => {
												const repository = (
													item as {
														repository: WorkspaceStatusRepositoryRecord;
													}
												).repository;
												return `ticket ${repository.ticketId || 'missing'} · ${getChangesText(repository)}`;
											}
										"
										compact
									>
										<template #badges="{ item }">
											<template
												v-for="chip in [
													item as {
														repository: WorkspaceStatusRepositoryRecord;
														draft: CommitUiState;
													},
												]"
												:key="chip.repository.id"
											>
												<SummaryChip
													:text="chip.repository.ticketId || 'no ticket'"
													size="xs"
													:variant="
														chip.repository.ticketId ? 'accent' : 'danger'
													"
													mono
												/>
												<SummaryChip
													:text="chip.repository.commitType"
													size="xs"
													variant="neutral"
												/>
												<SummaryChip
													:text="
														chip.repository.stagedCount > 0
															? `staged ${chip.repository.stagedCount}`
															: 'nothing staged'
													"
													size="xs"
													:variant="
														chip.repository.stagedCount > 0
															? 'success'
															: 'warning'
													"
												/>
											</template>
										</template>
										<template #body="{ item }">
											<div
												v-for="entry in [
													item as {
														repository: WorkspaceStatusRepositoryRecord;
														draft: CommitUiState;
													},
												]"
												:key="entry.repository.id"
												class="flex flex-col gap-2"
											>
												<div class="flex flex-col gap-2">
													<div
														v-if="entry.repository.submoduleDirtyCount > 0"
														class="text-[12px] text-[var(--text-warning)]"
													>
														Dirty submodule detected. Сначала закоммитьте
														изменения внутри submodule, затем коммитьте pointer
														в parent repo.
													</div>
													<div
														v-if="entry.draft.warnings.length > 0"
														class="rounded-md border border-solid border-[var(--background-modifier-border)] bg-[var(--background-secondary)] px-2 py-1.5 text-[12px] text-[var(--text-muted)]"
													>
														<div
															v-for="warning in entry.draft.warnings"
															:key="warning"
															v-text="warning"
														/>
													</div>
													<div
														v-if="entry.draft.error"
														class="text-[12px] text-[var(--text-error)]"
														v-text="entry.draft.error"
													/>
													<textarea
														:value="entry.draft.messageText"
														rows="6"
														class="min-h-[8rem] rounded-lg border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] px-3 py-2 text-sm"
														placeholder="Generated commit draft will appear here..."
														@input="
															updateDraftText(
																entry.repository.id,
																($event.target as HTMLTextAreaElement).value
															)
														"
													/>
													<div class="flex flex-wrap gap-2">
														<button
															type="button"
															class="rounded-lg border border-solid border-[var(--background-modifier-border)] px-3 py-1.5 text-sm"
															:disabled="
																entry.draft.isGenerating ||
																!canGenerateDraft(entry.repository)
															"
															@click="
																generateDraftForRepository(entry.repository)
															"
														>
															{{
																entry.draft.isGenerating
																	? 'Generating…'
																	: 'Generate Message'
															}}
														</button>
														<button
															type="button"
															class="mod-cta rounded-lg px-3 py-1.5 text-sm"
															:disabled="
																entry.draft.isCommitting ||
																!canCommit(entry.repository, entry.draft)
															"
															@click="commitRepository(entry.repository)"
														>
															{{
																entry.draft.isCommitting
																	? 'Committing…'
																	: 'Commit'
															}}
														</button>
													</div>
												</div>
											</div>
										</template>
									</EntityList>
								</div>

								<div
									v-if="actionResults.length > 0"
									class="flex flex-col gap-2"
								>
									<SectionHeader
										title="Last Action"
										subtitle="Последние результаты массовых или точечных git-операций."
									/>
									<EntityList
										:items="actionResults"
										:get-key="
											result =>
												`${(result as WorkspaceActionResult).action}-${(result as WorkspaceActionResult).id}-${(result as WorkspaceActionResult).ok}`
										"
										:get-title="
											result => (result as WorkspaceActionResult).name
										"
										:get-subtitle="
											result => (result as WorkspaceActionResult).action
										"
										:get-meta="
											result =>
												(result as WorkspaceActionResult).ok ? 'ok' : 'failed'
										"
										compact
									>
										<template #badges="{ item }">
											<SummaryChip
												:text="
													(item as WorkspaceActionResult).ok ? 'ok' : 'failed'
												"
												size="xs"
												:variant="
													(item as WorkspaceActionResult).ok
														? 'success'
														: 'danger'
												"
											/>
										</template>
										<template #body="{ item }">
											<div
												class="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug"
											>
												{{
													(item as WorkspaceActionResult).error ||
													(item as WorkspaceActionResult).log ||
													'no output'
												}}
											</div>
										</template>
									</EntityList>
								</div>
							</div>
						</div>
					</template>
				</div>
			</PanelFrame>
		</div>
	</AppShell>
</template>
