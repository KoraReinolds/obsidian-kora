/**
 * Types: Shared HTTP request options and Telegram message/file options.
 * Everything here is strictly related to API shape and reused by routes.
 */

export interface MessageEntityEmoji {
  offset: number;
  length: number;
  custom_emoji_id: string;
}

/**
 * JSDoc: Options for sending a message through Telegram strategies.
 */
export interface MessageOptions {
  message?: string;
  entities?: MessageEntityEmoji[];
  buttons?: Array<Array<{ text: string; url?: string; data?: string }>>;
  parseMode?: string;
  replyMarkup?: any;
  formattingEntities?: any[];
  [key: string]: any;
}

/**
 * JSDoc: Options for sending a file through Telegram strategies.
 */
export interface FileOptions {
  file: string;
  caption?: string;
  buttons?: Array<Array<{ text: string; url?: string; data?: string }>>;
  parseMode?: string;
  replyMarkup?: any;
  [key: string]: any;
}
