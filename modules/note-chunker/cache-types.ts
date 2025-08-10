/**
 * Cache Types
 * Description: Minimal Obsidian cache typings and helpers to resolve heading paths.
 */

type TLine = { line: number; col?: number; offset: number };
type TGap = { start: TLine; end: TLine };

/** Minimal but extended subset of Obsidian CachedMetadata for reuse. */
export interface CachedMetadataLike {
  // Headings like #, ##, ... with position
  headings?: Array<{
    heading: string;
    level: number;
    position: TGap;
  }>;

  // High-level sections detected by Obsidian's markdown parser
  sections?: Array<{
    type: 'yaml' | 'paragraph' | 'heading' | 'list' | 'code' | 'table' | 'blockquote' | 'comment' | string;
    position: TGap;
  }>;

  // Inline and block code info is represented via sections and blocks above

  // All list items (ordered/unordered) with positions
  listItems?: Array<{
    position: TGap;
    // Optional derived properties (not in upstream), useful for consumers
    task?: boolean; // [ ] or [x]
    checked?: boolean;
    // Future: nesting depth can be computed from indentation; we compute on the fly
  }>;

  // All internal wiki links [[link]] and markdown links [text](url)
  links?: Array<{
    link: string;           // target path or heading
    original: string;       // original source snippet
    displayText?: string;   // rendered label
    position: TGap;
  }>;

  // Frontmatter key-values if available
  frontmatter?: Record<string, unknown>;
  frontmatterPosition?: TGap | null;

  // Outgoing embeds ![[...]]
  embeds?: Array<{
    link: string;
    position: TGap;
  }>;

  // Tags like #tag or #tag/sub
  tags?: Array<{
    tag: string;
    position: TGap;
  }>;

  // Blocks like ^block-id
  blocks?: Record<string, { position: TGap }>;
}

/**
 * Create a function that returns the active heading path at a given line number.
 */
export function buildHeadingPathResolver(cache: CachedMetadataLike) {
  const headings = (cache.headings || [])
    .slice()
    .sort((a, b) => a.position.start.line - b.position.start.line);
  const stack: string[] = [];
  let idx = 0;
  let lastLine = -1;
  return (line: number): string[] => {
    if (line < lastLine) {
      stack.length = 0;
      idx = 0;
      lastLine = -1;
    }
    while (idx < headings.length && headings[idx].position.start.line <= line) {
      const h = headings[idx];
      stack.splice(h.level - 1);
      stack[h.level - 1] = h.heading.trim();
      idx++;
    }
    lastLine = line;
    return [...stack];
  };
}


