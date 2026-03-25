/**
 * @module modules/runtime/pipeline/pipeline-registry
 * @description Registry шагов minimal pipeline runtime для Telegram-архива.
 */

import type {
	PipelineArtifactInsert,
	PipelineSelection,
	PipelineStepDefinition,
	PipelineStepKey,
} from './types.js';

export interface PipelineNormalizedMessage {
	messagePk: string;
	chatId: string;
	messageId: number;
	senderId: string | null;
	timestampUtc: string;
	senderLabel: string;
	messageType: string;
	text: string;
	textLength: number;
	hasText: boolean;
	hasMedia: boolean;
	hasForward: boolean;
	hasReply: boolean;
	isService: boolean;
	replyToMessageId: number | null;
	threadId: string | null;
	attachmentCount: number;
	reactionCount: number;
	contentHash: string;
	source: string | null;
	raw: {
		reactions: unknown;
		media: unknown;
		forward: unknown;
		service: unknown;
		metadata: unknown;
	};
}

export interface PipelineProfiledMessage extends PipelineNormalizedMessage {
	score: number;
	bucket: 'high' | 'medium' | 'low';
	reasons: string[];
}

export interface PipelineMessageRow {
	messagePk: string;
	chatId: string;
	messageId: number;
	source: string | null;
	messageType: string | null;
	senderId: string | null;
	senderName: string | null;
	senderDisplayName: string | null;
	timestampUtc: string;
	editTimestampUtc: string | null;
	replyToMessageId: number | null;
	threadId: string | null;
	textRaw: string | null;
	textNormalized: string | null;
	reactionsJson: string | null;
	entitiesJson: string | null;
	forwardJson: string | null;
	serviceJson: string | null;
	mediaJson: string | null;
	metadataJson: string | null;
	contentHash: string;
}

export interface PipelineStepContext {
	selection: PipelineSelection;
	options: {
		previewLimit: number;
		chunkMaxChars: number;
	};
	messages: PipelineNormalizedMessage[];
}

export interface PipelineStepExecutionResult {
	warningCount: number;
	summary: Record<string, unknown>;
	result: Record<string, unknown>;
	artifacts: PipelineArtifactInsert[];
	processedCount: number;
}

interface PipelineStepImplementation {
	definition: PipelineStepDefinition;
	execute(
		context: PipelineStepContext
	): Promise<PipelineStepExecutionResult> | PipelineStepExecutionResult;
}

const DEFAULT_PREVIEW_LIMIT = 20;
const DEFAULT_CHUNK_MAX_CHARS = 1200;

