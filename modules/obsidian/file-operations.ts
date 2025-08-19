/**
 * File operations and content utilities
 */

import { App, TFile, TFolder } from 'obsidian';

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
 * Retrieves markdown files from the vault.
 * @param app The Obsidian application instance.
 * @param options Optional parameters for filtering and content inclusion.
 * @returns An array of markdown file data.
 */
export async function getMarkdownFiles(
	app: App, 
	options?: {
		folderPath?: string;
		includeContent?: boolean;
		includeTitle?: boolean;
		include?: string[];
		exclude?: string[];
	}
) {
	const files = app.vault.getMarkdownFiles();
	
	// Filter by folder path if specified (legacy support)
	let filteredFiles = options?.folderPath 
		? files.filter(f => f.path.startsWith(options.folderPath!))
		: files;

	// Apply include filter if provided
	if (options?.include && options.include.length > 0) {
		filteredFiles = filteredFiles.filter(file => 
			options.include!.some(pattern => matchesPattern(file.path, pattern))
		);
	}

	// Apply exclude filter if provided
	if (options?.exclude && options.exclude.length > 0) {
		filteredFiles = filteredFiles.filter(file => 
			!options.exclude!.some(pattern => matchesPattern(file.path, pattern))
		);
	}
	
	// Map files to result format
	const results = [];
	for (const f of filteredFiles) {
		const fileData: any = {
			path: f.path,
			basename: f.basename,
			stat: f.stat,
		};
		
		if (options?.includeTitle || options?.includeContent) {
			const content = await app.vault.read(f);
			
			if (options.includeTitle) {
				const lines = content.split('\n');
				fileData.title = lines[0]?.replace(/^#\s*/, '') || f.basename;
			}
			
			if (options.includeContent) {
				fileData.content = content;
			}
		}
		
		results.push(fileData);
	}
	
	return results;
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
	return [...new Set(areas)]; // Return unique areas
}

/**
 * Retrieves all documentation files from the "/Automate/mcp" directory with full content.
 * @param app The Obsidian application instance.
 * @returns A promise that resolves with the documentation files data.
 */
export async function getAutomateDocs(app: App): Promise<any[]> {
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
