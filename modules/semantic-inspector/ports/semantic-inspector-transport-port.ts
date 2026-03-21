/**
 * @module semantic-inspector/ports/semantic-inspector-transport-port
 *
 * @description Transport contract for the semantic inspector debug view.
 * The screen operates on normalized backend/note state and never talks to
 * Obsidian APIs or the runtime vector backend directly.
 */

/**
 * @typedef {Object} SemanticInspectorBackendStatus
 * @property {'healthy' | 'unhealthy' | 'unavailable' | 'error'} status - Current backend health status reported by the runtime service.
 * @property {string | null} backend - Active semantic backend name (`sqlite` or `qdrant`) when available.
 * @property {string | null} collection - Collection/table identifier for the backend, if exposed by the server.
 * @property {string | null} databasePath - SQLite file path for runtime diagnostics.
 * @property {string | null} qdrantUrl - Qdrant endpoint for compatibility/debugging.
 * @property {string | null} embeddingModel - Active embedding model used by the runtime service.
 * @property {string | null} embeddingBaseUrl - Current embeddings provider endpoint.
 * @property {number} totalPoints - Total indexed records reported by runtime stats.
 * @property {Record<string, number>} contentTypeBreakdown - Record count grouped by content type.
 * @property {string | null} error - Backend error string when health check fails.
 *
 * @description Runtime summary for the inspector header. The view uses this
 * state to verify what backend is actually active instead of inferring it
 * from persisted settings.
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
 * @property {string} pointId - Backend point/row identifier returned by the runtime service.
 * @property {string} originalId - Stable note identifier derived from frontmatter.
 * @property {string} chunkId - Chunk identifier inside the indexed note.
 * @property {string} contentType - Indexed content type (currently mostly `obsidian_note`).
 * @property {string} title - Human-readable title used in the list pane.
 * @property {string} content - Full stored content body for the detail pane.
 * @property {string} preview - Short preview string for list rendering.
 * @property {Record<string, unknown>} metadata - Normalized payload metadata for focused inspection.
 * @property {Record<string, unknown>} payload - Raw backend payload preserved for debug JSON rendering.
 *
 * @description Normalized semantic record displayed in the list-detail inspector UI.
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
 * @property {string} filePath - Vault-relative path of the inspected note.
 * @property {string} fileName - Basename used in the screen title/details.
 * @property {string} originalId - Stable note identifier looked up in the semantic index.
 * @property {SemanticInspectorRecord[]} records - Records currently stored for this note.
 *
 * @description Current note-scoped semantic state resolved by the host adapter.
 */
export interface SemanticInspectorNoteContext {
	filePath: string;
	fileName: string;
	originalId: string;
	records: SemanticInspectorRecord[];
}

/**
 * @typedef {Object} SemanticInspectorActionResult
 * @property {number} affectedCount - Number of records created/updated/deleted when it can be determined.
 * @property {string} message - Human-readable summary for status banners.
 *
 * @description Result of a destructive or mutating debug action triggered from the inspector.
 */
export interface SemanticInspectorActionResult {
	affectedCount: number;
	message: string;
}

/**
 * @anchor <semantic_inspector_contract>
 *
 * @description Host transport contract for the semantic inspector debug feature.
 * Implementations resolve the current markdown note, fetch backend/runtime
 * status, and expose note-scoped debug actions while keeping Obsidian- and
 * backend-specific logic outside the Vue screen.
 */
export interface SemanticInspectorTransportPort {
	/**
	 * @async
	 * @description Loads semantic index records for the current markdown note.
	 * Returns `null` when there is no suitable note to inspect, which the UI
	 * treats as a normal empty host state instead of an error.
	 * @returns {Promise<SemanticInspectorNoteContext | null>} Current note context or `null` if there is no active markdown note.
	 */
	readCurrentNoteContext(): Promise<SemanticInspectorNoteContext | null>;

	/**
	 * @async
	 * @description Reads runtime backend status from the currently active semantic service.
	 * This verifies the real runtime backend (`sqlite`/`qdrant`) and storage path
	 * instead of relying on saved plugin settings.
	 * @returns {Promise<SemanticInspectorBackendStatus>} Normalized runtime status for the inspector header.
	 */
	getBackendStatus(): Promise<SemanticInspectorBackendStatus>;

	/**
	 * @async
	 * @description Reindexes the current note through the same vector pipeline used by the plugin runtime.
	 * @returns {Promise<SemanticInspectorActionResult>} Human-readable action summary and affected count.
	 */
	reindexCurrentNote(): Promise<SemanticInspectorActionResult>;

	/**
	 * @async
	 * @description Deletes semantic index records for the current note by its stable `originalId`.
	 * @returns {Promise<SemanticInspectorActionResult>} Human-readable action summary and affected count.
	 */
	deleteCurrentNoteRecords(): Promise<SemanticInspectorActionResult>;
}
