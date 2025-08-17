/**
 * Vault operations and file management utilities
 */

import { App, TFile, Notice } from 'obsidian';

export class VaultOperations {
  constructor(private app: App) {}

  /**
   * Move file to specified folder
   */
  async moveFileToFolder(file: TFile, targetFolder: string): Promise<void> {
    const fileName = file.name;
    const newPath = `${targetFolder}/${fileName}`;

    try {
      await this.app.vault.rename(file, newPath);
      new Notice(`Файл перемещён в ${targetFolder}`);
    } catch (err) {
      new Notice(`Ошибка перемещения: ${err}`);
      throw err;
    }
  }

  /**
   * Get file content
   */
  async getFileContent(file: TFile): Promise<string> {
    return await this.app.vault.read(file);
  }

  /**
   * Get active file from workspace
   */
  getActiveFile(): TFile | null {
    return this.app.workspace.getActiveFile();
  }

  /**
   * Create file with content
   */
  async createFile(path: string, content: string): Promise<TFile> {
    return await this.app.vault.create(path, content);
  }

  /**
   * Open file in workspace
   */
  async openFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getUnpinnedLeaf();
    await leaf?.openFile(file);
  }
}