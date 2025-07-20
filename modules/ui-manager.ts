/**
 * UI Manager for injecting buttons and interface elements
 */

import { TFile, Notice, WorkspaceLeaf } from 'obsidian';
import { GramJSBridge } from './gramjs-bridge';
import { MessageFormatter } from './message-formatter';
import type { KoraMcpPluginSettings } from '../main';

export class UIManager {
  private settings: KoraMcpPluginSettings;
  private gramjsBridge: GramJSBridge;
  private messageFormatter: MessageFormatter;
  private moveFileToFolder: (file: TFile, targetFolder: string) => Promise<void>;

  constructor(
    settings: KoraMcpPluginSettings,
    gramjsBridge: GramJSBridge,
    moveFileToFolder: (file: TFile, targetFolder: string) => Promise<void>
  ) {
    this.settings = settings;
    this.gramjsBridge = gramjsBridge;
    this.moveFileToFolder = moveFileToFolder;
    this.messageFormatter = new MessageFormatter(
      settings.telegram.customEmojis,
      settings.telegram.useCustomEmojis
    );
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
   * Inject buttons into the workspace leaf
   */
  injectButtons(leaf: WorkspaceLeaf): void {
    const container = (leaf.view as any).containerEl;

    // Удалим уже существующие наши кнопки, если есть
    const existing = container.querySelectorAll('.kora-custom-button');
    existing.forEach((btn: HTMLElement) => btn.remove());

    // Создаём кнопки
    const buttons = this.createButtons(leaf);
    
    // Вставляем в начало preview-панели
    const markdownEl = container.querySelector('.view-content');
    if (markdownEl) {
      buttons.reverse().forEach(button => {
        markdownEl.prepend(button);
      });
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
      const buttonGramJS = this.createButton(
        '🚀 GramJS Post',
        'kora-gramjs-post',
        () => this.sendNoteAsImage(leaf),
        { backgroundColor: '#229954' }
      );
      buttons.push(buttonGramJS);

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

  /**
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
      backgroundColor: '#666'
    };

    // Apply styles
    Object.assign(button.style, defaultStyles, styles);

    button.onclick = onClick;
    return button;
  }

  /**
   * Send note as image via GramJS
   */
  private async sendNoteAsImage(leaf: WorkspaceLeaf): Promise<void> {
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

    const success = await this.gramjsBridge.sendNoteAsImage(peer, content, file.basename);
    if (success) {
      new Notice('Заметка отправлена как изображение!');
    }
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

    const success = await this.gramjsBridge.sendMessage(peer, processedText, entities);
    if (success) {
      new Notice('Заметка отправлена как текст!');
    }
  }

  /**
   * Get file content from vault
   */
  private async getFileContent(file: TFile): Promise<string> {
    // This should be injected from the main plugin
    return '';
  }

  /**
   * Set file content getter
   */
  setFileContentGetter(getter: (file: TFile) => Promise<string>): void {
    this.getFileContent = getter;
  }
}