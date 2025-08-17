/**
 * Frontmatter utilities for working with note metadata
 */

import { App, TFile } from 'obsidian';

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
}