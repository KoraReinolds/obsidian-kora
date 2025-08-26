/**
 * Types for Obsidian note chunking
 * Description: Strongly-typed interfaces describing chunks and options used across the chunker.
 */

/**
 * Discrete content block categories produced by the parser.
 * - paragraph: Free-form text paragraph
 * - list_item: Single list item (ordered or unordered)
 * - list_group: Grouped short list items merged into one block
 * - code: Fenced code block (```/~~~)
 * - table: Markdown table block
 * - quote: Blockquote (>
 */
export type ChunkType =
	| 'paragraph'
	| 'list_item'
	| 'list_group'
	| 'code'
	| 'table'
	| 'quote';

/**
 * Detailed metadata persisted alongside each chunk for search and traceability.
 * Key fields:
 * - originalId: Stable id of the source note (e.g., obsidian:path)
 * - chunkId: Content-addressable or explicit block id used to reference this chunk
 * - noteHash/contentHash: SHA256 hashes of normalized note and raw chunk content
 * - contentType: Source content type (obsidian_note)
 * - chunkType: Category of the chunk (see ChunkType)
 * - section/headingsPath: Current section name and full heading path context
 * - listDepth/itemIndex/parentItemText: List-specific metadata
 * - obsidian: Source path and optional tags/aliases
 */
export interface ChunkPayloadMeta {
	originalId: string;
	chunkId: string;
	noteHash: string;
	contentHash: string;
	contentType: 'obsidian_note';
	chunkType: ChunkType;
	section: string;
	headingsPath: string[];
	parentItemText?: string;
	obsidian: {
		path: string;
		tags?: string[];
		aliases?: string[];
	};
	createdAtTs?: number;
	updatedAtTs?: number;
}

/**
 * A single content unit extracted from a note.
 * - contentRaw: Raw block text as parsed (may include code fences, bullets, etc.)
 * - meta: Rich metadata enabling navigation, deduplication, and search
 */
export interface Chunk {
	chunkId: string;
	chunkType: ChunkType;
	headingsPath: string[];
	section: string;
	parentItemText?: string;
	contentRaw: string;
	meta: ChunkPayloadMeta;
	// Optional position info for editor mapping
	position?: import('./cache-types').TGap;
}

/**
 * Context about the source note used when building chunks and metadata.
 * - notePath/originalId: File system path and external id for provenance
 * - frontmatter: Arbitrary frontmatter key/values
 * - tags/aliases: Optional Obsidian note attributes
 */
export interface ChunkNoteContext {
	notePath: string;
	originalId: string;
	frontmatter?: Record<string, any>;
	tags?: string[];
	aliases?: string[];
}

/**
 * Tuning parameters controlling the size and grouping behavior of chunks.
 * - longParagraphWordThreshold: Split paragraphs exceeding this word count (default ~300)
 * - listShortCharThreshold: Char length under which list items are considered short (default ~120)
 * - listGroupMin/listGroupMax: Min/Max items to merge into one list_group (defaults 3..7)
 * - maxChunksSoft: Soft cap on returned chunks for UI/perf (default 50)
 */
export interface ChunkOptions {
	longParagraphWordThreshold?: number;
	listShortCharThreshold?: number;
	listGroupMin?: number;
	listGroupMax?: number;
	maxChunksSoft?: number;
}
