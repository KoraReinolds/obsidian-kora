/**
 * Parser Types
 * Description: Shared types for parsed blocks produced by note parsing.
 */

import type { ChunkType } from './types';
import type { TGap } from './cache-types';

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
	// Position info in source note
	position: TGap;
}
