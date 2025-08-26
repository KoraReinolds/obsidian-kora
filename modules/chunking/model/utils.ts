/**
 * Note chunking utilities
 * Description: Helpers for hashing, text normalization, ids, and sentence splitting.
 */

import { createHash } from 'crypto';

/**
 * Generate a stable hash for a string using SHA256.
 */
export function sha256(input: string): string {
	return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Normalize text by stripping YAML frontmatter and converting markdown links to title (url)
 */
export function normalizeMarkdown(markdown: string): string {
	let text = markdown || '';
	// Remove YAML frontmatter
	text = text.replace(/^---[\s\S]*?---\s*/m, '');
	// Replace markdown links [title](url) -> title (url)
	text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
	// Remove emphasis markers while keeping text
	text = text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1');
	// Collapse multiple spaces/newlines
	text = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
	return text.trim();
}

/**
 * Split a paragraph into sentences (simple heuristic).
 */
export function splitIntoSentences(paragraph: string): string[] {
	const cleaned = paragraph.trim();
	if (!cleaned) return [];
	const parts = cleaned
		.split(/(?<=[.!?])\s+(?=[A-ZА-ЯЁ0-9])/g)
		.map(s => s.trim())
		.filter(Boolean);
	return parts.length > 0 ? parts : [cleaned];
}

/**
 * Estimate token length roughly by 4 chars per token fallback.
 */
export function roughTokenCount(text: string): number {
	if (!text) return 0;
	const chars = text.length;
	return Math.ceil(chars / 4);
}
