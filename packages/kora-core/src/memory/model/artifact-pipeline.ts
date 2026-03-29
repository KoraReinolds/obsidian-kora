/**
 * @module memory/model/artifact-pipeline
 * @anchor <memory_artifact_pipeline>
 * @description Базовые helper-функции для сборки артефактов из source units.
 * Модуль intentionally не знает про конкретный storage: он отвечает только за
 * каноническую форму артефакта и устойчивые идентификаторы.
 */

import { sha256 } from '../../chunking/model/utils.js';
import type {
	Artifact,
	ArtifactScope,
	ArtifactType,
	SourceUnit,
} from './types.js';

export interface BuildArtifactInput {
	artifactType: ArtifactType;
	context: Artifact['context'];
	sourceType: SourceUnit['sourceType'];
	sourceId: string;
	scope: ArtifactScope;
	text: string;
	embeddingText?: string;
	sourceUnits?: SourceUnit[];
	sourceRefs?: string[];
	metadata?: Record<string, unknown>;
	createdAt?: string;
	updatedAt?: string;
}

/**
 * @description Строит стабильный артефакт из нормализованных входных данных.
 * `embeddingText` по умолчанию совпадает с `text`, чтобы MVP мог работать даже
 * без отдельной фазы enrich/normalization для embeddings.
 * @param {BuildArtifactInput} input - Данные будущего артефакта.
 * @returns {Artifact}
 */
export function buildArtifact(input: BuildArtifactInput): Artifact {
	const embeddingText = (input.embeddingText || input.text).trim();
	const createdAt = input.createdAt || new Date().toISOString();
	const updatedAt = input.updatedAt || createdAt;
	const sourceUnitIds = (input.sourceUnits || []).map(unit => unit.id);
	const stableIdSeed = [
		input.artifactType,
		input.context,
		input.scope.kind,
		input.scope.id || '',
		input.sourceType,
		input.sourceId,
		embeddingText,
		sourceUnitIds.join('|'),
	].join('::');

	return {
		id: sha256(stableIdSeed),
		artifactType: input.artifactType,
		context: input.context,
		sourceType: input.sourceType,
		sourceId: input.sourceId,
		scope: input.scope,
		text: input.text.trim(),
		embeddingText,
		sourceUnitIds,
		sourceRefs: [...(input.sourceRefs || [])],
		metadata: input.metadata,
		createdAt,
		updatedAt,
	};
}
