/**
 * This file contains functions for interacting with the Obsidian API.
 */

import { App, TFile, TFolder } from 'obsidian';

/**
 * Updates the frontmatter for a given list of files.
 * @param app The Obsidian application instance.
 * @param filePaths An array of file paths to update.
 * @param frontmatter The frontmatter object to be added or updated.
 * @returns A promise that resolves with the results of the operation.
 */
export async function updateFrontmatterForFiles(
	app: App,
	filePaths: string[],
	frontmatter: Record<string, any>
) {
	const results = [];
	for (const filePath of filePaths) {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			try {
				await app.fileManager.processFrontMatter(file, (fm) => {
					Object.assign(fm, frontmatter);
				});
				results.push({
					file: filePath,
					status: 'success',
				});
			} catch (e: any) {
				results.push({
					file: filePath,
					status: 'error',
					message: e.message,
				});
			}
		} else {
			results.push({
				file: filePath,
				status: 'error',
				message: 'File not found or is not a markdown file.',
			});
		}
	}
	return { results };
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
 * Retrieves the frontmatter for a given list of files.
 * @param app The Obsidian application instance.
 * @param filePaths An array of file paths to read.
 * @returns A promise that resolves with an array of objects, each containing the file path and its frontmatter.
 */
export async function getFrontmatterForFiles(
	app: App,
	filePaths: string[]
): Promise<any[]> {
	const results = [];
	for (const filePath of filePaths) {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			const cache = app.metadataCache.getFileCache(file);
			results.push({
				file: filePath,
				frontmatter: cache?.frontmatter || {},
			});
		} else {
			results.push({
				file: filePath,
				frontmatter: null,
				error: 'File not found or not a markdown file.',
			});
		}
	}
	return results;
}

/**
 * Retrieves the frontmatter of all markdown files in the "/Area" directory.
 * @param app The Obsidian application instance.
 * @returns A promise that resolves with the frontmatter data for all area notes.
 */
export async function getAreaFrontmatters(app: App): Promise<any[]> {
	const areaFolder = app.vault.getAbstractFileByPath('Area');
	if (!(areaFolder instanceof TFolder)) {
		console.error('Area folder not found');
		return [];
	}

	const filePaths = areaFolder.children
		.filter((child): child is TFile => child instanceof TFile && child.extension === 'md')
		.map((file) => file.path);

	return getFrontmatterForFiles(app, filePaths);
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