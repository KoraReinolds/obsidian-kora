/**
 * @module memory/model/types
 * @anchor <memory_artifact_pipeline>
 * @description Канонические типы MVP для общего слоя памяти. Эти структуры не знают
 * про конкретный домен (dating, заметки, агент BFF), а описывают путь данных от
 * нормализованного источника к артефакту, который можно извлечь в prompt.
 */

export type SourceUnitSourceType =
	| 'obsidian_note'
	| 'telegram_chat'
	| 'manual_seed'
	| 'runtime_session';

export type SourceUnitType = 'paragraph' | 'message' | 'event' | 'scene_window';

/**
 * @typedef {Object} SourceUnit
 * @property {string} id - Стабильный id единицы после нормализации источника.
 * @property {SourceUnitSourceType} sourceType - Тип источника, из которого пришли данные.
 * @property {string} sourceId - Идентификатор документа/чата/сессии.
 * @property {SourceUnitType} unitType - Семантика единицы до сборки артефактов.
 * @property {string} text - Канонический текст, пригодный для chunking и recall.
 * @property {string | undefined} author - Автор или актор, если применимо.
 * @property {string | undefined} timestamp - Временная метка первичного события.
 * @property {string[]} contextPath - Иерархический контекст: heading path, chat path, scene path.
 * @property {Record<string, unknown> | undefined} metadata - Дополнительные поля источника для трассировки и будущих стратегий.
 *
 * @description Нормализованная единица источника. Нужна, чтобы Obsidian note,
 * Telegram export и runtime-сессия сначала приводились к одному минимальному
 * формату, а уже потом проходили через общие стратегии построения артефактов.
 */
export interface SourceUnit {
	id: string;
	sourceType: SourceUnitSourceType;
	sourceId: string;
	unitType: SourceUnitType;
	text: string;
	author?: string;
	timestamp?: string;
	contextPath: string[];
	metadata?: Record<string, unknown>;
}

export type ArtifactType =
	| 'document_chunk'
	| 'dialogue_window'
	| 'episodic_memory'
	| 'semantic_memory'
	| 'session_summary'
	| 'environment_state';

export type ArtifactScopeKind =
	| 'global'
	| 'source'
	| 'session'
	| 'conversation';
export type ArtifactContext = string;

/**
 * @typedef {Object} ArtifactScope
 * @property {ArtifactScopeKind} kind - Область действия памяти.
 * @property {string | undefined} id - Идентификатор конкретной области (`conversationId`, `sessionId`, `sourceId`).
 *
 * @description Область видимости артефакта. Нужна, чтобы recall мог быстро
 * отделять глобальные знания от локальных артефактов конкретного чата или сессии.
 */
export interface ArtifactScope {
	kind: ArtifactScopeKind;
	id?: string;
}

/**
 * @typedef {Object} Artifact
 * @property {string} id - Стабильный id артефакта.
 * @property {ArtifactType} artifactType - Тип памяти/контекста.
 * @property {SourceUnitSourceType} sourceType - Первичный источник данных.
 * @property {string} sourceId - Документ/чат/сессия, породившие артефакт.
 * @property {ArtifactScope} scope - Область recall.
 * @property {ArtifactContext} context - Семантическая ось “о ком / о чём” хранится факт.
 * @property {string} text - Текст, который показывается в debug и может попасть в prompt.
 * @property {string} embeddingText - Нормализованный текст для embeddings/retrieval.
 * @property {string[]} sourceUnitIds - Какие source units легли в основу артефакта.
 * @property {string[]} sourceRefs - Внешние ссылки для навигации к источнику.
 * @property {Record<string, unknown> | undefined} metadata - Служебные и доменные поля.
 * @property {string} createdAt - Время первичного создания артефакта.
 * @property {string} updatedAt - Время последнего обновления.
 * @property {number | undefined} score - Временный score recall/rerank без изменения persisted версии.
 *
 * @description Каноническая единица памяти. `Chunk` заметки — это частный случай
 * артефакта, так же как окно Telegram-диалога или extracted memory.
 */
export interface Artifact {
	id: string;
	artifactType: ArtifactType;
	sourceType: SourceUnitSourceType;
	sourceId: string;
	scope: ArtifactScope;
	context: ArtifactContext;
	text: string;
	embeddingText: string;
	sourceUnitIds: string[];
	sourceRefs: string[];
	metadata?: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
	score?: number;
}

/**
 * @typedef {Object} ArtifactRecallQuery
 * @property {ArtifactScopeKind | undefined} scopeKind - Ограничение по области памяти.
 * @property {string | undefined} scopeId - Конкретный id области.
 * @property {ArtifactType[] | undefined} artifactTypes - Допустимые типы артефактов.
 * @property {ArtifactContext[] | undefined} contexts - Допустимые контексты (`persona`, `relationship`, `environment` и т.д.).
 * @property {SourceUnitSourceType[] | undefined} sourceTypes - Допустимые типы источников.
 * @property {number | undefined} limit - Максимум артефактов в ответе.
 *
 * @description Минимальный запрос recall для MVP. Он intentionally простой:
 * сначала ограничиваемся областями и типами, а сложный rerank и search query
 * можно добавить позже, не ломая общий контракт.
 */
export interface ArtifactRecallQuery {
	scopeKind?: ArtifactScopeKind;
	scopeId?: string;
	artifactTypes?: ArtifactType[];
	contexts?: ArtifactContext[];
	sourceTypes?: SourceUnitSourceType[];
	limit?: number;
}

/**
 * @description Порт чтения/записи артефактов. В MVP достаточно уметь сохранить
 * пачку артефактов и извлечь небольшой recent recall по scope/type.
 */
export interface ArtifactStorePort {
	persistArtifacts(artifacts: Artifact[]): Promise<void> | void;
	recallArtifacts(query: ArtifactRecallQuery): Promise<Artifact[]> | Artifact[];
}
