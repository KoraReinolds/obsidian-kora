/**
 * @module semantic-inspector/ports/semantic-inspector-transport-port
 *
 * @description Контракт транспорта для отладочного представления semantic inspector.
 * Экран работает с нормализованным состоянием бэкенда/заметки и не обращается
 * к API Obsidian или рантайм-векторному бэкенду напрямую.
 */

import type {
	ChunkDisplayItem,
	ChunkFileContext,
} from '../../chunking/ports/chunk-transport-port';

/**
 * @typedef {Object} SemanticInspectorBackendStatus
 * @property {'healthy' | 'unhealthy' | 'unavailable' | 'error'} status - Текущее состояние здоровья бэкенда по данным рантайм-сервиса.
 * @property {string | null} backend - Имя активного семантического бэкенда (`sqlite` или `qdrant`), если доступно.
 * @property {string | null} collection - Идентификатор коллекции/таблицы для бэкенда, если сервер его отдаёт.
 * @property {string | null} databasePath - Путь к файлу SQLite для диагностики в рантайме.
 * @property {string | null} qdrantUrl - Endpoint Qdrant для совместимости и отладки.
 * @property {string | null} embeddingModel - Активная модель эмбеддингов, используемая рантайм-сервисом.
 * @property {string | null} embeddingBaseUrl - Текущий endpoint провайдера эмбеддингов.
 * @property {number} totalPoints - Общее число проиндексированных записей по статистике рантайма.
 * @property {Record<string, number>} contentTypeBreakdown - Количество записей по типам контента.
 * @property {string | null} error - Строка ошибки бэкенда при сбое health check.
 *
 * @description Сводка рантайма для заголовка инспектора. Представление использует это
 * состояние, чтобы проверить, какой бэкенд реально активен, а не выводить его из сохранённых настроек.
 */
export interface SemanticInspectorBackendStatus {
	status: 'healthy' | 'unhealthy' | 'unavailable' | 'error';
	backend: string | null;
	collection: string | null;
	databasePath: string | null;
	qdrantUrl: string | null;
	embeddingModel: string | null;
	embeddingBaseUrl: string | null;
	totalPoints: number;
	contentTypeBreakdown: Record<string, number>;
	error: string | null;
}

/**
 * @typedef {Object} SemanticInspectorRecord
 * @property {string} pointId - Идентификатор точки/строки в бэкенде, возвращаемый рантайм-сервисом.
 * @property {string} originalId - Стабильный идентификатор заметки из frontmatter.
 * @property {string} chunkId - Идентификатор чанка внутри проиндексированной заметки.
 * @property {string} contentType - Тип проиндексированного контента (сейчас в основном `obsidian_note`).
 * @property {string} title - Человекочитаемый заголовок для панели списка.
 * @property {string} content - Полное сохранённое тело для панели деталей.
 * @property {string} preview - Короткая строка превью для списка.
 * @property {Record<string, unknown>} metadata - Нормализованные метаданные payload для детального просмотра.
 * @property {Record<string, unknown>} payload - Сырой payload бэкенда для отладочного JSON.
 *
 * @description Нормализованная семантическая запись в UI список–детали инспектора.
 */
export interface SemanticInspectorRecord {
	pointId: string;
	originalId: string;
	chunkId: string;
	contentType: string;
	title: string;
	content: string;
	preview: string;
	metadata: Record<string, unknown>;
	payload: Record<string, unknown>;
}

/**
 * @typedef {Object} SemanticInspectorNoteContext
 * @property {string} filePath - Путь к заметке относительно хранилища.
 * @property {string} fileName - Basename для заголовка/деталей экрана.
 * @property {string} originalId - Стабильный идентификатор заметки для поиска в семантическом индексе.
 * @property {SemanticInspectorRecord[]} records - Записи, хранящиеся для этой заметки сейчас.
 *
 * @description Текущее состояние семантики в рамках заметки, которое разрешает host-адаптер.
 */
export interface SemanticInspectorNoteContext {
	filePath: string;
	fileName: string;
	originalId: string;
	records: SemanticInspectorRecord[];
}

