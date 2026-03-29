/**
 * @module runtime/model/types
 * @anchor <memory_runtime_turn>
 * @description Минимальные типы runtime-ядра для одного хода модели. Они отделяют
 * память/recall от конкретного transport-а и позволяют строить единый trace для
 * разных приложений поверх одного pipeline.
 */

import type {
	Artifact,
	ArtifactRecallQuery,
	ArtifactStorePort,
} from '../../memory/model/types.js';

export type RuntimeMessageActor = 'user' | 'assistant' | 'system' | 'world';

export type RuntimeMessageKind =
	| 'user_text'
	| 'assistant_text'
	| 'action'
	| 'environment'
	| 'system_note';

/**
 * @typedef {Object} RuntimeMessage
 * @property {RuntimeMessageActor} actor - Кто произвел сообщение.
 * @property {RuntimeMessageKind} kind - Тип сообщения в runtime.
 * @property {string} text - Текст, который может уйти в prompt history.
 * @property {string | undefined} createdAt - Время сообщения.
 * @property {Record<string, unknown> | undefined} metadata - Служебные поля adapter-а.
 *
 * @description Typed envelope для recent history. Нужен, чтобы дальнейшее
 * расширение action/environment не ломало базовый контракт `role + content`.
 */
export interface RuntimeMessage {
	actor: RuntimeMessageActor;
	kind: RuntimeMessageKind;
	text: string;
	createdAt?: string;
	metadata?: Record<string, unknown>;
}

export type PromptFragmentLayer =
	| 'identity'
	| 'policy'
	| 'memory'
	| 'environment'
	| 'recent_history'
	| 'output_contract';

/**
 * @typedef {Object} PromptFragment
 * @property {string} id - Стабильный id фрагмента.
 * @property {PromptFragmentLayer} layer - Слой prompt assembly.
 * @property {number} priority - Приоритет внутри слоя. Большее значение ближе к началу слоя.
 * @property {string} source - Откуда появился фрагмент: artifact, policy, systemPrompt и т.д.
 * @property {string} text - Текст фрагмента.
 * @property {Record<string, unknown> | undefined} metadata - Служебные поля для trace/debug.
 *
 * @description Минимальная единица prompt assembly. Позволяет одинаково собирать
 * system prompt из identity/policy/memory/environment без хрупкой ручной склейки строк.
 */
export interface PromptFragment {
	id: string;
	layer: PromptFragmentLayer;
	priority: number;
	source: string;
	text: string;
	metadata?: Record<string, unknown>;
}

/**
 * @typedef {Object} ParsedAssistantResponse
 * @property {string} rawText - Исходный ответ модели до парсинга.
 * @property {string} assistantText - Канонический текст ответа без служебных блоков.
 * @property {string[]} actions - Действия, выделенные из ответа (`*...*`, `**...**` или structured block).
 * @property {Record<string, unknown> | undefined} environmentPatch - Патч environment, если модель его вернула.
 * @property {string[]} memoryCandidates - Кандидаты в память, выделенные из structured блока.
 * @property {string} displayText - Текст для прямого отображения в UI.
 * @property {boolean} usedStructuredBlocks - Был ли применен structured response contract.
 *
 * @description Результат минимального parser-а. Нужен, чтобы UI мог показывать
 * обычный текст, а debug-сценарии видеть отдельно actions, environment и memory hints.
 */
export interface ParsedAssistantResponse {
	rawText: string;
	assistantText: string;
	actions: string[];
	environmentPatch?: Record<string, unknown>;
	memoryCandidates: string[];
	displayText: string;
	usedStructuredBlocks: boolean;
}

export interface ModelGatewayRequest {
	modelRef: string;
	assembledPrompt: string;
	recentMessages: RuntimeMessage[];
}

export interface ModelGatewayPort {
	complete(request: ModelGatewayRequest): Promise<string>;
}

export interface ResponseParserPort {
	parse(rawText: string): ParsedAssistantResponse;
}

export interface TurnEngineRequest {
	sessionId: string;
	modelRef: string;
	userInput: string;
	recentMessages: RuntimeMessage[];
	baseFragments?: PromptFragment[];
	artifactQuery?: ArtifactRecallQuery;
}

/**
 * @typedef {Object} TurnTrace
 * @property {string} id - Стабильный id trace.
 * @property {string} sessionId - Сессия/диалог, в рамках которого выполнен ход.
 * @property {string} modelRef - Ref модели, реально использованный в ходе.
 * @property {string} inputMessage - Текст входного user input.
 * @property {Artifact[]} recalledArtifacts - Артефакты, поднятые recall перед вызовом модели.
 * @property {PromptFragment[]} promptFragments - Полный набор фрагментов prompt assembly.
 * @property {string} assembledPrompt - Итоговый system prompt после сборки.
 * @property {string} rawResponse - Сырой ответ модели.
 * @property {ParsedAssistantResponse} parsedResponse - Парсинг raw response.
 * @property {string[]} errors - Накопленные ошибки/предупреждения шага.
 * @property {Record<string, number>} timingsMs - Основные тайминги хода.
 * @property {string} startedAt - Время старта хода.
 * @property {string} finishedAt - Время завершения хода.
 *
 * @description Debug-first снимок одного хода. Это основной объект для cockpit UI
 * и серверной диагностики: по нему видно recall, prompt assembly, raw response и parser output.
 */
export interface TurnTrace {
	id: string;
	sessionId: string;
	modelRef: string;
	inputMessage: string;
	recalledArtifacts: Artifact[];
	promptFragments: PromptFragment[];
	assembledPrompt: string;
	rawResponse: string;
	parsedResponse: ParsedAssistantResponse;
	errors: string[];
	timingsMs: Record<string, number>;
	startedAt: string;
	finishedAt: string;
}

export interface TurnEngineDependencies {
	artifactStore: ArtifactStorePort;
	modelGateway: ModelGatewayPort;
	responseParser: ResponseParserPort;
	now?: () => Date;
}

export interface TurnEngineResult {
	trace: TurnTrace;
	recalledArtifacts: Artifact[];
	promptFragments: PromptFragment[];
	parsedResponse: ParsedAssistantResponse;
}
