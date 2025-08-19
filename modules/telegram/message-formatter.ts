/**
 * Utilities for formatting messages for different platforms
 */

import { 
  MarkdownToTelegramConverter, 
  type ConversionOptions, 
  type ConversionResult 
} from './markdown-to-telegram-converter';
import { App } from 'obsidian';
import { 
  FrontmatterUtils, 
  findFileByName, 
  generateTelegramPostUrl 
} from '../obsidian';

export interface EmojiMapping {
  standard: string;      // Обычный эмодзи (например: "📝")
  customId: string;      // ID кастомного эмодзи
  description?: string;  // Описание для UI
}

export interface MessageEntity {
  type: string;
  offset: number;
  length: number;
  custom_emoji_id?: string;
}



export class MessageFormatter {
  private customEmojis: EmojiMapping[];
  private useCustomEmojis: boolean;
  private markdownConverter: MarkdownToTelegramConverter;
  private app?: App;
  private frontmatterUtils?: FrontmatterUtils;

  constructor(customEmojis: EmojiMapping[] = [], useCustomEmojis = false, app?: App) {
    this.customEmojis = customEmojis;
    this.useCustomEmojis = useCustomEmojis;
    this.markdownConverter = new MarkdownToTelegramConverter();
    this.app = app;
    if (app) {
      this.frontmatterUtils = new FrontmatterUtils(app);
    }
  }

  /**
   * Форматировать сообщение для Telegram
   */
  formatMessage(fileName: string, content: string): string {
    // Экранируем специальные символы для MarkdownV2
    const escapedFileName = this.escapeMarkdownV2(fileName);
    const escapedContent = this.escapeMarkdownV2(content);
    
    return `📝 *${escapedFileName}*\n\n${escapedContent}`;
  }

  /**
   * Экранировать специальные символы для MarkdownV2
   */
  escapeMarkdownV2(text: string): string {
    // Символы, которые нужно экранировать в MarkdownV2
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    
    let escaped = text;
    specialChars.forEach(char => {
      escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
    });
    
    return escaped;
  }

  /**
   * Обработать кастомные эмодзи в тексте
   */
  processCustomEmojis(text: string): { processedText: string; entities: MessageEntity[] } {
    if (!this.useCustomEmojis || !this.customEmojis || this.customEmojis.length === 0) {
      return { processedText: text, entities: [] };
    }

    const processedText = text;
    const entities: MessageEntity[] = [];

    // Проходим по всем настроенным маппингам
    this.customEmojis.forEach(mapping => {
      const regex = new RegExp(this.escapeRegExp(mapping.standard), 'g');
      let match;

      // Находим все вхождения стандартного эмодзи
      while ((match = regex.exec(text)) !== null) {
        entities.push({
          type: 'custom_emoji',
          offset: match.index,
          length: mapping.standard.length,
          custom_emoji_id: mapping.customId
        });
      }
    });

    // Сортируем entities по offset для корректной обработки
    entities.sort((a, b) => a.offset - b.offset);

    return { processedText, entities };
  }

  /**
   * Экранировать символы для RegExp
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Обновить настройки эмодзи
   */
  updateEmojiSettings(customEmojis: EmojiMapping[], useCustomEmojis: boolean) {
    this.customEmojis = customEmojis;
    this.useCustomEmojis = useCustomEmojis;
  }

  /**
   * Получить все маппинги кастомных эмодзи
   */
  getCustomEmojiMappings(): EmojiMapping[] {
    return this.customEmojis || [];
  }

  /**
   * Добавить маппинг кастомного эмодзи
   */
  addCustomEmojiMapping(standard: string, customId: string, description?: string): void {
    if (!this.customEmojis) {
      this.customEmojis = [];
    }

    // Проверяем, не существует ли уже такой маппинг
    const existingIndex = this.customEmojis.findIndex(m => m.standard === standard);
    
    if (existingIndex !== -1) {
      // Обновляем существующий
      this.customEmojis[existingIndex] = { standard, customId, description };
    } else {
      // Добавляем новый
      this.customEmojis.push({ standard, customId, description });
    }
  }

  /**
   * Удалить маппинг кастомного эмодзи
   */
  removeCustomEmojiMapping(standard: string): void {
    if (!this.customEmojis) return;

    this.customEmojis = this.customEmojis.filter(m => m.standard !== standard);
  }

  /**
   * Форматировать markdown заметку для Telegram
   */
  formatMarkdownNote(fileName: string, markdownContent: string, options?: ConversionOptions): ConversionResult {
    // Конвертируем Obsidian ссылки в telegram URL перед обработкой
    const processedContent = this.convertObsidianLinksToTelegramUrls(markdownContent);
    
    // Конвертируем markdown в telegram формат
    const conversionResult = this.markdownConverter.convert(processedContent, options);
    
    // Объединяем заголовок с контентом
    const finalText = conversionResult.text;
    
    // Корректируем offset'ы entities с учетом добавленного заголовка
    const adjustedEntities = conversionResult.entities?.map(entity => ({
      ...entity,
      offset: entity.offset
    })) || [];

    return {
      ...conversionResult,
      text: finalText,
      entities: adjustedEntities
    };
  }

  /**
   * Конвертировать markdown в telegram формат без заголовка
   */
  convertMarkdownToTelegram(markdownContent: string, options?: ConversionOptions): ConversionResult {
    return this.markdownConverter.convert(markdownContent, options);
  }

  /**
   * Получить экземпляр markdown конвертера для прямого доступа
   */
  getMarkdownConverter(): MarkdownToTelegramConverter {
    return this.markdownConverter;
  }

  /**
   * Конвертировать Obsidian ссылки [[file|text]] в Telegram URL [text](https://t.me/...)
   */
  private convertObsidianLinksToTelegramUrls(content: string): string {
    if (!this.app || !this.frontmatterUtils) {
      throw new Error('App instance required for link conversion');
    }

    // Регулярное выражение для поиска Obsidian ссылок: [[filename]] или [[filename|display text]]
    const obsidianLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    
    return content.replace(obsidianLinkRegex, (match, fileName, displayText) => {
      try {
        // Используем displayText если есть, иначе fileName
        const linkText = displayText || fileName;
        
        // Получаем файл по имени
        if (!this.app) {
          throw new Error('App instance required for link conversion');
        }
        
        const file = findFileByName(this.app, fileName);
        if (!file) {
          throw new Error(`File "${fileName}" not found`);
        }
        
        // Получаем конфигурацию каналов для файла
        if (!this.frontmatterUtils) {
          throw new Error('FrontmatterUtils instance required for link conversion');
        }
        
        const channelConfigs = this.frontmatterUtils.getChannelConfigs(file);
        if (channelConfigs.length === 0) {
          throw new Error(`No channel configuration found for file "${fileName}"`);
        }
        
        // Используем первую доступную конфигурацию с messageId
        const publishedConfig = channelConfigs.find(config => config.messageId);
        if (!publishedConfig || !publishedConfig.messageId) {
          throw new Error(`File "${fileName}" is not published (no messageId found)`);
        }
        
        // Генерируем URL
        const telegramUrl = generateTelegramPostUrl(publishedConfig.channelId, publishedConfig.messageId);
        
        // Возвращаем markdown ссылку
        return `[${linkText}](${telegramUrl})`;
      } catch (error) {
        // Если произошла ошибка, выбрасываем её для обработки на верхнем уровне
        throw new Error(`Failed to convert link ${match}: ${error.message}`);
      }
    });
  }


}