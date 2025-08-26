/**
 * Obsidian module - common utilities for interacting with Obsidian
 */

export { VaultOperations } from './vault-operations';
export { FrontmatterUtils } from './frontmatter-utils';
export { PluginCommands } from './commands';
export { TextInputSuggest } from './suggester';
export { ConfigurableSuggester, SuggesterFactory, type SuggesterConfig } from './suggester-modal';
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