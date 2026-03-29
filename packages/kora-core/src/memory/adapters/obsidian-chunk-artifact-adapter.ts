/**
 * @module memory/adapters/obsidian-chunk-artifact-adapter
 * @anchor <memory_artifact_pipeline>
 * @description Адаптер текущего chunking-ядра Obsidian к общему формату артефактов.
 * Нужен, чтобы не ломать существующий API `chunkNote`, но сразу начать выдавать
 * общую память-как-артефакты поверх уже готовых `Chunk`.
 */

import { buildEmbeddingText } from '../../chunking/model/id.js';
import type { Chunk } from '../../chunking/model/types.js';
import { buildArtifact } from '../model/artifact-pipeline.js';
import type { Artifact } from '../model/types.js';

export interface BuildArtifactsFromObsidianChunksOptions {
	scopeId?: string;
}

/**
 * @description Преобразует Obsidian chunks в артефакты общего memory-слоя.
 * @param {Chunk[]} chunks - Результат `chunkNote`.
 * @param {BuildArtifactsFromObsidianChunksOptions} [options] - Дополнительная область recall.
 * @returns {Artifact[]}
 */
export function buildArtifactsFromObsidianChunks(
	chunks: Chunk[],
	options: BuildArtifactsFromObsidianChunksOptions = {}
): Artifact[] {
	return chunks.map(chunk =>
		buildArtifact({
			artifactType: 'document_chunk',
			context: 'source',
			sourceType: 'obsidian_note',
			sourceId: chunk.meta.originalId,
			scope: {
				kind: options.scopeId ? 'session' : 'source',
				id: options.scopeId || chunk.meta.originalId,
			},
			text: chunk.contentRaw,
			embeddingText: buildEmbeddingText(
				chunk.headingsPath,
				chunk.parentItemText,
				chunk.contentRaw
			),
			sourceRefs: [chunk.meta.obsidian.path],
			metadata: {
				chunkId: chunk.chunkId,
				chunkType: chunk.chunkType,
				section: chunk.section,
				headingsPath: chunk.headingsPath,
				parentItemText: chunk.parentItemText,
				position: chunk.position,
				obsidian: chunk.meta.obsidian,
			},
			createdAt:
				chunk.meta.createdAtTs !== undefined
					? new Date(chunk.meta.createdAtTs).toISOString()
					: undefined,
			updatedAt:
				chunk.meta.updatedAtTs !== undefined
					? new Date(chunk.meta.updatedAtTs).toISOString()
					: undefined,
		})
	);
}
