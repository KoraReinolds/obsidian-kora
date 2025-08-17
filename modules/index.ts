/**
 * Main modules export - organized plugin modules
 */

// Obsidian utilities
export * from './obsidian';

// Telegram integration
export * from './telegram';

// Vector search
export * from './vector';

// UI components
export * from './ui';

// General utilities
export * from './utils';

// Chunking system (re-export for compatibility)
export { chunkNote } from './chunking';