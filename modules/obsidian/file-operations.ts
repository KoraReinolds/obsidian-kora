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
 * Retrieves real TFile objects by an array of file paths.
 * @param app The Obsidian application instance.
 * @param paths Array of file paths to retrieve.
 * @returns Array of TFile objects, with null for non-existent files.
 */
export function getFilesByPaths(app: App, paths: string[]): (TFile | null)[] {
	return paths.map(path => {
		const file = app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	});
}

/**
 * Retrieves real TFile objects by an array of file paths, filtering out non-existent files.
 * @param app The Obsidian application instance.
 * @param paths Array of file paths to retrieve.
 * @returns Array of existing TFile objects only.
 */
export function getExistingFilesByPaths(app: App, paths: string[]): TFile[] {
	return getFilesByPaths(app, paths).filter((file): file is TFile => file !== null);
}

/**
 * Retrieves all "areas" from the vault based on tags.
 * Areas are identified by tags with the prefix "area/".
 * @param app The Obsidian application instance.
 * @returns An array of unique area names.
 */
export function getAreas(app: App): string[] {
	// @ts-ignore
	const allTags = app.metadataCache.getTags();
	const areaTags = Object.keys(allTags).filter((tag) =>
		tag.startsWith('#area/')
	);
	const areas = areaTags.map((tag) => {
		const areaPath = tag.substring('#area/'.length);
		return areaPath.split('/')[0];
	});
	return Array.from(new Set(areas)); // Return unique areas
}

/**
 * Retrieves all documentation files from the "/Automate/mcp" directory with full content.
 * @param app The Obsidian application instance.
 * @returns A promise that resolves with the documentation files data.
 */
export async function getAutomateDocs(app: App): Promise<MarkdownFileData[]> {
	return getMarkdownFiles(app, {
		folderPath: 'Automate/mcp/',
		includeContent: true,
		includeTitle: true
	});
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

/**
 * Generate Telegram post URL from channel ID and message ID.
 * @param channelId The channel ID (numeric or username).
 * @param messageId The message ID.
 * @returns The Telegram post URL.
 */
export function generateTelegramPostUrl(channelId: string, messageId: number): string {
	if (/^-?\d+$/.test(channelId)) {
		let numericId = `${channelId}`;
		if (numericId.startsWith('-100')) {
			numericId = numericId.slice(4); // Remove '-100' prefix
		} else if (numericId.startsWith('-')) {
			numericId = numericId.slice(1); // Remove just '-' prefix
		}
		return `https://t.me/c/${numericId}/${messageId}`;
	} else {
		throw new Error('Unknown channel format');
	}
}
