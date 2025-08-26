/**
 * File operations and content utilities
 */

import { App, TFile } from 'obsidian';

/**
 * Type for markdown file data returned by getMarkdownFiles
 */
export interface MarkdownFileData {
	path: string;
	basename: string;
	stat: {
		ctime: number;
		mtime: number;
		size: number;
	};
}

/**
 * Options for getMarkdownFiles function
 */
export interface GetMarkdownFilesOptions {
	folderPath?: string;
	includeContent?: boolean;
	includeTitle?: boolean;
	include?: string[];
	exclude?: string[];
}

/**
 * Checks if a file path matches a glob-like pattern.
 * @param path The file path to check.
 * @param pattern The glob pattern (* and ** supported).
 * @returns True if the path matches the pattern.
 */
function matchesPattern(path: string, pattern: string): boolean {
	// Convert glob-like pattern to regex
	// Support for * (any characters) and ** (any directories)
	// First escape dots, then handle globs with placeholders to avoid conflicts
	const regexPattern = pattern
		.replace(/\./g, '\\.') // Escape dots first
		.replace(/\*\*/g, '__DOUBLE_STAR__') // Temporary placeholder for **
		.replace(/\*/g, '[^/]*') // * matches any characters except /
		.replace(/__DOUBLE_STAR__/g, '.*'); // ** matches any directories
	
	const regex = new RegExp(`^${regexPattern}$`);
	return regex.test(path);
}

/**
 * Checks include pattern: if pattern has wildcards, use glob matching; otherwise use simple substring search.
 */
function matchesInclude(path: string, pattern: string): boolean {
    const hasWildcard = pattern.includes('*');
    if (hasWildcard) {
        return matchesPattern(path, pattern);
    }
    return path.includes(pattern);
}

/**
 * Retrieves markdown files from the vault.
 * @param app The Obsidian application instance.
 * @param options Optional parameters for filtering and content inclusion.
 * @returns An array of markdown file data.
 */
export async function getMarkdownFiles(
	app: App, 
	options?: GetMarkdownFilesOptions
): Promise<MarkdownFileData[]> {
	const files = app.vault.getMarkdownFiles();
	
	// Filter by folder path if specified (legacy support)
	let filteredFiles = options?.folderPath 
		? files.filter(f => f.path.startsWith(options.folderPath!))
		: files;

	// Apply include filter if provided
	if (options?.include && options.include.length > 0) {
		filteredFiles = filteredFiles.filter(file =>
			options.include!.some(pattern => matchesInclude(file.path, pattern))
		);
	}

	// Apply exclude filter if provided
	if (options?.exclude && options.exclude.length > 0) {
		filteredFiles = filteredFiles.filter(file => 
			!options.exclude!.some(pattern => matchesInclude(file.path, pattern))
		);
	}
	
	return filteredFiles;
}

/**
 * Retrieves real TFile objects by an array of file paths, filtering out non-existent files.
 * @param app The Obsidian application instance.
 * @param paths Array of file paths to retrieve.
 * @returns Array of existing TFile objects only.
 */
export function getFilesByPaths(app: App, paths: string[]): TFile[] {
  const files = paths.map(path => {
		const file = app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	});
  return files.filter((file): file is TFile => file !== null);
}

/**
 * Find a file by its name (with or without .md extension).
 * Searches both by direct path and by basename across all markdown files.
 * @param app The Obsidian application instance.
 * @param fileName The file name to search for.
 * @returns The found TFile or null if not found.
 */
export function findFileByName(app: App, fileName: string): TFile | null {
	// Add .md extension if not present
	const fullFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
	
	// Try direct path lookup first
	const file = app.vault.getAbstractFileByPath(fullFileName);
	if (file instanceof TFile) {
		return file;
	}
	
	// If not found by direct path, search all markdown files
	const allFiles = app.vault.getMarkdownFiles();
	return allFiles.find(f => f.basename === fileName || f.name === fullFileName) || null;
}

