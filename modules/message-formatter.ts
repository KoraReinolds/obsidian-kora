/**
 * Utilities for formatting messages for different platforms
 */

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

  constructor(customEmojis: EmojiMapping[] = [], useCustomEmojis = false) {
    this.customEmojis = customEmojis;
    this.useCustomEmojis = useCustomEmojis;
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
}