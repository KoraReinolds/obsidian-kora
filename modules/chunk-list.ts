/**
 * Chunk List Renderer
 * Description: Render chunk list and allow active item highlighting.
 */

import type { Chunk } from './note-chunker';

export interface ChunkListRefs {
  root: HTMLElement;
  items: HTMLElement[];
}

export function renderChunkList(container: HTMLElement, chunks: Chunk[]): ChunkListRefs {
  const list = container.createEl('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;';
  const items: HTMLElement[] = [];
  for (const c of chunks) {
    const item = list.createEl('div');
    item.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px;background:var(--background-secondary);transition:background-color .15s,border-color .15s;';
    item.createEl('div', { text: `${c.chunkType} — ${c.headingsPath.join(' > ')}` }).style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:4px;';
    item.createEl('div', { text: c.contentRaw.slice(0, 220) + (c.contentRaw.length > 220 ? '…' : '') }).style.cssText = 'font-size:12px;';
    items.push(item);
  }
  return { root: list, items };
}

export function setActiveChunkItem(items: HTMLElement[], activeIndex: number): void {
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


