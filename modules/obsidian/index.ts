/**
 * Obsidian module - common utilities for interacting with Obsidian
 */

export { VaultOperations } from './vault-operations';
export { FrontmatterUtils, type ChannelConfig } from './frontmatter-utils';
export { 
  getMarkdownFiles, 
  getAreas, 
  getAutomateDocs, 
  findFileByName, 
  generateTelegramPostUrl 
} from './file-operations';