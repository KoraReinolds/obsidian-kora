/**
 * ID and embedding text builders
 * Description: Create stable IDs and embedding text prefixes.
 */

import { sha256 } from './utils.js';

export function extractBlockId(line: string): string | null {
	// Support both ^(abc123) and ^abc123 appearing anywhere in the block
	const withParens = line.match(/(\^\([a-zA-Z0-9_-]{3,}\))/);
	if (withParens) return withParens[1];
	const native = line.match(/(\^[a-zA-Z0-9_-]{3,})/);
	if (native) return native[1];
	return null;
}

/**
 * Build a content-addressable ID from embedding text.
 */
export function toHash(embeddingText: string): string {
	return sha256(embeddingText);
}

export function buildEmbeddingText(
	headingsPath: string[],
	parentItemText: string | undefined,
	text: string
): string {
	const h = headingsPath.length > 0 ? `H: ${headingsPath.join(' > ')}. ` : '';
	const p = parentItemText ? `Parent: ${parentItemText}. ` : '';
	return `${h}${p}${text}`.trim();
}
