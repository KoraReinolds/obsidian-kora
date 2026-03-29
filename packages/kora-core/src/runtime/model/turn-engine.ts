/**
 * @module runtime/model/turn-engine
 * @anchor <memory_runtime_turn>
 * @description Минимальный orchestrator одного хода: recall памяти, prompt assembly,
 * вызов модели, парсинг ответа и возврат полного trace для debug-first сценариев.
 */

import { sha256 } from '../../chunking/model/utils.js';
import {
	artifactToPromptFragment,
	assemblePromptFragments,
} from './prompt-assembler.js';
import type {
	PromptFragment,
	TurnEngineDependencies,
	TurnEngineRequest,
	TurnEngineResult,
	TurnTrace,
} from './types.js';

const OUTPUT_CONTRACT_FRAGMENT: PromptFragment = {
	id: 'runtime-output-contract-v1',
	layer: 'output_contract',
	priority: 0,
	source: 'runtime:output-contract',
	text: [
		'Ты можешь отвечать обычным текстом.',
		'Если хочешь передать структуру для runtime, используй optional блоки:',
		'<assistant_text>основной текст ответа</assistant_text>',
		'<action>действие персонажа или жест</action>',
		'<environment>{"mood":"...", "location":"..."}</environment>',
		'<memory>краткий факт для памяти</memory>',
		'Если structured blocks не нужны, просто отвечай обычным сообщением без тегов.',
	].join('\n'),
};

/**
 * @description Исполняет один ход runtime и возвращает готовый trace.
 */
export class TurnEngine {
	constructor(private readonly dependencies: TurnEngineDependencies) {}

	/**
	 * @async
	 * @description Выполняет один LLM-ход: recall -> fragments -> assembled prompt -> model -> parser.
	 * @param {TurnEngineRequest} request - Контекст текущего хода.
	 * @returns {Promise<TurnEngineResult>}
	 */
	async run(request: TurnEngineRequest): Promise<TurnEngineResult> {
		const now = this.dependencies.now || (() => new Date());
		const startedAtDate = now();
		const startedAt = startedAtDate.toISOString();
		const recallStarted = Date.now();
		const recalledArtifacts =
			await this.dependencies.artifactStore.recallArtifacts(
				request.artifactQuery || {
					scopeKind: 'conversation',
					scopeId: request.sessionId,
					limit: 8,
				}
			);
		const recallMs = Date.now() - recallStarted;

		const promptFragments: PromptFragment[] = [
			...(request.baseFragments || []),
			...recalledArtifacts.map(artifactToPromptFragment),
			OUTPUT_CONTRACT_FRAGMENT,
		];

		const assemblyStarted = Date.now();
		const assembledPrompt = assemblePromptFragments(promptFragments);
		const assemblyMs = Date.now() - assemblyStarted;

		const modelStarted = Date.now();
		const rawResponse = await this.dependencies.modelGateway.complete({
			modelRef: request.modelRef,
			assembledPrompt,
			recentMessages: request.recentMessages,
		});
		const modelMs = Date.now() - modelStarted;

		const parseStarted = Date.now();
		const parsedResponse = this.dependencies.responseParser.parse(rawResponse);
		const parseMs = Date.now() - parseStarted;
		const finishedAt = now().toISOString();

		const traceId = sha256(
			[
				request.sessionId,
				request.modelRef,
				request.userInput,
				startedAt,
				rawResponse,
			].join('::')
		);

		const trace: TurnTrace = {
			id: traceId,
			sessionId: request.sessionId,
			modelRef: request.modelRef,
			inputMessage: request.userInput,
			recalledArtifacts,
			promptFragments,
			assembledPrompt,
			rawResponse,
			parsedResponse,
			errors: [],
			timingsMs: {
				recall: recallMs,
				assemble: assemblyMs,
				model: modelMs,
				parse: parseMs,
			},
			startedAt,
			finishedAt,
		};

		return {
			trace,
			recalledArtifacts,
			promptFragments,
			parsedResponse,
		};
	}
}