/**
 * @typedef {Object} SemanticInspectorUnifiedRow
 * @property {string} chunkId - Стабильный идентификатор чанка, общий для локального парсинга и индекса.
 * @property {ChunkDisplayItem | null} localItem - Локальная строка чанка из {@link ChunkFileContext.displayItems}; `null`, если чанк есть только в индексе.
 * @property {SemanticInspectorRecord | null} indexRecord - Сохранённая семантическая запись для этого чанка; `null`, если ещё не проиндексирован (например локальные чанки `new`).
 *
 * @description Одна строка списка в объединённом инспекторе: слева локальный baseline/diff,
 * справа снимок бэкенда.
 */
export interface SemanticInspectorUnifiedRow {
	chunkId: string;
	localItem: ChunkDisplayItem | null;
	indexRecord: SemanticInspectorRecord | null;
}

/**
 * @typedef {Object} SemanticInspectorActionResult
 * @property {number} affectedCount - Число созданных/обновлённых/удалённых записей, если можно определить.
 * @property {string} message - Человекочитаемая сводка для баннеров статуса.
 *
 * @description Результат разрушающего или мутирующего отладочного действия из инспектора.
 */
export interface SemanticInspectorActionResult {
	affectedCount: number;
	message: string;
}

/**
 * @anchor <semantic_inspector_contract>
 *
 * @description Контракт транспорта хоста для отладочной фичи semantic inspector.
 * Реализации определяют текущую markdown-заметку, получают статус бэкенда/рантайма
 * и предоставляют действия в рамках заметки, не смешивая логику Obsidian и бэкенда с Vue-экраном.
 */
export interface SemanticInspectorTransportPort {
	/**
	 * @async
	 * @description Загружает записи семантического индекса для текущей markdown-заметки.
	 * Возвращает `null`, когда подходящей заметки нет — UI трактует это как нормальное пустое состояние хоста, а не ошибку.
	 * @returns {Promise<SemanticInspectorNoteContext | null>} Контекст текущей заметки или `null`, если нет активной markdown-заметки.
	 */
	readCurrentNoteContext(): Promise<SemanticInspectorNoteContext | null>;

	/**
	 * @async
	 * @description Читает статус рантайм-бэкенда у активного в данный момент семантического сервиса.
	 * Проверяет реальный рантайм-бэкенд (`sqlite`/`qdrant`) и путь хранения
	 * вместо опоры на сохранённые настройки плагина.
	 * @returns {Promise<SemanticInspectorBackendStatus>} Нормализованный статус рантайма для заголовка инспектора.
	 */
	getBackendStatus(): Promise<SemanticInspectorBackendStatus>;

	/**
	 * @async
	 * @description Переиндексирует текущую заметку через тот же векторный пайплайн, что использует рантайм плагина.
	 * @returns {Promise<SemanticInspectorActionResult>} Человекочитаемая сводка действия и число затронутых записей.
	 */
	reindexCurrentNote(): Promise<SemanticInspectorActionResult>;

	/**
	 * @async
	 * @description Удаляет записи семантического индекса для текущей заметки по стабильному `originalId`.
	 * @returns {Promise<SemanticInspectorActionResult>} Человекочитаемая сводка действия и число затронутых записей.
	 */
	deleteCurrentNoteRecords(): Promise<SemanticInspectorActionResult>;

	/**
	 * @async
	 * @description Парсит активную markdown-заметку в локальные чанки и сравнивает их
	 * с векторным baseline (тот же пайплайн, что у прежнего представления Kora Chunks).
	 * @returns {Promise<ChunkFileContext | null>} Контекст файла с чанками или `null`, если markdown не применим.
	 */
	readLocalChunkContext(): Promise<ChunkFileContext | null>;

	/**
	 * @description Возвращает строку курсора активного редактора для сопоставления с покрытием чанков.
	 * @returns {number} Номер строки с нуля или `-1`, если недоступно.
	 */
	getActiveCursorLine(): number;

	/**
	 * @async
	 * @description Инкрементально векторизует новые/изменённые чанки и удаляет точки удалённых чанков.
	 * @param {ChunkFileContext} context - Актуальный контекст чанков из {@link readLocalChunkContext}.
	 * @returns {Promise<void>}
	 */
	syncChunkDeltas(context: ChunkFileContext): Promise<void>;
}
