/**
 * UI Manager for injecting buttons and interface elements
 */

import { TFile, Notice, WorkspaceLeaf, App } from 'obsidian';
import { GramJSBridge, MessageFormatter } from '../telegram';
import { FrontmatterUtils, type ChannelConfig } from '../obsidian';
import { NoteUISystem } from './note-ui-system';
import { VectorBridge } from '../vector';
import type { KoraMcpPluginSettings, TelegramFolderConfig, TelegramChannelConfig } from '../../main';

export class UIManager {
  private app: App;
  private settings: KoraMcpPluginSettings;
  private gramjsBridge: GramJSBridge;
  private messageFormatter: MessageFormatter;
  private frontmatterUtils: FrontmatterUtils;
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
      settings.telegram.useCustomEmojis,
      app
    );
    this.frontmatterUtils = new FrontmatterUtils(app);
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

    // Telegram buttons
    const file = (leaf.view as any).file as TFile;
    if (file) {
      const channelConfigs = this.getChannelConfigsForFile(file);
      channelConfigs.forEach(channelConfig => {
        const channelButton = this.createChannelButton(leaf, channelConfig);
        buttons.push(channelButton);
      });
    }

    return buttons;
  }

  /**
   * Get all channel configurations for a file (folder-based + legacy)
   */
  private getChannelConfigsForFile(file: TFile): ChannelConfig[] {
    const configs: ChannelConfig[] = [];
    
    // Try folder-based configuration first
    const folderConfig = this.getFolderConfigForFile(file);
    if (folderConfig) {
      folderConfig.channels.forEach(channelConfig => {
        configs.push(this.createChannelConfigFromFolder(folderConfig, channelConfig, file));
      });
    } else {
      // tododo
      // Fallback to legacy frontmatter-based configuration
      const legacyConfigs = this.frontmatterUtils.getChannelConfigs(file);
      configs.push(...legacyConfigs);
    }
    
    return configs;
  }

  /**
   * Create a channel button with unified logic
   */
  private createChannelButton(leaf: WorkspaceLeaf, channelConfig: ChannelConfig): HTMLElement {
    const buttonText = channelConfig.messageId 
      ? `✏️ ${channelConfig.name}` 
      : `📤 ${channelConfig.name}`;
    const buttonColor = channelConfig.messageId ? '#f59e0b' : '#0088cc';
    const cssClass = 'kora-telegram';
    
    return this.createButton(
      buttonText,
      `${cssClass}-${channelConfig.name.toLowerCase().replace(/\s+/g, '-')}`,
      () => this.sendNoteToChannel(leaf, channelConfig),
      { backgroundColor: buttonColor }
    );
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
   * Send note to specific channel
   */
  private async sendNoteToChannel(leaf: WorkspaceLeaf, channelConfig: ChannelConfig): Promise<void> {
    const file = (leaf.view as any).file as TFile;
    if (!file) {
      new Notice('Нет активного файла');
      return;
    }

    const content = await this.getFileContent(file);
    const peer = channelConfig.channelId;
    
    if (!peer) {
      new Notice(`Channel ID не настроен для ${channelConfig.name}`);
      return;
    }

    // Convert markdown to Telegram format and process custom emojis
    const conversionResult = this.messageFormatter.formatMarkdownNote(file.basename, content);
    const { processedText, entities: customEmojiEntities } = this.messageFormatter.processCustomEmojis(conversionResult.text);
    
    // Combine markdown entities with custom emoji entities
    const combinedEntities = [
      ...(conversionResult.entities || []),
      ...customEmojiEntities
    ].sort((a, b) => a.offset - b.offset);
 
    if (channelConfig.messageId) {
      // Edit existing message
      const buttons = this.createNavigationButtons(file);
      const success = await this.gramjsBridge.editMessage({
        peer: channelConfig.channelId,
        messageId: channelConfig.messageId,
        message: processedText,
        entities: combinedEntities,
        buttons,
        disableWebPagePreview: this.settings.telegram.disableWebPagePreview || true
      });
      if (success) {
        new Notice(`Сообщение в ${channelConfig.name} обновлено!`);
        await this.injectButtons(leaf);
      }
    } else {
      // Send new message
      const buttons = this.createNavigationButtons(file);
      const result = await this.gramjsBridge.sendMessage({
        peer: channelConfig.channelId,
        message: processedText,
        entities: combinedEntities,
        buttons,
        disableWebPagePreview: this.settings.telegram.disableWebPagePreview || true
      });
      if (result.success && result.messageId) {
        // Always use new post_ids format
        await this.updatePostIds(file, channelConfig.channelId, result.messageId);
        new Notice(`Заметка отправлена в ${channelConfig.name}!`);
        await this.injectButtons(leaf);
      }
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
      ],
   ]; 
   return buttons;
  }

  /**
   * Update channel configuration in frontmatter
   */
  private async updateChannelConfig(file: TFile, channelName: string, messageId: number): Promise<void> {
    const frontmatter = this.frontmatterUtils.getFrontmatter(file);
    const channels = Array.isArray(frontmatter.telegram_channels) ? frontmatter.telegram_channels : [];
    
    const channelIndex = channels.findIndex((ch: any) => ch.name === channelName);
    if (channelIndex !== -1) {
      channels[channelIndex] = { ...channels[channelIndex], messageId };
      await this.frontmatterUtils.setFrontmatterField(file, 'telegram_channels', channels);
    }
  }

  /**
   * Create a ChannelConfig from folder and channel configurations
   */
  private createChannelConfigFromFolder(folderConfig: TelegramFolderConfig, channelConfig: TelegramChannelConfig, file?: TFile): ChannelConfig {
    const targetFile = file || this.app.workspace.getActiveFile() as TFile;
    const postIds = this.getPostIds(targetFile);
    const messageId = postIds?.[channelConfig.channelId] || undefined;
    
    return {
      name: channelConfig.name,
      channelId: channelConfig.channelId,
      messageId
    };
  }

  /**
   * Get folder configuration for a file based on its path
   */
  private getFolderConfigForFile(file: TFile): TelegramFolderConfig | null {
    const filePath = file.path;
    
    // Find the folder config that matches this file's path
    for (const config of this.settings.telegram.folderConfigs) {
      if (config.folder && filePath.startsWith(config.folder)) {
        return config;
      }
    }
    
    return null;
  }

  /**
   * Get post IDs from frontmatter (new simplified format)
   */
  private getPostIds(file: TFile): Record<string, number> | null {
    const frontmatter = this.frontmatterUtils.getFrontmatter(file);
    return frontmatter.post_ids || null;
  }

  /**
   * Update post IDs in frontmatter
   */
  private async updatePostIds(file: TFile, channelId: string, messageId: number): Promise<void> {
    const frontmatter = this.frontmatterUtils.getFrontmatter(file);
    const postIds = frontmatter.post_ids || {};
    
    postIds[channelId] = messageId;
    await this.frontmatterUtils.setFrontmatterField(file, 'post_ids', postIds);
  }



  /**
   * Cleanup note UI system
   */
  cleanup(): void {
    this.noteUISystem.cleanup();
  }
}