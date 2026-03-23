/**
 * Cache Fixtures
 * Description: Build a minimal CachedMetadataLike from raw markdown for tests.
 */

import type { CachedMetadataLike } from '../model/cache-types.js';

function lineStarts(md: string): number[] {
	const starts = [0];
	for (let i = 0; i < md.length; i++) if (md[i] === '\n') starts.push(i + 1);
	return starts;
}

/** Create a realistic-enough cache for unit tests. */
export function makeCacheFromMarkdown(md: string): CachedMetadataLike {
	const starts = lineStarts(md);
	const lines = md.split('\n');
	const sections: CachedMetadataLike['sections'] = [];
	const headings: NonNullable<CachedMetadataLike['headings']> = [];
	const listItems: NonNullable<CachedMetadataLike['listItems']> = [];
	let i = 0;

	// YAML frontmatter
	if (lines[0]?.trim() === '---') {
		let j = 1;
		while (j < lines.length && lines[j].trim() !== '---') j++;
		const start = { line: 0, offset: starts[0] };
		const end = { line: j, offset: starts[j] + (lines[j]?.length || 0) };
		sections.push({ type: 'yaml', position: { start, end } });
		i = Math.min(j + 1, lines.length);
	}

	while (i < lines.length) {
		const line = lines[i];
		const at = starts[i];
		// code fence
		const fence = line.match(/^(```+|~~~+)/);
		if (fence) {
			const open = { line: i, offset: at };
			const fenceStr = fence[1];
			let k = i + 1;
			let endOffset = at + line.length;
			while (k < lines.length) {
				if (new RegExp(`^(${fenceStr})`).test(lines[k])) {
					endOffset = starts[k] + lines[k].length;
					i = k + 1;
					break;
				}
				k++;
			}
			const end = { line: Math.min(k, lines.length - 1), offset: endOffset };
			sections.push({ type: 'code', position: { start: open, end } });
			if (i <= k) {
				i = k + 1;
			}
			continue;
		}
		// table
		if (/^\|.*\|$/.test(line)) {
			const start = { line: i, offset: at };
			let k = i + 1;
			while (k < lines.length && /^\|.*\|$/.test(lines[k])) k++;
			const end = { line: k - 1, offset: starts[k - 1] + lines[k - 1].length };
			sections.push({ type: 'table', position: { start, end } });
			i = k;
			continue;
		}
		// heading
		const h = line.match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			const level = h[1].length;
			const title = h[2].trim();
			const start = { line: i, offset: at };
			const end = { line: i, offset: at + line.length };
			sections.push({ type: 'heading', position: { start, end } });
			headings.push({ heading: title, level, position: { start, end } });
			i++;
			continue;
		}
		// blockquote
		if (/^>\s?/.test(line)) {
			const start = { line: i, offset: at };
			let k = i + 1;
			while (k < lines.length && /^>\s?/.test(lines[k])) k++;
			const end = { line: k - 1, offset: starts[k - 1] + lines[k - 1].length };
			sections.push({ type: 'blockquote', position: { start, end } });
			i = k;
			continue;
		}
		// list
		const lm = line.match(/^(\s*)([-*+]\s+|\d+\.[)\s]+)/);
		if (lm) {
			const start = { line: i, offset: at };
			let k = i;
			do {
				const l = lines[k];
				if (!l || !/^(\s*)([-*+]\s+|\d+\.[)\s]+)/.test(l)) break;
				const lStart = { line: k, offset: starts[k] };
				const lEnd = { line: k, offset: starts[k] + l.length };
				listItems.push({ position: { start: lStart, end: lEnd } });
				k++;
			} while (k < lines.length);
			const end = { line: k - 1, offset: starts[k - 1] + lines[k - 1].length };
			sections.push({ type: 'list', position: { start, end } });
			i = k;
			continue;
		}
		// paragraph block (non-empty until blank line)
		if (line.trim().length > 0) {
			const start = { line: i, offset: at };
			let k = i + 1;
			while (k < lines.length && lines[k].trim().length > 0) k++;
			const end = { line: k - 1, offset: starts[k - 1] + lines[k - 1].length };
			sections.push({ type: 'paragraph', position: { start, end } });
			i = k + 1;
			continue;
		}
		i++;
	}

	return { sections, headings, listItems } as CachedMetadataLike;
}