const registry: Record<PipelineStepKey, PipelineStepImplementation> = {
	normalize: {
		definition: {
			key: 'normalize',
			label: 'Нормализация сообщений',
			description:
				'Нормализует выбранные сообщения Telegram в удобный для дальнейшего анализа срез с метриками.',
			selectionScopes: ['chat', 'messages', 'date-range'],
			defaultOptions: {
				previewLimit: DEFAULT_PREVIEW_LIMIT,
				chunkMaxChars: DEFAULT_CHUNK_MAX_CHARS,
			},
		},
		execute: context => {
			const normalized = context.messages;
			const previewLimit = context.options.previewLimit;
			const sample = normalized.slice(0, previewLimit);
			const textCount = normalized.filter(item => item.hasText).length;
			const mediaCount = normalized.filter(item => item.hasMedia).length;
			const serviceCount = normalized.filter(item => item.isService).length;
			const replyCount = normalized.filter(item => item.hasReply).length;
			const forwardCount = normalized.filter(item => item.hasForward).length;
			const dateRange = summarizeDateRange(normalized);

			return {
				warningCount: 0,
				processedCount: normalized.length,
				summary: {
					step: 'normalize',
					totalMessages: normalized.length,
					textCount,
					mediaCount,
					serviceCount,
					replyCount,
					forwardCount,
					dateRange,
				},
				result: {
					items: sample,
					totalMessages: normalized.length,
				},
				artifacts: [
					makeArtifact(
						'normalize-summary',
						'stats',
						'Normalization summary',
						{
							totalMessages: normalized.length,
							textCount,
							mediaCount,
							serviceCount,
							replyCount,
							forwardCount,
							dateRange,
						},
						{
							step: 'normalize',
							selection: context.selection,
							previewLimit,
						}
					),
					makeArtifact(
						'normalize-sample',
						'preview',
						'Normalized sample',
						sample,
						{
							step: 'normalize',
							selection: context.selection,
							sample,
						},
						sample.length
					),
				],
			};
		},
	},
	profile: {
		definition: {
			key: 'profile',
			label: 'Профилирование сообщений',
			description:
				'Оценивает выбранные сообщения эвристически, чтобы заранее видеть шум, полезность и спорные случаи.',
			selectionScopes: ['chat', 'messages', 'date-range'],
			defaultOptions: {
				previewLimit: DEFAULT_PREVIEW_LIMIT,
				chunkMaxChars: DEFAULT_CHUNK_MAX_CHARS,
			},
		},
		execute: context => {
			const scored = context.messages.map(message => scoreMessage(message));
			const previewLimit = context.options.previewLimit;
			const sample = scored.slice(0, previewLimit);
			const highValue = scored.filter(item => item.score >= 6).length;
			const mediumValue = scored.filter(
				item => item.score >= 3 && item.score < 6
			).length;
			const lowValue = scored.filter(item => item.score < 3).length;
			const serviceCount = scored.filter(item => item.isService).length;
			const mediaOnlyCount = scored.filter(
				item => item.hasMedia && !item.hasText
			).length;

			return {
				warningCount: 0,
				processedCount: scored.length,
				summary: {
					step: 'profile',
					totalMessages: scored.length,
					highValue,
					mediumValue,
					lowValue,
					serviceCount,
					mediaOnlyCount,
				},
				result: {
					items: sample,
					totalMessages: scored.length,
				},
				artifacts: [
					makeArtifact(
						'profile-summary',
						'stats',
						'Profile summary',
						{
							totalMessages: scored.length,
							highValue,
							mediumValue,
							lowValue,
							serviceCount,
							mediaOnlyCount,
						},
						{
							step: 'profile',
							selection: context.selection,
							previewLimit,
						}
					),
					makeArtifact(
						'profile-sample',
						'preview',
						'Profile sample',
						sample,
						{
							step: 'profile',
							selection: context.selection,
							sample,
						},
						sample.length
					),
				],
			};
		},
	},
	chunk: {
		definition: {
			key: 'chunk',
			label: 'Сборка чанков',
			description:
				'Собирает кандидатные чанки из выбранных сообщений, чтобы можно было проверить структуру будущей векторизации.',
			selectionScopes: ['chat', 'messages', 'date-range'],
			defaultOptions: {
				previewLimit: DEFAULT_PREVIEW_LIMIT,
				chunkMaxChars: DEFAULT_CHUNK_MAX_CHARS,
			},
		},
		execute: context => {
			const chunks = buildChunks(
				context.messages,
				context.options.chunkMaxChars
			);
			const previewLimit = context.options.previewLimit;
			const sample = chunks.slice(0, previewLimit);
			const coveredMessages = chunks.reduce(
				(total, chunk) => total + Number(chunk.messageCount || 0),
				0
			);
			const emptyMessages = context.messages.filter(
				message => !message.hasText && !message.hasMedia
			).length;

			return {
				warningCount: emptyMessages,
				processedCount: chunks.length,
				summary: {
					step: 'chunk',
					totalMessages: context.messages.length,
					chunkCount: chunks.length,
					coveredMessages,
					emptyMessages,
					chunkMaxChars: context.options.chunkMaxChars,
				},
				result: {
					items: sample,
					totalChunks: chunks.length,
				},
				artifacts: [
					makeArtifact(
						'chunk-summary',
						'stats',
						'Chunk summary',
						{
							totalMessages: context.messages.length,
							chunkCount: chunks.length,
							coveredMessages,
							emptyMessages,
							chunkMaxChars: context.options.chunkMaxChars,
						},
						{
							step: 'chunk',
							selection: context.selection,
							previewLimit,
							chunkMaxChars: context.options.chunkMaxChars,
						}
					),
					makeArtifact(
						'chunk-sample',
						'preview',
						'Chunk sample',
						sample,
						{
							step: 'chunk',
							selection: context.selection,
							sample,
						},
						sample.length
					),
				],
			};
		},
	},
};

