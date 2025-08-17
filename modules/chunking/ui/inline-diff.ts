/**
 * Inline Diff Utilities
 * Description: Compute and render inline word-level diffs between two texts.
 */

/** A single diff segment. */
export interface DiffPart {
  type: 'equal' | 'add' | 'del';
  text: string;
}

/**
 * Tokenize text into words and whitespace to preserve spacing in diffs.
 */
function tokenize(text: string): string[] {
  return (text || '')
    .split(/(\s+)/)
    .filter(t => t.length > 0);
}

/**
 * Compute LCS-based diff on token arrays and collapse consecutive ops.
 */
export function diffWords(oldText: string, newText: string): DiffPart[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const al = a.length, bl = b.length;
  const dp: number[][] = Array.from({ length: al + 1 }, () => Array(bl + 1).fill(0));
  for (let i = al - 1; i >= 0; i--) {
    for (let j = bl - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  let i = 0, j = 0;
  while (i < al && j < bl) {
    if (a[i] === b[j]) {
      parts.push({ type: 'equal', text: a[i] }); i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push({ type: 'del', text: a[i++] });
    } else {
      parts.push({ type: 'add', text: b[j++] });
    }
  }
  while (i < al) parts.push({ type: 'del', text: a[i++] });
  while (j < bl) parts.push({ type: 'add', text: b[j++] });
  // Collapse adjacent same-type parts
  const collapsed: DiffPart[] = [];
  for (const p of parts) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.type === p.type) last.text += p.text; else collapsed.push({ ...p });
  }
  return collapsed;
}

/**
 * Render inline diff as an HTMLElement with spans for add/del/equal.
 * Tailwind-like classes are added for semantics; Obsidian styles still apply.
 */
export function renderInlineDiff(oldText: string, newText: string): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = 'font-size:12px;line-height:1.4;';
  const parts = diffWords(oldText, newText);
  for (const p of parts) {
    const span = document.createElement('span');
    if (p.type === 'equal') {
      span.textContent = p.text;
    } else if (p.type === 'add') {
      span.textContent = p.text;
      span.style.cssText = 'background:rgba(16,185,129,0.20);color:var(--color-green,#059669);border-radius:4px;padding:0 2px;';
    } else {
      span.textContent = p.text;
      span.style.cssText = 'background:rgba(239,68,68,0.20);color:var(--color-red,#dc2626);text-decoration:line-through;border-radius:4px;padding:0 2px;';
    }
    root.appendChild(span);
  }
  return root;
}


