/**
 * @module obsidian-plugin/features/workspace-status/transport/workspace-status-bridge
 * @description Bridge для чтения registry из `workspace-meta`, показа git-состояния,
 * генерации commit draft через Kora server и выполнения git-действий локально.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { App as ObsidianApp } from 'obsidian';
import type {
	GitCommitDraftRequest,
	GitCommitDraftResponse,
	GitCommitDraftSubmoduleRecord,
} from '../../../../../../packages/contracts/src/git-commit-draft';

const execFileAsync = promisify(execFile);
const TICKET_ID_REGEX = /\b([A-Z]+-\d+)\b/;
const DEFAULT_SERVER_HOST = '127.0.0.1';
const DEFAULT_SERVER_PORT = 8124;
const MAX_STAGED_PATCH_LENGTH = 12000;

interface WorkspaceRegistryProject {
	id: string;
	name: string;
	path: string;
	kind: string;
	order: number;
	ui?: {
		hiddenInWorkspaceStatus?: boolean;
	};
	repo?: {
		defaultBranch?: string;
		defaultRemote?: string;
	};
	automation?: {
		status?: boolean;
	};
}

export type WorkspaceGitAction =
	| 'refresh'
	| 'pull-rebase'
	| 'switch-canonical'
	| 'push'
	| 'commit'
	| 'create-branch';

export interface WorkspaceStatusSubmoduleRecord {
	name: string;
	path: string;
	absolutePath: string;
	exists: boolean;
	isGitRepository: boolean;
	head: string;
	upstream: string;
	ahead: number;
	behind: number;
	isDirty: boolean;
	stagedCount: number;
	unstagedCount: number;
	untrackedCount: number;
	hasConflicts: boolean;
	error: string;
}

export interface WorkspaceStatusRepositoryRecord {
	id: string;
	name: string;
	kind: string;
	path: string;
	absolutePath: string;
	hiddenInWorkspaceStatus: boolean;
	canonicalBranch: string;
	canonicalRemote: string;
	statusEnabled: boolean;
	exists: boolean;
	isGitRepository: boolean;
	head: string;
	upstream: string;
	ticketId: string;
	commitType: string;
	ahead: number;
	behind: number;
	isDirty: boolean;
	stagedCount: number;
	unstagedCount: number;
	untrackedCount: number;
	hasConflicts: boolean;
	error: string;
	submodules: WorkspaceStatusSubmoduleRecord[];
	submoduleCount: number;
	submoduleDirtyCount: number;
	submoduleBehindCount: number;
	submoduleErrorCount: number;
	stagedFiles: string[];
	stagedNameStatus: string[];
	stagedStat: string;
	stagedPatch: string;
}

export interface WorkspaceStatusSnapshot {
	workspaceMetaDir: string;
	workspaceRoot: string;
	generatedAt: string;
	repositories: WorkspaceStatusRepositoryRecord[];
}

export interface WorkspaceActionResult {
	id: string;
	name: string;
	ok: boolean;
	action: WorkspaceGitAction;
	log: string;
	error: string;
}

export interface WorkspaceCommitDraftState {
	repoId: string;
	ticketId: string;
	messageText: string;
	warnings: string[];
}

interface GitExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

interface MutableGitState {
	head: string;
	upstream: string;
	ticketId: string;
	commitType: string;
	ahead: number;
	behind: number;
	isDirty: boolean;
	stagedCount: number;
	unstagedCount: number;
	untrackedCount: number;
	hasConflicts: boolean;
	error: string;
	stagedFiles: string[];
	stagedNameStatus: string[];
	stagedStat: string;
	stagedPatch: string;
}

interface WorkspaceStatusBridgeConfig {
	serverHost?: string;
	serverPort?: number;
}

interface CommitDraftApiResponse {
	success: boolean;
	draft?: GitCommitDraftResponse;
	error?: string;
}

export interface WorkspaceBranchDraftInput {
	type: string;
	ticketKey: string;
	ticketNumber: string;
	slug: string;
}

function resolveWorkspaceMetaDir(app: ObsidianApp): string {
	const vaultBasePath = (app.vault.adapter as { basePath?: string }).basePath;
	if (!vaultBasePath) {
		throw new Error('Не удалось определить basePath vault для Obsidian.');
	}
	return path.resolve(vaultBasePath, '..', 'workspace-meta');
}

function extractTicketId(branch: string): string {
	const match = branch.match(TICKET_ID_REGEX);
	return match?.[1] || '';
}

function inferCommitType(branch: string): string {
	const prefix = branch.split('/')[0]?.trim().toLowerCase();
	switch (prefix) {
		case 'feat':
		case 'fix':
		case 'chore':
		case 'refactor':
		case 'docs':
		case 'test':
		case 'perf':
		case 'build':
		case 'ci':
			return prefix;
		default:
			return 'chore';
	}
}

function slugifyBranchPart(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function buildBranchName(input: WorkspaceBranchDraftInput): string {
	const branchType = input.type.trim().toLowerCase();
	const ticketKey = input.ticketKey.trim().toUpperCase();
	const ticketNumber = input.ticketNumber.trim();
	const slug = slugifyBranchPart(input.slug);
	const ticket = `${ticketKey}-${ticketNumber}`;
	return slug ? `${branchType}/${ticket}-${slug}` : `${branchType}/${ticket}`;
}

async function runGit(args: string[], cwd: string): Promise<GitExecResult> {
	try {
		const result = await execFileAsync('git', args, {
			cwd,
			windowsHide: true,
			maxBuffer: 1024 * 1024 * 16,
		});
		return {
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			exitCode: 0,
		};
	} catch (error) {
		const failure = error as NodeJS.ErrnoException & {
			stdout?: string;
			stderr?: string;
			code?: number | string;
		};
		return {
			stdout: failure.stdout ?? '',
			stderr: failure.stderr ?? failure.message ?? '',
			exitCode: typeof failure.code === 'number' ? failure.code : 1,
		};
	}
}

function buildLog(result: GitExecResult): string {
	return [result.stdout.trim(), result.stderr.trim()]
		.filter(Boolean)
		.join('\n');
}

async function ensureGitRepository(repositoryPath: string): Promise<void> {
	const gitDirCheck = await runGit(['rev-parse', '--git-dir'], repositoryPath);
	if (gitDirCheck.exitCode !== 0) {
		throw new Error('Путь не является git-репозиторием.');
	}
}

async function loadProjects(
	workspaceMetaDir: string
): Promise<WorkspaceRegistryProject[]> {
	const projectsDir = path.join(workspaceMetaDir, 'projects');
	const entries = await fs.readdir(projectsDir, { withFileTypes: true });
	const projects = await Promise.all(
		entries
			.filter(entry => entry.isFile() && entry.name.endsWith('.json'))
			.map(async entry => {
				const raw = await fs.readFile(
					path.join(projectsDir, entry.name),
					'utf8'
				);
				return JSON.parse(raw) as WorkspaceRegistryProject;
			})
	);

	return projects.sort((left, right) => {
		if (left.order !== right.order) {
			return left.order - right.order;
		}
		return left.name.localeCompare(right.name);
	});
}

function resolveProjectAbsolutePath(
	project: WorkspaceRegistryProject,
	workspaceRoot: string
): string {
	return path.resolve(workspaceRoot, project.path);
}

function formatWorkspaceRelativePath(
	workspaceRoot: string,
	targetPath: string
): string {
	const relativePath = path.relative(workspaceRoot, targetPath);
	if (!relativePath || relativePath.startsWith('..')) {
		return targetPath;
	}
	return relativePath;
}

function findProjectByAbsolutePath(
	projects: WorkspaceRegistryProject[],
	workspaceRoot: string,
	targetPath: string
): WorkspaceRegistryProject | null {
	const normalizedTarget = path.normalize(targetPath);
	return (
		projects.find(
			project =>
				path.normalize(resolveProjectAbsolutePath(project, workspaceRoot)) ===
				normalizedTarget
		) || null
	);
}

async function collectGitState(
	repositoryPath: string
): Promise<MutableGitState> {
	const [
		headResult,
		upstreamResult,
		aheadBehindResult,
		statusResult,
		stagedNameStatusResult,
		stagedFilesResult,
		stagedStatResult,
		stagedPatchResult,
	] = await Promise.all([
		runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], repositoryPath),
		runGit(
			['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
			repositoryPath
		),
		runGit(
			['rev-list', '--left-right', '--count', 'HEAD...@{u}'],
			repositoryPath
		),
		runGit(['status', '--porcelain=v1', '--branch'], repositoryPath),
		runGit(['diff', '--cached', '--name-status'], repositoryPath),
		runGit(['diff', '--cached', '--name-only'], repositoryPath),
		runGit(['diff', '--cached', '--stat'], repositoryPath),
		runGit(['diff', '--cached', '--unified=3'], repositoryPath),
	]);

	const head =
		headResult.exitCode === 0 ? headResult.stdout.trim() : 'detached HEAD';
	const state: MutableGitState = {
		head,
		upstream: upstreamResult.exitCode === 0 ? upstreamResult.stdout.trim() : '',
		ticketId: extractTicketId(head),
		commitType: inferCommitType(head),
		ahead: 0,
		behind: 0,
		isDirty: false,
		stagedCount: 0,
		unstagedCount: 0,
		untrackedCount: 0,
		hasConflicts: false,
		error: '',
		stagedFiles:
			stagedFilesResult.exitCode === 0
				? stagedFilesResult.stdout
						.split(/\r?\n/)
						.map(line => line.trim())
						.filter(Boolean)
				: [],
		stagedNameStatus:
			stagedNameStatusResult.exitCode === 0
				? stagedNameStatusResult.stdout
						.split(/\r?\n/)
						.map(line => line.trim())
						.filter(Boolean)
				: [],
		stagedStat:
			stagedStatResult.exitCode === 0 ? stagedStatResult.stdout.trim() : '',
		stagedPatch:
			stagedPatchResult.exitCode === 0
				? stagedPatchResult.stdout.trim().slice(0, MAX_STAGED_PATCH_LENGTH)
				: '',
	};

	if (aheadBehindResult.exitCode === 0) {
		const [aheadRaw, behindRaw] = aheadBehindResult.stdout.trim().split(/\s+/);
		state.ahead = Number(aheadRaw || 0);
		state.behind = Number(behindRaw || 0);
	}

	if (statusResult.exitCode !== 0) {
		state.error =
			statusResult.stderr.trim() || 'Не удалось прочитать git status.';
		return state;
	}

	const statusLines = statusResult.stdout
		.split(/\r?\n/)
		.map(line => line.trimEnd())
		.filter(Boolean)
		.filter(line => !line.startsWith('## '));

	for (const line of statusLines) {
		const x = line[0] ?? ' ';
		const y = line[1] ?? ' ';
		if (x === '?' && y === '?') {
			state.untrackedCount += 1;
			continue;
		}
		if (x !== ' ') {
			state.stagedCount += 1;
		}
		if (y !== ' ') {
			state.unstagedCount += 1;
		}
		if (
			x === 'U' ||
			y === 'U' ||
			(x === 'A' && y === 'A') ||
			(x === 'D' && y === 'D')
		) {
			state.hasConflicts = true;
		}
	}

	state.isDirty =
		state.stagedCount > 0 ||
		state.unstagedCount > 0 ||
		state.untrackedCount > 0;

	return state;
}

async function readSubmodulePaths(
	repositoryPath: string
): Promise<Array<{ name: string; path: string }>> {
	const result = await runGit(
		[
			'config',
			'--file',
			'.gitmodules',
			'--get-regexp',
			'^submodule\\..*\\.path$',
		],
		repositoryPath
	);
	if (result.exitCode !== 0) {
		return [];
	}

	return result.stdout
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean)
		.map(line => {
			const match = line.match(/^submodule\.(.+)\.path\s+(.+)$/);
			if (!match) {
				return null;
			}
			return {
				name: match[1],
				path: match[2],
			};
		})
		.filter((item): item is { name: string; path: string } => Boolean(item));
}

async function inspectSubmodule(
	repositoryPath: string,
	definition: { name: string; path: string }
): Promise<WorkspaceStatusSubmoduleRecord> {
	const absolutePath = path.resolve(repositoryPath, definition.path);
	const baseRecord: WorkspaceStatusSubmoduleRecord = {
		name: definition.name,
		path: definition.path,
		absolutePath,
		exists: false,
		isGitRepository: false,
		head: '',
		upstream: '',
		ahead: 0,
		behind: 0,
		isDirty: false,
		stagedCount: 0,
		unstagedCount: 0,
		untrackedCount: 0,
		hasConflicts: false,
		error: '',
	};

	try {
		const stat = await fs.stat(absolutePath);
		if (!stat.isDirectory()) {
			return {
				...baseRecord,
				error: 'Submodule path существует, но не является директорией.',
			};
		}
		baseRecord.exists = true;
	} catch {
		return {
			...baseRecord,
			error: 'Submodule path отсутствует локально.',
		};
	}

	const gitDirCheck = await runGit(['rev-parse', '--git-dir'], absolutePath);
	if (gitDirCheck.exitCode !== 0) {
		return {
			...baseRecord,
			error: 'Submodule path не является git-репозиторием.',
		};
	}

	const gitState = await collectGitState(absolutePath);
	return {
		...baseRecord,
		isGitRepository: true,
		...gitState,
	};
}

async function inspectRepository(
	project: WorkspaceRegistryProject,
	workspaceRoot: string
): Promise<WorkspaceStatusRepositoryRecord> {
	const absolutePath = resolveProjectAbsolutePath(project, workspaceRoot);
	const baseRecord: WorkspaceStatusRepositoryRecord = {
		id: project.id,
		name: project.name,
		kind: project.kind,
		path: project.path,
		absolutePath,
		hiddenInWorkspaceStatus: Boolean(project.ui?.hiddenInWorkspaceStatus),
		canonicalBranch: getCanonicalBranch(project),
		canonicalRemote: getCanonicalRemote(project),
		statusEnabled: Boolean(project.automation?.status),
		exists: false,
		isGitRepository: false,
		head: '',
		upstream: '',
		ticketId: '',
		commitType: 'chore',
		ahead: 0,
		behind: 0,
		isDirty: false,
		stagedCount: 0,
		unstagedCount: 0,
		untrackedCount: 0,
		hasConflicts: false,
		error: '',
		submodules: [],
		submoduleCount: 0,
		submoduleDirtyCount: 0,
		submoduleBehindCount: 0,
		submoduleErrorCount: 0,
		stagedFiles: [],
		stagedNameStatus: [],
		stagedStat: '',
		stagedPatch: '',
	};

	try {
		const stat = await fs.stat(absolutePath);
		if (!stat.isDirectory()) {
			return {
				...baseRecord,
				error: 'Путь существует, но не является директорией.',
			};
		}
		baseRecord.exists = true;
	} catch {
		return {
			...baseRecord,
			error: 'Путь не существует локально.',
		};
	}

	const gitDirCheck = await runGit(['rev-parse', '--git-dir'], absolutePath);
	if (gitDirCheck.exitCode !== 0) {
		return {
			...baseRecord,
			error: 'Путь не является git-репозиторием.',
		};
	}

	baseRecord.isGitRepository = true;
	Object.assign(baseRecord, await collectGitState(absolutePath));

	const submoduleDefinitions = await readSubmodulePaths(absolutePath);
	if (submoduleDefinitions.length > 0) {
		baseRecord.submodules = await Promise.all(
			submoduleDefinitions.map(definition =>
				inspectSubmodule(absolutePath, definition)
			)
		);
		baseRecord.submoduleCount = baseRecord.submodules.length;
		baseRecord.submoduleDirtyCount = baseRecord.submodules.filter(
			submodule => submodule.isDirty
		).length;
		baseRecord.submoduleBehindCount = baseRecord.submodules.filter(
			submodule => submodule.behind > 0
		).length;
		baseRecord.submoduleErrorCount = baseRecord.submodules.filter(submodule =>
			Boolean(submodule.error)
		).length;
	}

	return baseRecord;
}

function getCanonicalBranch(project: WorkspaceRegistryProject): string {
	return project.repo?.defaultBranch?.trim() || '';
}

function getCanonicalRemote(project: WorkspaceRegistryProject): string {
	return project.repo?.defaultRemote?.trim() || 'origin';
}

async function runGitAndThrowOnFailure(
	args: string[],
	cwd: string,
	logs: string[]
): Promise<void> {
	const result = await runGit(args, cwd);
	const log = buildLog(result);
	if (log) {
		logs.push(`$ git ${args.join(' ')}\n${log}`);
	} else {
		logs.push(`$ git ${args.join(' ')}`);
	}
	if (result.exitCode !== 0) {
		throw new Error(log || `git ${args.join(' ')} failed`);
	}
}

async function pushRepositoryFamily(
	repositoryPath: string,
	logs: string[]
): Promise<void> {
	const submoduleDefinitions = await readSubmodulePaths(repositoryPath);
	for (const definition of submoduleDefinitions) {
		const submodulePath = path.resolve(repositoryPath, definition.path);
		await ensureGitRepository(submodulePath);
		const submoduleState = await collectGitState(submodulePath);
		if (submoduleState.isDirty || submoduleState.hasConflicts) {
			throw new Error(
				`Submodule ${definition.path} имеет локальные изменения или конфликт.`
			);
		}
		await runGitAndThrowOnFailure(['push'], submodulePath, logs);
	}

	const repositoryState = await collectGitState(repositoryPath);
	if (repositoryState.isDirty || repositoryState.hasConflicts) {
		throw new Error(
			'Репозиторий имеет локальные изменения или конфликт. Push остановлен.'
		);
	}

	await runGitAndThrowOnFailure(['push'], repositoryPath, logs);
}

async function updateRepositoryFamily(
	repositoryPath: string,
	projects: WorkspaceRegistryProject[],
	workspaceRoot: string,
	logs: string[]
): Promise<void> {
	await ensureGitRepository(repositoryPath);
	await runGitAndThrowOnFailure(
		['fetch', '--prune', 'origin'],
		repositoryPath,
		logs
	);

	await runGitAndThrowOnFailure(
		['pull', '--rebase', '--autostash'],
		repositoryPath,
		logs
	);

	const submoduleDefinitions = await readSubmodulePaths(repositoryPath);
	if (submoduleDefinitions.length === 0) {
		return;
	}

	await runGitAndThrowOnFailure(
		['submodule', 'sync', '--recursive'],
		repositoryPath,
		logs
	);

	for (const definition of submoduleDefinitions) {
		const submodulePath = path.resolve(repositoryPath, definition.path);
		const submoduleProject = findProjectByAbsolutePath(
			projects,
			workspaceRoot,
			submodulePath
		);

		if (!submoduleProject) {
			logs.push(
				`$ skip submodule ${definition.path}\nNo managed project entry found for ${formatWorkspaceRelativePath(workspaceRoot, submodulePath)}`
			);
			continue;
		}

		await switchRepositoryToCanonicalBranch(
			submoduleProject,
			submodulePath,
			logs
		);
		await runGitAndThrowOnFailure(
			['pull', '--rebase', '--autostash'],
			submodulePath,
			logs
		);
	}
}

async function switchRepositoryToCanonicalBranch(
	project: WorkspaceRegistryProject,
	repositoryPath: string,
	logs: string[]
): Promise<void> {
	await ensureGitRepository(repositoryPath);

	const canonicalBranch = getCanonicalBranch(project);
	if (!canonicalBranch) {
		throw new Error(
			`Для проекта ${project.id} не задан repo.defaultBranch в registry.`
		);
	}

	const canonicalRemote = getCanonicalRemote(project);
	await runGitAndThrowOnFailure(
		['fetch', '--prune', canonicalRemote],
		repositoryPath,
		logs
	);

	const localBranchCheck = await runGit(
		['show-ref', '--verify', '--quiet', `refs/heads/${canonicalBranch}`],
		repositoryPath
	);

	if (localBranchCheck.exitCode === 0) {
		await runGitAndThrowOnFailure(
			['switch', canonicalBranch],
			repositoryPath,
			logs
		);
		return;
	}

	const remoteRef = `${canonicalRemote}/${canonicalBranch}`;
	const remoteBranchCheck = await runGit(
		['show-ref', '--verify', '--quiet', `refs/remotes/${remoteRef}`],
		repositoryPath
	);
	if (remoteBranchCheck.exitCode !== 0) {
		throw new Error(`Не найдена каноническая ветка ${remoteRef}.`);
	}

	await runGitAndThrowOnFailure(
		['switch', '--track', '-c', canonicalBranch, remoteRef],
		repositoryPath,
		logs
	);
}

async function switchRepositoryFamilyToCanonicalBranch(
	project: WorkspaceRegistryProject,
	repositoryPath: string,
	projects: WorkspaceRegistryProject[],
	workspaceRoot: string,
	logs: string[]
): Promise<void> {
	await switchRepositoryToCanonicalBranch(project, repositoryPath, logs);

	const submoduleDefinitions = await readSubmodulePaths(repositoryPath);
	for (const definition of submoduleDefinitions) {
		const submodulePath = path.resolve(repositoryPath, definition.path);
		const submoduleProject = findProjectByAbsolutePath(
			projects,
			workspaceRoot,
			submodulePath
		);

		if (!submoduleProject) {
			logs.push(
				`$ skip submodule ${definition.path}\nNo managed project entry found for ${formatWorkspaceRelativePath(workspaceRoot, submodulePath)}`
			);
			continue;
		}

		await switchRepositoryToCanonicalBranch(
			submoduleProject,
			submodulePath,
			logs
		);
	}
}

function makeCommitMessage(draft: WorkspaceCommitDraftState): string {
	const normalizedBody = draft.messageText.replace(/\r\n/g, '\n').trim();
	return normalizedBody.endsWith('\n') ? normalizedBody : `${normalizedBody}\n`;
}

export class WorkspaceStatusBridge {
	private readonly baseUrl: string;

	constructor(
		private readonly app: ObsidianApp,
		config: WorkspaceStatusBridgeConfig = {}
	) {
		const host = config.serverHost || DEFAULT_SERVER_HOST;
		const port = config.serverPort || DEFAULT_SERVER_PORT;
		this.baseUrl = `http://${host}:${port}`;
	}

	async readSnapshot(): Promise<WorkspaceStatusSnapshot> {
		const workspaceMetaDir = resolveWorkspaceMetaDir(this.app);
		const workspaceRoot = path.resolve(workspaceMetaDir, '..');
		const projects = await loadProjects(workspaceMetaDir);
		const repositories = await Promise.all(
			projects.map(project => inspectRepository(project, workspaceRoot))
		);

		return {
			workspaceMetaDir,
			workspaceRoot,
			generatedAt: new Date().toISOString(),
			repositories,
		};
	}

	async runAction(
		action: WorkspaceGitAction,
		repositoryIds: string[]
	): Promise<WorkspaceActionResult[]> {
		if (action === 'refresh') {
			return [];
		}

		const workspaceMetaDir = resolveWorkspaceMetaDir(this.app);
		const workspaceRoot = path.resolve(workspaceMetaDir, '..');
		const projects = await loadProjects(workspaceMetaDir);
		const selectedProjects = projects.filter(project =>
			repositoryIds.includes(project.id)
		);

		const results: WorkspaceActionResult[] = [];
		for (const project of selectedProjects) {
			const logs: string[] = [];
			const repositoryPath = resolveProjectAbsolutePath(project, workspaceRoot);
			try {
				if (action === 'push') {
					await pushRepositoryFamily(repositoryPath, logs);
				} else if (action === 'switch-canonical') {
					await switchRepositoryFamilyToCanonicalBranch(
						project,
						repositoryPath,
						projects,
						workspaceRoot,
						logs
					);
				} else {
					await updateRepositoryFamily(
						repositoryPath,
						projects,
						workspaceRoot,
						logs
					);
				}
				results.push({
					id: project.id,
					name: project.name,
					ok: true,
					action,
					log: logs.join('\n\n'),
					error: '',
				});
			} catch (error) {
				results.push({
					id: project.id,
					name: project.name,
					ok: false,
					action,
					log: logs.join('\n\n'),
					error: (error as Error).message,
				});
			}
		}

		return results;
	}

	async createBranches(
		repositoryIds: string[],
		input: WorkspaceBranchDraftInput
	): Promise<WorkspaceActionResult[]> {
		const branchName = buildBranchName(input);
		const workspaceMetaDir = resolveWorkspaceMetaDir(this.app);
		const workspaceRoot = path.resolve(workspaceMetaDir, '..');
		const projects = await loadProjects(workspaceMetaDir);
		const selectedProjects = projects.filter(project =>
			repositoryIds.includes(project.id)
		);

		const results: WorkspaceActionResult[] = [];
		for (const project of selectedProjects) {
			const logs: string[] = [];
			const repositoryPath = path.resolve(workspaceRoot, project.path);
			try {
				await ensureGitRepository(repositoryPath);
				await runGitAndThrowOnFailure(
					['switch', '-c', branchName],
					repositoryPath,
					logs
				);
				results.push({
					id: project.id,
					name: project.name,
					ok: true,
					action: 'create-branch',
					log: logs.join('\n\n'),
					error: '',
				});
			} catch (error) {
				results.push({
					id: project.id,
					name: project.name,
					ok: false,
					action: 'create-branch',
					log: logs.join('\n\n'),
					error: (error as Error).message,
				});
			}
		}

		return results;
	}

	async generateCommitDraft(
		repository: WorkspaceStatusRepositoryRecord
	): Promise<WorkspaceCommitDraftState> {
		if (!repository.ticketId) {
			throw new Error('Не удалось извлечь номер задачи из branch.');
		}
		if (repository.stagedCount === 0) {
			throw new Error('Нет staged changes для генерации commit message.');
		}

		const request: GitCommitDraftRequest = {
			repoId: repository.id,
			repoName: repository.name,
			branch: repository.head,
			ticketId: repository.ticketId,
			stagedFiles: repository.stagedFiles,
			stagedNameStatus: repository.stagedNameStatus,
			stagedStat: repository.stagedStat,
			stagedPatch: repository.stagedPatch,
			submodules: repository.submodules.map<GitCommitDraftSubmoduleRecord>(
				submodule => ({
					name: submodule.name,
					path: submodule.path,
					head: submodule.head,
					upstream: submodule.upstream,
					isDirty: submodule.isDirty,
					hasConflicts: submodule.hasConflicts,
				})
			),
			rules: {
				subjectFormat: '<type>: <TICKET-ID> <summary>',
				requireTicketAfterColon: true,
				bodyOptional: true,
			},
		};

		const response = await fetch(`${this.baseUrl}/git/commit-message`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		});

		const payload = (await response
			.json()
			.catch(() => null)) as CommitDraftApiResponse | null;
		if (!response.ok || !payload?.success || !payload.draft) {
			throw new Error(
				payload?.error || 'Не удалось сгенерировать commit draft.'
			);
		}

		const messageText = [
			payload.draft.subject.trim(),
			...payload.draft.bodyLines,
		]
			.join('\n')
			.trim();

		return {
			repoId: repository.id,
			ticketId: repository.ticketId,
			messageText,
			warnings: payload.draft.warnings,
		};
	}

	async commitRepository(
		repository: WorkspaceStatusRepositoryRecord,
		draft: WorkspaceCommitDraftState
	): Promise<WorkspaceActionResult> {
		const logs: string[] = [];
		const repositoryPath = repository.absolutePath;
		try {
			await ensureGitRepository(repositoryPath);
			const currentState = await collectGitState(repositoryPath);
			if (!currentState.ticketId) {
				throw new Error('Не удалось извлечь номер задачи из branch.');
			}
			if (currentState.hasConflicts) {
				throw new Error(
					'В репозитории есть merge conflicts. Commit заблокирован.'
				);
			}
			if (currentState.stagedCount === 0) {
				throw new Error('Нет staged changes для commit.');
			}

			const submoduleDefinitions = await readSubmodulePaths(repositoryPath);
			for (const definition of submoduleDefinitions) {
				const submodulePath = path.resolve(repositoryPath, definition.path);
				const submoduleState = await collectGitState(submodulePath);
				if (submoduleState.isDirty) {
					throw new Error(
						`Submodule ${definition.path} dirty. Сначала закоммитьте изменения внутри submodule.`
					);
				}
				if (submoduleState.hasConflicts) {
					throw new Error(
						`Submodule ${definition.path} содержит конфликт. Commit заблокирован.`
					);
				}
			}

			const tempFilePath = path.join(
				os.tmpdir(),
				`kora-commit-${repository.id}-${Date.now()}.txt`
			);
			await fs.writeFile(tempFilePath, makeCommitMessage(draft), 'utf8');
			try {
				await runGitAndThrowOnFailure(
					['commit', '--file', tempFilePath],
					repositoryPath,
					logs
				);
			} finally {
				await fs.unlink(tempFilePath).catch(() => undefined);
			}

			return {
				id: repository.id,
				name: repository.name,
				ok: true,
				action: 'commit',
				log: logs.join('\n\n'),
				error: '',
			};
		} catch (error) {
			return {
				id: repository.id,
				name: repository.name,
				ok: false,
				action: 'commit',
				log: logs.join('\n\n'),
				error: (error as Error).message,
			};
		}
	}
}
