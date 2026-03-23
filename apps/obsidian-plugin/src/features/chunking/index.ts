/**
 * Note Chunker public API
 * Description: Exports chunker functions and types.
 */

export * from '../../../../../packages/kora-core/src/chunking/index.js';
export * from './adapters/obsidian-chunk-transport-adapter.js';
export * from './model/use-related-chunks-screen.js';
export * from './ports/chunk-transport-port.js';
export { default as RelatedChunksScreen } from './ui/RelatedChunksScreen.vue';
