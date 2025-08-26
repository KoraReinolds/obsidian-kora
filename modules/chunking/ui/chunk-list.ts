/**
 * Chunk List Renderer
 * Description: Render chunk list and allow active item highlighting; includes per-item diff mount containers.
 */

import type { Chunk } from '..';

/**
 * References to the rendered list and item nodes.
 */
export interface ChunkListRefs {
	root: HTMLElement;
	items: HTMLElement[];
}

/**
 * Options to customize rendering and interactions for chunk list.
 */
export interface ChunkListOptions {}

/**
 * Render the chunk list with optional per-item Compare button and diff mount.
 */
export function renderChunkList(
	container: HTMLElement,
	chunks: Chunk[],
	_options: ChunkListOptions = {}
): ChunkListRefs {
	const list = container.createEl('div');
	list.style.cssText =
		'display:flex;flex-direction:column;gap:6px;margin-top:8px;';
	const items: HTMLElement[] = [];
	for (const c of chunks) {
		const item = list.createEl('div');
		item.style.cssText =
			'border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px;background:var(--background-secondary);transition:background-color .15s,border-color .15s;';
		const top = item.createEl('div');
		top.style.cssText =
			'font-size:12px;color:var(--text-muted);margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;gap:8px;';
		const left = top.createEl('span');
		left.textContent = `${c.chunkType} — ${c.headingsPath.join(' > ')}`;
		const preview = item.createEl('div', {
			text: c.contentRaw.slice(0, 220) + (c.contentRaw.length > 220 ? '…' : ''),
		});
		preview.style.cssText = 'font-size:12px;';
		const diffMount = item.createEl('div');
		diffMount.style.cssText = 'margin-top:8px;';
		(diffMount as any).dataset['koraDiffMount'] = 'true';
		items.push(item);
	}
	return { root: list, items };
}

/**
 * Highlight a specific chunk item by index.
 */
export function setActiveChunkItem(
	items: HTMLElement[],
	activeIndex: number
): void {
	items.forEach((el, idx) => {
		if (idx === activeIndex) {
			el.style.borderColor = 'var(--interactive-accent)';
			el.style.background = 'var(--background-modifier-hover)';
		} else {
			el.style.borderColor = 'var(--background-modifier-border)';
			el.style.background = 'var(--background-secondary)';
		}
	});
}
