export interface GitCommitDraftSubmoduleRecord {
	name: string;
	path: string;
	head: string;
	upstream: string;
	isDirty: boolean;
	hasConflicts: boolean;
}

export interface GitCommitDraftRequest {
	repoId: string;
	repoName: string;
	branch: string;
	ticketId: string;
	stagedFiles: string[];
	stagedNameStatus: string[];
	stagedStat: string;
	stagedPatch: string;
	submodules: GitCommitDraftSubmoduleRecord[];
	rules: {
		subjectFormat: string;
		requireTicketAfterColon: boolean;
		bodyOptional: boolean;
	};
}

export interface GitCommitDraftResponse {
	subject: string;
	bodyLines: string[];
	warnings: string[];
}
