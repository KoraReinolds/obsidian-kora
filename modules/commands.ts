/**
 * Command definitions for the Kora MCP plugin
 */

import { App, TFile, Notice, Command } from 'obsidian';
import { GramJSBridge } from './gramjs-bridge';
import { MessageFormatter } from './message-formatter';
import type { KoraMcpPluginSettings } from '../main';

export class PluginCommands {
  private app: App;
  private settings: KoraMcpPluginSettings;
  private gramjsBridge: GramJSBridge;
  private messageFormatter: MessageFormatter;

  constructor(app: App, settings: KoraMcpPluginSettings, gramjsBridge: GramJSBridge) {
    this.app = app;
    this.settings = settings;
    this.gramjsBridge = gramjsBridge;
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
   * Get all commands
   */
  getCommands(): Command[] {
    return [
      {
        id: 'send-note-gramjs',
        name: 'Send note via GramJS userbot',
        callback: () => this.sendNoteViaGramJS(),
      },
      {
        id: 'test-gramjs-connection',
        name: 'Test GramJS connection',
        callback: () => this.testGramJSConnection(),
      },
      {
        id: 'move-to-notes',
        name: 'Переместить файл в Notes',
        callback: () => this.moveToNotes(),
      },
    ];
  }

  /**
   * Send note via GramJS userbot
   */
  private async sendNoteViaGramJS(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('No active file');
      return;
    }

    const content = await this.app.vault.read(file);
    const peer = this.settings.gramjs?.chatId || this.settings.telegram.chatId;
    
    if (!peer) {
      new Notice('Chat ID не настроен');
      return;
    }

    // Format message with custom emojis support
    const { processedText } = this.messageFormatter.processCustomEmojis(content);
    
    const success = await this.gramjsBridge.sendMessage(peer, processedText);
    if (success) {
      new Notice('Заметка отправлена через GramJS!');
    }
  }

  /**
   * Test GramJS connection
   */
  private async testGramJSConnection(): Promise<void> {
    await this.gramjsBridge.testConnection();
  }

  /**
   * Move file to Notes folder
   */
  private async moveToNotes(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('Нет активного файла');
      return;
    }

    await this.moveFileToFolder(file, 'Organize/Notes');
  }

  /**
   * Move file to specified folder
   */
  private async moveFileToFolder(file: TFile, targetFolder: string): Promise<void> {
    const fileName = file.name;
    const newPath = `${targetFolder}/${fileName}`;

    try {
      await this.app.vault.rename(file, newPath);
      new Notice(`Файл перемещён в ${targetFolder}`);
    } catch (err) {
      new Notice(`Ошибка перемещения: ${err}`);
    }
  }
}