/**
 * This file contains functions for interacting with the Obsidian API.
 */

import { App, TFile } from 'obsidian';

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
 * Retrieves all markdown files from the vault.
 * @param app The Obsidian application instance.
 * @returns An array of markdown file data.
 */
export function getMarkdownFiles(app: App) {
	return app.vault.getMarkdownFiles().map((f) => ({
		path: f.path,
		basename: f.basename,
		stat: f.stat,
	}));
} 