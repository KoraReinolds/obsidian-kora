/**
 * Parser Types
 * Description: Shared types for parsed blocks produced by note parsing.
 */

import type { ChunkType } from './types';

/**
 * A structural block parsed from markdown with heading context.
 */
export interface ParsedBlock {
  type: ChunkType;
  text: string;
  headingPath: string[];
  listDepth?: number;
  parentItemText?: string;
  itemIndex?: number;
}


