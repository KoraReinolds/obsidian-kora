/**
 * File operations and content utilities
 */

import { App, TFile, TFolder } from 'obsidian';

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
	}
) {
	const files = app.vault.getMarkdownFiles();
	
	// Filter by folder path if specified
	const filteredFiles = options?.folderPath 
		? files.filter(f => f.path.startsWith(options.folderPath!))
		: files;
	
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
