/**
 * Splitting
 * Description: Split long paragraphs into multiple paragraph blocks with overlap.
 */

import { splitIntoSentences, roughTokenCount } from './utils.js';
import type { ChunkOptions } from './types.js';
import type { ParsedBlock } from './parser-types.js';

export function splitLongParagraphs(
	blocks: ParsedBlock[],
	options: Required<ChunkOptions>
): ParsedBlock[] {
	const result: ParsedBlock[] = [];
	for (const b of blocks) {
		if (b.type !== 'paragraph') {
			result.push(b);
			continue;
		}
		const words = b.text.split(/\s+/).length;
		const tokens = roughTokenCount(b.text);
		if (words <= (options.longParagraphWordThreshold || 300) && tokens <= 800) {
			result.push(b);
			continue;
		}

		const sentences = splitIntoSentences(b.text);
		const overlap = 2;
		let start = 0;
		while (start < sentences.length) {
			const end = Math.min(
				start + Math.ceil(sentences.length / 2),
				sentences.length
			);
			const slice = sentences.slice(start, end);
			const text = slice.join(' ');
			result.push({ ...b, text });
			if (end === sentences.length) break;
			start = Math.max(0, end - overlap);
		}
	}
	return result;
}
