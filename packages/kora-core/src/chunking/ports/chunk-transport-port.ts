/**
 * @module packages/kora-core/chunking/ports/chunk-transport-port
 *
 * @description Контракты доступа к Obsidian/vector infra для Vue-экранов chunking.
 */
import type { Chunk } from '../model/types.js';

export type ChunkSyncStatus = 'new' | 'deleted' | 'modified' | 'unchanged';

export interface ChunkDisplayItem {
	chunkId: string;
	status: ChunkSyncStatus;
	content: string;
	previousContent?: string;
	chunk: Chunk | null;
}

export interface ChunkFileContext {
	filePath: string;
	fileName: string;
	originalId: string;
	chunks: Chunk[];
	displayItems: ChunkDisplayItem[];
}

export interface RelatedChunkResult {
	chunkId: string;
	chunkType: string;
	headingsPath: string[];
	contentRaw: string;
	score: number;
	scoreDetails?: {
		mode: 'hybrid' | 'vector' | 'lexical_fallback';
		vectorScore: number | null;
		lexicalScore: number | null;
		lexicalContribution: number | null;
		lexicalBoostWeight: number | null;
		combinedScore: number;
	};
	sourceFile: string;
	position?: {
		start?: { line: number };
		end?: { line: number };
	};
}

export interface UnsyncedNoteRef {
	path: string;
	basename: string;
}

export interface ChunkTransportPort {
	readActiveChunkContext(): Promise<ChunkFileContext | null>;
	getActiveFilePath(): string | null;
	getActiveCursorLine(): number;
	syncContext(context: ChunkFileContext): Promise<void>;
	isVectorHealthy(): Promise<boolean>;
	searchRelated(
		query: string,
		exclude: { chunkId?: string; originalId?: string; filePath?: string }
	): Promise<RelatedChunkResult[]>;
	openRelatedChunk(result: RelatedChunkResult): Promise<void>;
	getUnsyncedNotes(limit: number): Promise<UnsyncedNoteRef[]>;
}
