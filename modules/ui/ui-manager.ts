/**
 * UI Manager for injecting buttons and interface elements
 */

import { TFile, Notice, WorkspaceLeaf, App } from 'obsidian';
import { GramJSBridge, MessageFormatter } from '../telegram';
import { NoteUISystem } from './note-ui-system';
import { VectorBridge } from '../vector';
import type { KoraMcpPluginSettings } from '../../main';

export class UIManager {
  private app: App;
  private settings: KoraMcpPluginSettings;
  private gramjsBridge: GramJSBridge;
  private messageFormatter: MessageFormatter;
  private moveFileToFolder: (file: TFile, targetFolder: string) => Promise<void>;
  private getFileContent: (file: TFile) => Promise<string>;
  private noteUISystem: NoteUISystem;
  private vectorBridge: VectorBridge;

  constructor(
    app: App,
    settings: KoraMcpPluginSettings,
    gramjsBridge: GramJSBridge,
    vectorBridge: VectorBridge,
    moveFileToFolder: (file: TFile, targetFolder: string) => Promise<void>,
    getFileContent: (file: TFile) => Promise<string>
  ) {
    this.app = app;
    this.settings = settings;
    this.gramjsBridge = gramjsBridge;
    this.vectorBridge = vectorBridge;
    this.moveFileToFolder = moveFileToFolder;
    this.getFileContent = getFileContent;
    this.messageFormatter = new MessageFormatter(
      settings.telegram.customEmojis,
      settings.telegram.useCustomEmojis
    );
    this.noteUISystem = new NoteUISystem();
  }

  /**
   * Update settings reference
   */
  updateSettings(settings: KoraMcpPluginSettings) {
    this.settings = settings;
    this.messageFormatter.updateEmojiSettings(
      settings.telegram.customEmojis || [],
      settings.telegram.useCustomEmojis || false
    );
  }

  /**
   * Inject buttons and note-specific UI into the workspace leaf
   */
  async injectButtons(leaf: WorkspaceLeaf): Promise<void> {
    const container = (leaf.view as any).containerEl;

    // Удалим уже существующие наши элементы, если есть
    const existing = container.querySelectorAll('.kora-custom-button, .note-ui-renderer');
    existing.forEach((element: HTMLElement) => element.remove());

    // Создаём стандартные кнопки
    const buttons = this.createButtons(leaf);
    
    // Вставляем в начало preview-панели
    const markdownEl = container.querySelector('.view-content');
    if (markdownEl) {
      buttons.reverse().forEach(button => {
        markdownEl.prepend(button);
      });

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

  /**
   * Create UI buttons
   */
  private createButtons(leaf: WorkspaceLeaf): HTMLElement[] {
    const buttons: HTMLElement[] = [];

    // Move to Notes button
    const buttonNotes = this.createButton('Move to Notes', 'kora-move-notes', () => {
      const file = (leaf.view as any).file as TFile;
      if (file) {
        this.moveFileToFolder(file, 'Organize/Notes');
      } else {
        new Notice('Нет активного файла');
      }
    });
    buttons.push(buttonNotes);

    // GramJS Post button (only if GramJS is enabled)
    if (this.settings.useGramJsUserbot) {
      // GramJS Text button
      const buttonGramJSText = this.createButton(
        '📤 GramJS Text',
        'kora-gramjs-text',
        () => this.sendNoteAsText(leaf),
        { backgroundColor: '#0088cc' }
      );
      buttons.push(buttonGramJSText);
    }

    return buttons;
  }

  /*
   * Create a button element
   */
  private createButton(
    text: string,
    className: string,
    onClick: () => void,
    styles: Record<string, string> = {}
  ): HTMLElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.className = `kora-custom-button ${className}`;
    
    // Default styles
    const defaultStyles = {
      margin: '10px',
      border: 'none',
      borderRadius: '5px',
      padding: '5px 10px',
      color: 'white',
      cursor: 'pointer',
      fontSize: '12px',
      backgroundColor: '#6b7280'
    };

    // Apply styles
    Object.assign(button.style, defaultStyles, styles);

    button.onclick = onClick;
    return button;
  }

  /**
   * Send note as text via GramJS
   */
  private async sendNoteAsText(leaf: WorkspaceLeaf): Promise<void> {
    const file = (leaf.view as any).file as TFile;
    if (!file) {
      new Notice('Нет активного файла');
      return;
    }

    const content = await this.getFileContent(file);
    const peer = this.settings.gramjs?.chatId || this.settings.telegram.chatId;
    
    if (!peer) {
      new Notice('Chat ID не настроен');
      return;
    }

    // Process custom emojis
    const { processedText, entities } = this.messageFormatter.processCustomEmojis(content);

    const buttons = this.createNavigationButtons(file);

    const success = await this.gramjsBridge.sendMessage(peer, processedText, entities, buttons);
    if (success) {
      new Notice('Заметка отправлена как текст!');
    }
  }

  /**
   * Create navigation buttons for the post
   */
  private createNavigationButtons(file: TFile): any[][] {
    const buttons = [
      [
          { text: '📝', data: 'view_note:test.md' },
          { text: '✏️', data: 'edit_note:test.md' },
          { text: '🗂️', data: 'browse_folder' },
          { text: '🔍', data: 'search_vault' },
          { text: 'a', data: 'search_vault' },
      ],
   ]; 
   return buttons;
  }

  /**
   * Cleanup note UI system
   */
  cleanup(): void {
    this.noteUISystem.cleanup();
  }
}