export function getPipelineSteps(): PipelineStepDefinition[] {
	return Object.values(registry).map(entry => entry.definition);
}

export function getPipelineStepDefinition(
	stepKey: PipelineStepKey
): PipelineStepDefinition {
	const step = registry[stepKey];
	if (!step) {
		throw new Error(`Unknown pipeline step: ${stepKey}`);
	}
	return step.definition;
}

export async function executePipelineStep(
	stepKey: PipelineStepKey,
	context: PipelineStepContext
): Promise<PipelineStepExecutionResult> {
	const step = registry[stepKey];
	if (!step) {
		throw new Error(`Unknown pipeline step: ${stepKey}`);
	}

	return await step.execute(context);
}

function makeArtifact(
	artifactKey: string,
	kind: string,
	title: string,
	preview: unknown,
	payload: unknown,
	itemCount = Array.isArray(preview) ? preview.length : 1
): PipelineArtifactInsert {
	return {
		artifactKey,
		kind,
		title,
		itemCount,
		preview,
		payload,
		createdAt: new Date().toISOString(),
	};
}

function summarizeDateRange(messages: PipelineNormalizedMessage[]): {
	oldestTimestampUtc: string | null;
	newestTimestampUtc: string | null;
} {
	if (messages.length === 0) {
		return {
			oldestTimestampUtc: null,
			newestTimestampUtc: null,
		};
	}

	return {
		oldestTimestampUtc: messages[messages.length - 1]?.timestampUtc ?? null,
		newestTimestampUtc: messages[0]?.timestampUtc ?? null,
	};
}

function scoreMessage(
	message: PipelineNormalizedMessage
): PipelineProfiledMessage {
	let score = 0;
	const reasons: string[] = [];

	if (message.isService) {
		score -= 5;
		reasons.push('service');
	}
	if (message.hasText && message.textLength > 20) {
		score += 2;
		reasons.push('text');
	}
	if (message.textLength > 120) {
		score += 2;
		reasons.push('long_text');
	}
	if (message.hasReply) {
		score += 1;
		reasons.push('reply');
	}
	if (message.hasForward) {
		score += 1;
		reasons.push('forward');
	}
	if (message.hasMedia) {
		score += message.hasText ? 1 : -2;
		reasons.push(message.hasText ? 'media_with_text' : 'media_only');
	}
	if (/[?¿]/.test(message.text)) {
		score += 1;
		reasons.push('question');
	}

	const bucket = score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';
	return {
		...message,
		score,
		bucket,
		reasons,
	};
}

function buildChunks(
	messages: PipelineNormalizedMessage[],
	maxChars: number
): Array<Record<string, unknown>> {
	const chunks: Array<Record<string, unknown>> = [];
	let current: PipelineNormalizedMessage[] = [];
	let currentChars = 0;

	const flush = (): void => {
		if (current.length === 0) {
			return;
		}

		const lines = current.map(message => {
			const label = message.senderLabel || message.senderId || message.chatId;
			return `${label}: ${message.text || '[no text]'}`;
		});
		const content = lines.join('\n\n');
		chunks.push({
			chunkId: `${current[0]?.chatId}:${current[0]?.messageId}-${
				current[current.length - 1]?.messageId
			}`,
			messageRefs: current.map(message => ({
				messagePk: message.messagePk,
				messageId: message.messageId,
				timestampUtc: message.timestampUtc,
			})),
			messageCount: current.length,
			charCount: content.length,
			content,
		});
		current = [];
		currentChars = 0;
	};

	for (const message of messages) {
		if (!message.hasText && !message.hasMedia) {
			continue;
		}

		const nextLine = `${message.senderLabel || message.senderId || message.chatId}: ${
			message.text || '[no text]'
		}`;
		const nextChars =
			currentChars + nextLine.length + (current.length > 0 ? 2 : 0);
		if (current.length > 0 && nextChars > maxChars) {
			flush();
		}

		current.push(message);
		currentChars += nextLine.length + (current.length > 1 ? 2 : 0);
	}

	flush();
	return chunks;
}
