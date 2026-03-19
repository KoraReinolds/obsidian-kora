/**
 * Main modules export - organized plugin modules
 */

// Obsidian utilities
export * from './obsidian';

// Core shared layers
export * from './core';

// Feature modules
export * from './features';

// Host adapters
export * from './hosts';

// Telegram integration
export * from './telegram';

// Vector search
export * from './vector';

// UI components (deprecated - using ui-plugins instead)
// export * from './ui';

// UI Plugins system
export * from './ui-plugins';

// General utilities
export * from './utils';

// MCP server functionality
export * from './mcp';

// Chunking system (re-export for compatibility)
export { chunkNote } from './chunking';

// Daily notes functionality
export * from './daily-notes';
