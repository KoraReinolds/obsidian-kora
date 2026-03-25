/**
 * @module modules/runtime/pipeline/types
 * @description Типы minimal pipeline runtime для анализа Telegram-архива перед очисткой и векторизацией.
 */

export type PipelineStepKey = 'normalize' | 'profile' | 'chunk';

export type PipelineRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export type PipelineSelection =
	| {
			scope: 'chat';
			chatId: string;
			limit?: number;
			offset?: number;
	  }
	| {
			scope: 'messages';
			chatId: string;
			messageIds: number[];
	  }
	| {
			scope: 'date-range';
			chatId: string;
			from?: string;
			to?: string;
			limit?: number;
			offset?: number;
	  };

export interface PipelineStepOptions {
	previewLimit?: number;
	chunkMaxChars?: number;
}

export interface PipelineRunRequest {
	stepKey: PipelineStepKey;
	selection: PipelineSelection;
	options?: PipelineStepOptions;
}

export interface PipelineStepDefinition {
	key: PipelineStepKey;
	label: string;
	description: string;
	selectionScopes: PipelineSelection['scope'][];
	defaultOptions: Required<PipelineStepOptions>;
}

export interface PipelineArtifactPreview {
	id: number;
	runId: number;
	artifactKey: string;
	kind: string;
	title: string;
	itemCount: number;
	preview: unknown;
	createdAt: string;
}

export interface PipelineArtifactInsert {
	artifactKey: string;
	kind: string;
	title: string;
	itemCount: number;
	preview: unknown;
	payload: unknown;
	createdAt: string;
}

export interface PipelineArtifactRecord {
	id: number;
	runId: number;
	artifactKey: string;
	kind: string;
	title: string;
	itemCount: number;
	preview: unknown;
	payload: unknown;
	createdAt: string;
}

export interface PipelineRunRecord {
	id: number;
	stepKey: PipelineStepKey;
	stepLabel: string;
	status: PipelineRunStatus;
	selection: PipelineSelection;
	options: Required<PipelineStepOptions>;
	availableCount: number;
	processedCount: number;
	warningCount: number;
	errorText: string | null;
	truncated: boolean;
	summary: Record<string, unknown> | null;
	result: Record<string, unknown> | null;
	startedAt: string;
	finishedAt: string | null;
	artifacts?: PipelineArtifactPreview[];
}

export interface PipelineRunListResponse {
	success: boolean;
	total: number;
	runs: PipelineRunRecord[];
}

export interface PipelineStepsResponse {
	success: boolean;
	steps: PipelineStepDefinition[];
}

export interface PipelineRunResponse {
	success: boolean;
	run: PipelineRunRecord | null;
}

export interface PipelineRunCreateResponse {
	success: boolean;
	run: PipelineRunRecord;
	artifacts: PipelineArtifactPreview[];
}

export interface PipelineArtifactResponse {
	success: boolean;
	artifact: PipelineArtifactRecord | null;
}
