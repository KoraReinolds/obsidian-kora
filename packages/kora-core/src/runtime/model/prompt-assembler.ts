/**
 * @module runtime/model/prompt-assembler
 * @anchor <memory_runtime_turn>
 * @description Собирает итоговый system prompt из канонических фрагментов.
 * Ассемблер намеренно простой: его задача не “быть умным”, а делать сборку
 * предсказуемой и хорошо читаемой в trace/debug.
 */

import { sha256 } from '../../chunking/model/utils.js';
import type { Artifact } from '../../memory/model/types.js';
import type { PromptFragment, PromptFragmentLayer } from './types.js';

const LAYER_ORDER: PromptFragmentLayer[] = [
	'identity',
	'policy',
	'memory',
	'environment',
	'recent_history',
	'output_contract',
];

/**
 * @description Преобразует артефакт памяти в prompt fragment слоя `memory`.
 * @param {Artifact} artifact - Recall result.
 * @returns {PromptFragment}
 */
export function artifactToPromptFragment(artifact: Artifact): PromptFragment {
	return {
		id: sha256(`artifact-fragment::${artifact.id}`),
		layer:
			artifact.artifactType === 'environment_state' ? 'environment' : 'memory',
		priority:
			artifact.score !== undefined ? Math.round(artifact.score * 1000) : 0,
		source: `artifact:${artifact.artifactType}:${artifact.context}`,
		text: artifact.text,
		metadata: {
			artifactId: artifact.id,
			artifactType: artifact.artifactType,
			context: artifact.context,
			scope: artifact.scope,
			sourceType: artifact.sourceType,
		},
	};
}

/**
 * @description Собирает итоговый system prompt из отсортированных фрагментов.
 * @param {PromptFragment[]} fragments - Все фрагменты текущего хода.
 * @returns {string}
 */
export function assemblePromptFragments(fragments: PromptFragment[]): string {
	const sorted = [...fragments].sort((left, right) => {
		const leftLayerIndex = LAYER_ORDER.indexOf(left.layer);
		const rightLayerIndex = LAYER_ORDER.indexOf(right.layer);
		if (leftLayerIndex !== rightLayerIndex) {
			return leftLayerIndex - rightLayerIndex;
		}
		if (left.priority !== right.priority) {
			return right.priority - left.priority;
		}
		return left.id.localeCompare(right.id);
	});

	return sorted
		.map(
			fragment =>
				`[${fragment.layer}:${fragment.source}]\n${fragment.text.trim()}`
		)
		.join('\n\n')
		.trim();
}
