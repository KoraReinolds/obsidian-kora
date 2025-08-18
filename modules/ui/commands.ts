/**
 * Command definitions for the Kora MCP plugin
 */

import { App, TFile, Notice, Command } from 'obsidian';
import { GramJSBridge, MessageFormatter } from '../telegram';
import { FrontmatterUtils } from '../obsidian';
import { DuplicateTimeFixer } from '../utils';
import { RELATED_CHUNKS_VIEW_TYPE } from '../chunking/ui/related-chunks-view';
import type { KoraMcpPluginSettings } from '../../main';

export class PluginCommands {
  private app: App;
  private settings: KoraMcpPluginSettings;
  private gramjsBridge: GramJSBridge;
  private messageFormatter: MessageFormatter;
  private duplicateTimeFixer: DuplicateTimeFixer;
  private frontmatterUtils: FrontmatterUtils;

  constructor(app: App, settings: KoraMcpPluginSettings, gramjsBridge: GramJSBridge) {
    this.app = app;
    this.settings = settings;
    this.gramjsBridge = gramjsBridge;
    this.messageFormatter = new MessageFormatter(
      settings.telegram.customEmojis,
      settings.telegram.useCustomEmojis
    );
    this.duplicateTimeFixer = new DuplicateTimeFixer(app);
    this.frontmatterUtils = new FrontmatterUtils(app);
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
      {
        id: 'find-duplicate-creation-times',
        name: 'Найти дубликаты времени создания',
        callback: () => this.findDuplicateCreationTimes(),
      },
      {
        id: 'fix-duplicate-creation-times',
        name: 'Исправить дубликаты времени создания',
        callback: () => this.fixDuplicateCreationTimes(),
      },
      {
        id: 'open-related-chunks',
        name: 'Open Related Chunks',
        callback: () => this.openRelatedChunks(),
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

    // Check if note is already linked to a Telegram post
    const telegramMessageId = this.frontmatterUtils.getFrontmatterField(file, 'telegram_message_id');

    // Format message with custom emojis support
    const { processedText } = this.messageFormatter.processCustomEmojis(content);
    
    if (telegramMessageId) {
      // Edit existing message
      const success = await this.gramjsBridge.editMessage(
        peer, 
        telegramMessageId, 
        processedText, 
        undefined, 
        this.settings.telegram.disableWebPagePreview
      );
      if (success) {
        new Notice('Сообщение в Telegram обновлено!');
      }
    } else {
      // Send new message
      const result = await this.gramjsBridge.sendMessage(
        peer, 
        processedText, 
        undefined, 
        undefined, 
        this.settings.telegram.disableWebPagePreview
      );
      if (result.success && result.messageId) {
        // Save message ID to frontmatter
        await this.frontmatterUtils.setFrontmatterField(file, 'telegram_message_id', result.messageId);
        new Notice('Заметка отправлена через GramJS и связана с постом!');
      }
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

  /**
   * Find notes with duplicate creation times
   */
  private async findDuplicateCreationTimes(): Promise<void> {
    new Notice('Поиск дубликатов времени создания...');
    
    try {
      const duplicates = await this.duplicateTimeFixer.findDuplicateCreationTimes();
      const duplicateCount = Object.keys(duplicates).length;
      
      if (duplicateCount === 0) {
        new Notice('Дубликаты времени создания не найдены!');
        return;
      }

      const result = await this.duplicateTimeFixer.fixDuplicateCreationTimes(true); // dry run
      const report = this.duplicateTimeFixer.generateReport(result);
      
      // Создаем временный файл с отчетом
      const reportFile = await this.app.vault.create(
        `Duplicate_Creation_Times_Report_${Date.now()}.md`, 
        report
      );
      
      // Открываем отчет
      const leaf = this.app.workspace.getUnpinnedLeaf();
      await leaf?.openFile(reportFile);
      
      new Notice(`Найдено ${duplicateCount} групп дубликатов. Отчет открыт.`);
    } catch (error) {
      new Notice(`Ошибка поиска дубликатов: ${error}`);
    }
  }

  /**
   * Fix notes with duplicate creation times
   */
  private async fixDuplicateCreationTimes(): Promise<void> {
    new Notice('Исправление дубликатов времени создания...');
    
    try {
      const result = await this.duplicateTimeFixer.fixDuplicateCreationTimes(false);
      
      if (result.totalDuplicates === 0) {
        new Notice('Дубликаты времени создания не найдены!');
        return;
      }

      const report = this.duplicateTimeFixer.generateReport(result);
      
      // Создаем файл с отчетом об исправлении
      const reportFile = await this.app.vault.create(
        `Fixed_Creation_Times_Report_${Date.now()}.md`, 
        report
      );
      
      // Открываем отчет
      const leaf = this.app.workspace.getUnpinnedLeaf();
      await leaf?.openFile(reportFile);
      
      new Notice(`Исправлено ${result.fixed} из ${result.totalDuplicates} файлов. Отчет открыт.`);
    } catch (error) {
      new Notice(`Ошибка исправления дубликатов: ${error}`);
    }
  }

  /**
   * Open Related Chunks view
   */
  private async openRelatedChunks(): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice('Unable to create right panel view');
      return;
    }
    
    try {
      await leaf.setViewState({ type: RELATED_CHUNKS_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
      new Notice('Related Chunks view opened');
    } catch (error) {
      new Notice(`Error opening Related Chunks view: ${error}`);
    }
  }
}