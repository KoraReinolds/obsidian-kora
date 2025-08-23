/**
 * UI Manager for injecting buttons and interface elements
 */

import { TFile, Notice, WorkspaceLeaf, App } from 'obsidian';
import { NoteUISystem } from './note-ui-system';
import { VectorBridge } from '../vector';
import type { UIPluginManager } from '../ui-plugins';
import type { KoraMcpPluginSettings } from '../../main';

export class UIManager {
  private app: App;
  private settings: KoraMcpPluginSettings;
  private getFileContent: (file: TFile) => Promise<string>;
  private noteUISystem: NoteUISystem;
  private vectorBridge: VectorBridge;

  constructor(
    app: App,
    settings: KoraMcpPluginSettings,
    vectorBridge: VectorBridge,
    getFileContent: (file: TFile) => Promise<string>,
    uiPluginManager?: UIPluginManager
  ) {
    this.app = app;
    this.settings = settings;
    this.vectorBridge = vectorBridge;
    this.getFileContent = getFileContent;
    this.noteUISystem = new NoteUISystem(uiPluginManager);
  }

  /**
   * Update settings reference
   */
  updateSettings(settings: KoraMcpPluginSettings) {
    this.settings = settings;
  }

  /**
   * Inject note-specific UI into the workspace leaf
   */
  async injectUI(leaf: WorkspaceLeaf): Promise<void> {
    const container = (leaf.view as any).containerEl;

    // Удалим уже существующие наши элементы, если есть
    const existing = container.querySelectorAll('.note-ui-renderer');
    existing.forEach((element: HTMLElement) => element.remove());

    // Вставляем в начало preview-панели
    const markdownEl = container.querySelector('.view-content');
    if (markdownEl) {
      // Добавляем note-specific UI если есть активный файл
      const file = (leaf.view as any).file as TFile;
      if (file) {
        await this.injectNoteUI(markdownEl, leaf, file);
      }
    }
  }

  /**
   * Inject note-specific UI based on file path and frontmatter
   */
  private async injectNoteUI(containerEl: HTMLElement, leaf: WorkspaceLeaf, file: TFile): Promise<void> {
    try {
      const context = {
        file,
        leaf,
        app: this.app,
        frontmatter: {},
        settings: this.settings,
        vectorBridge: this.vectorBridge,
        getFileContent: this.getFileContent
      };

      // Создаём контейнер для note UI
      const noteUIContainer = document.createElement('div');
      noteUIContainer.className = 'kora-note-ui-container';
      containerEl.prepend(noteUIContainer);

      noteUIContainer.style.cssText = `
        border-bottom: 1px solid var(--background-modifier-border);
        margin-bottom: 20px;
        padding-bottom: 15px;
      `;

      await this.noteUISystem.renderNoteUI(noteUIContainer, context);

      // Если контейнер пустой, удаляем его
      if (!noteUIContainer.hasChildNodes()) {
        noteUIContainer.remove();
      }
    } catch (error) {
      console.error('Error injecting note UI:', error);
    }
  }

  // All button creation logic moved to UI plugins system

  /**
   * Cleanup note UI system
   */
  cleanup(): void {
    this.noteUISystem.cleanup();
  }
}