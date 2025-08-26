/**
 * File operations and content utilities
 */

import { App, TFile } from 'obsidian';

/**
 * Options for getMarkdownFiles function
 */
export interface GetMarkdownFilesOptions {
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
 *
 * Note: Use 'include' with glob patterns instead of folderPath for folder filtering.
 * Example: include: ['Notes/**', 'Projects/*.md'] for files in Notes folder and md files in Projects folder.
 */
export function getMarkdownFiles(
	app: App,
	options?: GetMarkdownFilesOptions
): TFile[] {
	const files = app.vault.getMarkdownFiles();

	// Start with all files
	let filteredFiles = files;

	// Apply include filter if provided
	if (options?.include && options.include.length > 0) {
		filteredFiles = filteredFiles.filter(file =>
			options.include!.some(pattern => matchesInclude(file.path, pattern))
		);
	}

	// Apply exclude filter if provided
	if (options?.exclude && options.exclude.length > 0) {
		filteredFiles = filteredFiles.filter(
			file =>
				!options.exclude!.some(pattern => matchesInclude(file.path, pattern))
		);
	}

	return filteredFiles;
}
