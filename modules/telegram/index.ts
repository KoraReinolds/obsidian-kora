/**
 * Telegram module - utilities for Telegram integration
 * Organized into logical submodules for better maintainability
 */

// Core components
export * from './core';

// Message formatting
export * from './formatting';

// Network transport
export * from './transport';

// Utilities
export * from './utils';

// UI components
export * from './ui';

// Backward compatibility exports (using new components)
export { ObsidianTelegramFormatter as MessageFormatter } from './formatting/obsidian-telegram-formatter';
import { LinkParser } from './formatting/link-parser';
export const generateTelegramPostUrl = LinkParser.generateTelegramPostUrl;
