/**
 * Types for Obsidian note chunking
 * Description: Strongly-typed interfaces describing chunks and options.
 */

export type ChunkType = 'paragraph' | 'list_item' | 'list_group' | 'code' | 'table' | 'quote';

export interface ChunkPayloadMeta {
  originalId: string;
  chunkId: string;
  noteHash: string;
  contentHash: string;
  contentType: 'obsidian_note';
  chunkType: ChunkType;
  chunkIndex: number;
  section: string;
  headingsPath: string[];
  listDepth?: number;
  itemIndex?: number;
  itemIndexRange?: [number, number];
  parentItemText?: string;
  prevChunkId?: string | null;
  nextChunkId?: string | null;
  obsidian: {
    path: string;
    tags?: string[];
    aliases?: string[];
  };
  createdAtTs?: number;
  updatedAtTs?: number;
  language?: string;
  area?: string;
  project?: string;
  status?: string;
  vectorizedAt?: string;
  embeddingModel?: string;
  dimensions?: number;
}

export interface Chunk {
  chunkId: string;
  chunkType: ChunkType;
  headingsPath: string[];
  section: string;
  listDepth?: number;
  itemIndex?: number;
  itemIndexRange?: [number, number];
  parentItemText?: string;
  contentRaw: string;
  contentForEmbedding: string;
  meta: ChunkPayloadMeta;
}

export interface ChunkNoteContext {
  notePath: string;
  originalId: string;
  frontmatter?: Record<string, any>;
  tags?: string[];
  aliases?: string[];
}

export interface ChunkOptions {
  longParagraphWordThreshold?: number; // default ~300
  listShortCharThreshold?: number; // default ~120
  listGroupMin?: number; // default 3
  listGroupMax?: number; // default 7
  maxChunksSoft?: number; // default 50
}


