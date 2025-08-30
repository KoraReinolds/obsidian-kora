/**
 * Frontmatter utilities for working with note metadata
 *
 * Features:
 * - Basic frontmatter operations (get, update)
 * - Array field management with uniqueness enforcement
 * - Batch operations for multiple files
 * - Automatic type conversion for array fields
 * - All operations use updateFrontmatterForFiles as the core method
 */

import { App, TFile, TFolder } from 'obsidian';

export class FrontmatterUtils {
	constructor(private app: App) {}

	/**
	 * Get frontmatter from file
	 */
	async getFrontmatter(file: TFile): Promise<any> {
		const results = await this.getFrontmatterForFiles([file.path]);
		return results[0]?.frontmatter || {};
	}

	/**
	 * Get specific frontmatter field
	 */
	async getFrontmatterField(file: TFile, field: string): Promise<any> {
		const frontmatter = await this.getFrontmatter(file);
		return frontmatter[field];
	}

	/**
	 * Add value to array field in frontmatter, ensuring uniqueness
	 */
	async addToArrayField(file: TFile, field: string, value: any): Promise<void> {
		const frontmatter = await this.getFrontmatter(file);
		const currentArray = frontmatter[field] || [];

		// Ensure it's an array
		if (!Array.isArray(currentArray)) {
			// If field exists but is not an array, convert it to array with existing value
			const existingValue = currentArray;
			await this.updateFrontmatterForFiles([file.path], {
				[field]: [existingValue, value],
			});
			return;
		}

		// Add value if it's not already in the array
		if (!currentArray.includes(value)) {
			const newArray = [...currentArray, value];
			await this.updateFrontmatterForFiles([file.path], {
				[field]: newArray,
			});
		}
	}

	/**
	 * Remove value from array field in frontmatter
	 */
	async removeFromArrayField(
		file: TFile,
		field: string,
		value: any
	): Promise<void> {
		const frontmatter = await this.getFrontmatter(file);
		const currentArray = frontmatter[field];

		if (Array.isArray(currentArray)) {
			const newArray = currentArray.filter(item => item !== value);
			await this.updateFrontmatterForFiles([file.path], {
				[field]: newArray,
			});
		}
	}

	/**
	 * Updates the frontmatter for a given list of files.
	 * @param filePaths An array of file paths to update.
	 * @param frontmatter The frontmatter object to be added or updated.
	 * @returns A promise that resolves with the results of the operation.
	 */
	async updateFrontmatterForFiles(
		filePaths: string[],
		frontmatter: Record<string, any>
	) {
		const results: {
			file: string;
			status: 'success' | 'error';
			message?: string;
		}[] = [];
		for (const filePath of filePaths) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				try {
					await this.app.fileManager.processFrontMatter(file, fm => {
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
	 * Retrieves the frontmatter for a given list of files.
	 * @param filePaths An array of file paths to read.
	 * @returns A promise that resolves with an array of objects, each containing the file path and its frontmatter.
	 */
	async getFrontmatterForFiles(filePaths: string[]): Promise<any[]> {
		const results: {
			file: string;
			frontmatter: Record<string, any> | null;
			error?: string;
		}[] = [];
		for (const filePath of filePaths) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				const cache = this.app.metadataCache.getFileCache(file);
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
	 * @returns A promise that resolves with the frontmatter data for all area notes.
	 */
	async getAreaFrontmatters(): Promise<any[]> {
		const areaFolder = this.app.vault.getAbstractFileByPath('Area');
		if (!(areaFolder instanceof TFolder)) {
			console.error('Area folder not found');
			return [];
		}

		const filePaths = areaFolder.children
			.filter(
				(child): child is TFile =>
					child instanceof TFile && child.extension === 'md'
			)
			.map(file => file.path);

		return this.getFrontmatterForFiles(filePaths);
	}
}
