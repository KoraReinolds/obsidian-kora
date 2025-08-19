/**
 * Shared markdown to Telegram converter for GramJS routes
 * Contains unified logic for both send_message and edit_message
 */

import { Api } from 'telegram';

// TODO: Import from actual module when building system is configured
// import { markdownToTelegramConverter } from '../../../modules/telegram/index.js';

export interface ConversionResult {
  text: string;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
    url?: string;
    language?: string;
    custom_emoji_id?: string;
  }>;
  truncated?: boolean;
  originalLength?: number;
}

/**
 * Convert entities to GramJS format
 */
export function convertToGramJSEntities(entities: any[] = []): Api.TypeMessageEntity[] {
  return entities.map(entity => {
    switch (entity.type) {
      case 'bold':
        return new Api.MessageEntityBold({
          offset: entity.offset,
          length: entity.length,
        });
      case 'italic':
        return new Api.MessageEntityItalic({
          offset: entity.offset,
          length: entity.length,
        });
      case 'code':
        return new Api.MessageEntityCode({
          offset: entity.offset,
          length: entity.length,
        });
      case 'pre':
        return new Api.MessageEntityPre({
          offset: entity.offset,
          length: entity.length,
          language: entity.language || '',
        });
      case 'text_link':
        return new Api.MessageEntityTextUrl({
          offset: entity.offset,
          length: entity.length,
          url: entity.url || '',
        });
      case 'strikethrough':
        return new Api.MessageEntityStrike({
          offset: entity.offset,
          length: entity.length,
        });
      case 'custom_emoji':
        return new Api.MessageEntityCustomEmoji({
          offset: entity.offset,
          length: entity.length,
          documentId: entity.custom_emoji_id,
        });
      default:
        // Fallback for unknown entity types
        return new Api.MessageEntityCode({
          offset: entity.offset,
          length: entity.length,
        });
    }
  });
}

/**
 * Process message content - handles both regular messages and markdown conversion
 */
export interface MessageProcessingOptions {
  peer: string;
  message?: string;
  fileName?: string;
  entities?: any[];
  buttons?: any[];
  disableWebPagePreview?: boolean;
  mode: string;
}

export interface ProcessedMessage {
  finalMessage: string;
  finalEntities: Api.TypeMessageEntity[];
  replyMarkup?: any;
  disableWebPagePreview?: boolean;
  conversionInfo?: {
    hasMarkdown: boolean;
    finalLength: number;
    entitiesCount: number;
  };
}

/**
 * Unified message processing logic for both send and edit operations
 */
export function processMessage(options: MessageProcessingOptions): ProcessedMessage {
  const { 
    message, 
    entities, 
    buttons, 
    disableWebPagePreview,
    mode
  } = options;

  let finalMessage = message || '';
  let finalEntities: Api.TypeMessageEntity[] = [];
  let conversionInfo: any = undefined;

  if (message) { 
    // Validate message length
    if (finalMessage.length > 4096) {
      throw new Error(`Message too long: ${finalMessage.length} characters (max 4096)`);
    }
    
    conversionInfo = {
      hasMarkdown: true,
      finalLength: finalMessage.length,
      entitiesCount: 0 // Will be updated below when entities are processed
    };
  }
  
  // Always process entities if they exist (regardless of message presence)
  if (entities && entities.length > 0) {
    if (mode === 'bot') {
      finalEntities = entities;
    } else if (mode === 'userbot') {
      finalEntities = convertToGramJSEntities(entities);
    }
    
    // Update entities count in conversionInfo if it exists
    if (conversionInfo) {
      conversionInfo.entitiesCount = finalEntities.length;
    }
  }

  // Handle inline buttons
  let replyMarkup: any = undefined;
  if (buttons && buttons.length > 0) {
    replyMarkup = {
      inline_keyboard: buttons.map((row: any) => row.map((btn: any) => ({
        text: btn.text,
        ...(btn.url ? { url: btn.url } : {}),
        ...(btn.data ? { callback_data: btn.data } : {}),
      }))),
    };
  }

  return {
    finalMessage,
    finalEntities,
    replyMarkup,
    disableWebPagePreview,
    conversionInfo
  };
}

/**
 * Validate required parameters for message operations
 */
export function validateMessageParams(
  operation: 'send' | 'edit',
  params: { peer?: string; messageId?: number; message?: string }
): void {
  const { peer, messageId, message } = params;
  
  if (!peer) {
    throw new Error('peer is required');
  }
  
  if (operation === 'edit' && !messageId) {
    throw new Error('messageId is required for edit operation');
  }
  
  if (!message) {
    throw new Error('message is required');
  }
}
