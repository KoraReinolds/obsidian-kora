/**
 * Frontmatter utilities for working with note metadata
 */

import { App, TFile, TFolder } from 'obsidian';

export class FrontmatterUtils {
  constructor(private app: App) {}

  /**
   * Get frontmatter from file
   */
  getFrontmatter(file: TFile): any {
    const cache = this.app.metadataCache.getFileCache(file);
    return cache?.frontmatter || {};
  }

  /**
   * Update frontmatter
   */
  async updateFrontmatter(file: TFile, updates: Record<string, any>): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      Object.assign(frontmatter, updates);
    });
  }

  /**
   * Get specific frontmatter field
   */
  getFrontmatterField(file: TFile, field: string): any {
    const frontmatter = this.getFrontmatter(file);
    return frontmatter[field];
  }

  /**
   * Set specific frontmatter field
   */
  async setFrontmatterField(file: TFile, field: string, value: any): Promise<void> {
    await this.updateFrontmatter(file, { [field]: value });
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
    const results = [];
    for (const filePath of filePaths) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        try {
          await this.app.fileManager.processFrontMatter(file, (fm) => {
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
    const results = [];
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
      .filter((child): child is TFile => child instanceof TFile && child.extension === 'md')
      .map((file) => file.path);

    return this.getFrontmatterForFiles(filePaths);
  }
}