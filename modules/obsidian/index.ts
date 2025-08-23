/**
 * Obsidian module - common utilities for interacting with Obsidian
 */

export { VaultOperations } from './vault-operations';
export { FrontmatterUtils } from './frontmatter-utils';
export { PluginCommands } from './commands';
export { 
  getMarkdownFiles, 
  getAreas, 
  getAutomateDocs, 
  findFileByName, 
  generateTelegramPostUrl,
  getFilesByPaths,
  getExistingFilesByPaths,
  type MarkdownFileData,
  type GetMarkdownFilesOptions
} from './file-operations';