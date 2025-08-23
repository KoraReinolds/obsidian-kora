/**
 * Command definitions for the Kora MCP plugin
 */

import { App, TFile, Notice, Command } from 'obsidian';
import { GramJSBridge, MessageFormatter, ChannelConfigService, type ChannelConfig, createNavigationButtons } from '../telegram';
import { FrontmatterUtils } from '../obsidian';
import { DuplicateTimeFixer } from '../utils';
import { RELATED_CHUNKS_VIEW_TYPE } from '../chunking/ui/related-chunks-view';
import { ChannelSuggester, FolderConfigSuggester } from '../obsidian/suggester';
import type { KoraMcpPluginSettings, TelegramFolderConfig } from '../../main';

export class PluginCommands {
  private app: App;
  private settings: KoraMcpPluginSettings;
  private gramjsBridge: GramJSBridge;
  private messageFormatter: MessageFormatter;
  private duplicateTimeFixer: DuplicateTimeFixer;
  private frontmatterUtils: FrontmatterUtils;
  private channelConfigService: ChannelConfigService;

  constructor(app: App, settings: KoraMcpPluginSettings, gramjsBridge: GramJSBridge) {
    this.app = app;
    this.settings = settings;
    this.gramjsBridge = gramjsBridge;
    this.duplicateTimeFixer = new DuplicateTimeFixer(app);
    this.frontmatterUtils = new FrontmatterUtils(app);
    this.channelConfigService = new ChannelConfigService(app, settings);
    this.messageFormatter = new MessageFormatter(
      settings.telegram.customEmojis,
      settings.telegram.useCustomEmojis,
      app,
      this.channelConfigService
    );
}

  /**
   * Update settings reference
   */
  updateSettings(settings: KoraMcpPluginSettings) {
    this.settings = settings;
    this.channelConfigService.updateSettings(settings);
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
      {
        id: 'send-note-to-channel',
        name: 'Отправить заметку в канал',
        callback: () => this.sendNoteToChannel(),
      },
      {
        id: 'send-folder-notes-to-channels',
        name: 'Отправить заметки первого уровня папки в каналы',
        callback: () => this.sendFolderNotesToChannels(),
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
    const peer = this.settings.gramjs?.chatId;
    
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
      const success = await this.gramjsBridge.editMessage({
        peer,
        messageId: telegramMessageId,
        message: processedText,
        disableWebPagePreview: this.settings.telegram.disableWebPagePreview,
      });
      if (success) {
        new Notice('Сообщение в Telegram обновлено!');
      }
    } else {
      // Send new message
      const result = await this.gramjsBridge.sendMessage({
        peer,
        message: processedText,
        disableWebPagePreview: this.settings.telegram.disableWebPagePreview
      });
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

  /**
   * Send current note to channel via suggester modal
   */
  private async sendNoteToChannel(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('Нет активного файла');
      return;
    }

    await this.sendNoteToChannelByFile(file);
  }

  /**
   * Send specific file to channel via suggester modal (for UI plugins)
   */
  async sendNoteToChannelByFile(file: TFile): Promise<void> {
    // Create channel suggester and open it
    const channelSuggester = new ChannelSuggester(
      this.app,
      file,
      this.settings,
      async (channelConfig) => {
        try {
          await this.sendToSelectedChannel(file, channelConfig);
        } catch (error) {
          new Notice(`Ошибка отправки: ${error}`);
        }
      }
    );

    channelSuggester.openSuggester();
  }

  /**
   * Send file to the selected channel (reusing logic from UI Manager)
   */
  private async sendToSelectedChannel(file: TFile, channelConfig: ChannelConfig): Promise<void> {
    const content = await this.app.vault.read(file);
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

    // Create navigation buttons using shared utility
    const buttons = createNavigationButtons(file);
 
    if (channelConfig.messageId) {
      // Edit existing message
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
      }
    } else {
      // Send new message  
      const buttons = createNavigationButtons(file);
      const result = await this.gramjsBridge.sendMessage({
        peer: channelConfig.channelId,
        message: processedText,
        entities: combinedEntities,
        buttons,
        disableWebPagePreview: this.settings.telegram.disableWebPagePreview || true
      });
      if (result.success && result.messageId) {
        // Always use new post_ids format
        await this.channelConfigService.updatePostIds(file, channelConfig.channelId, result.messageId);
        new Notice(`Заметка отправлена в ${channelConfig.name}!`);
      }
    }
  }

  /**
   * Send all notes from a selected folder to channels (first level only)
   */
  private async sendFolderNotesToChannels(): Promise<void> {
    // Create folder config suggester and open it
    const folderConfigSuggester = new FolderConfigSuggester(
      this.app,
      this.settings,
      async (folderConfig) => {
        try {
          await this.sendAllNotesFromFolder(folderConfig);
        } catch (error) {
          new Notice(`Ошибка отправки файлов папки: ${error}`);
        }
      }
    );

    folderConfigSuggester.openSuggester();
  }

  /**
   * Send all notes from a folder to their configured channels (first level only)
   */
  private async sendAllNotesFromFolder(folderConfig: TelegramFolderConfig): Promise<void> {
    const folderPath = folderConfig.folder;
    
    // Get all markdown files from the folder (first level only)
    const allFiles = this.app.vault.getMarkdownFiles();
    const folderFiles = allFiles.filter(file => {
      // Check if file is in the exact folder (not in subfolders)
      const filePath = file.path;
      const relativePath = filePath.substring(folderPath.length);
      
      // File is in first level if it's directly in the folder
      // (no additional path separators except the initial one)
      return filePath.startsWith(folderPath) && 
             (relativePath === file.name || 
              relativePath === '/' + file.name ||
              relativePath === '\\' + file.name);
    });
    
    if (folderFiles.length === 0) {
      new Notice(`В папке ${folderPath} нет markdown файлов первого уровня`);
      return;
    }

    new Notice(`Начинаю отправку ${folderFiles.length} файлов первого уровня из папки ${folderPath}...`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process files sequentially to avoid overwhelming the API
    for (const file of folderFiles) {
      try {
        // Get channel configs for this file
        const channelConfigs = this.channelConfigService.getChannelConfigsForFile(file);
        
        if (channelConfigs.length === 0) {
          console.log(`Пропускаю файл ${file.name}: нет настроенных каналов`);
          continue;
        }

        // Send to each configured channel
        for (const channelConfig of channelConfigs) {
          await this.sendToSelectedChannel(file, channelConfig);
          // Small delay between sends to be respectful to the API
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        successCount++;
      } catch (error) {
        errorCount++;
        const errorMsg = `${file.name}: ${error}`;
        errors.push(errorMsg);
        console.error(`Ошибка отправки файла ${file.name}:`, error);
      }
    }

    // Show final results
    const resultMessage = `Готово! Успешно: ${successCount}, Ошибок: ${errorCount}`;
    new Notice(resultMessage);
  }


}