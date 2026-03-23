/**
 * @module obsidian-plugin/features/chunking/ui/chunk-cursor
 * @description Утилиты курсора редактора: отслеживание строки и сопоставление с индексом чанка.
 */

import { App, MarkdownView } from 'obsidian';
import type { Chunk } from '../../../../../../packages/kora-core/src/chunking/model/types.js';

/**
 * @description Находит индекс чанка, содержащего строку курсора.
 * Принимает чанки с полями `startLine`/`endLine` (через `position`).
 */
export function findChunkIndexForLine(
	chunks: Array<
		Chunk & { position?: { start: { line: number }; end: { line: number } } }
	>,
	line: number
): number {
	for (let i = 0; i < chunks.length; i++) {
		const c: any = chunks[i];
		const start = c.position?.start?.line;
		const end = c.position?.end?.line;
		if (typeof start === 'number' && typeof end === 'number') {
			if (line >= start && line <= end) return i;
		}
	}
	return -1;
}

/**
 * @description Запускает опрос строки курсора активного редактора; вызывает callback при смене строки.
 * @returns {() => void} Функция остановки опроса.
 */
export function startCursorPolling(
	app: App,
	onLineChange: (line: number) => void,
	intervalMs = 200
): () => void {
	let lastLine = -1;
	const timer = window.setInterval(
		() => {
			const view = app.workspace.getActiveViewOfType(MarkdownView);
			const line = view?.editor.getCursor().line ?? -1;
			if (line !== lastLine) {
				lastLine = line;
				if (line >= 0) onLineChange(line);
			}
		},
		Math.max(50, intervalMs)
	);
	return () => window.clearInterval(timer);
}
