/**
 * ID and embedding text builders
 * Description: Create stable IDs and embedding text prefixes.
 */

import { v5 as uuidv5 } from 'uuid';
import { sha256 } from './utils';

const UUID_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

export function extractBlockId(line: string): string | null {
  const match = line.match(/\^\(([a-zA-Z0-9_-]{3,})\)\s*$/);
  return match ? `^(${match[1]})` : null;
}

export function buildChunkId(rawText: string, headingsPath: string[], localIndex: number, originalId: string): string {
  const blockId = extractBlockId(rawText);
  if (blockId) return blockId;
  const seed = `${originalId}|${headingsPath.join('>')}|${localIndex}|${sha256(rawText)}`;
  return uuidv5(seed, UUID_NAMESPACE);
}

export function buildEmbeddingText(headingsPath: string[], parentItemText: string | undefined, text: string): string {
  const h = headingsPath.length > 0 ? `H: ${headingsPath.join(' > ')}. ` : '';
  const p = parentItemText ? `Parent: ${parentItemText}. ` : '';
  return `${h}${p}${text}`.trim();
}


