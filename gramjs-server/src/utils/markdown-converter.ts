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
 * Simplified markdown converter
 * TODO: Replace with actual import from modules/telegram when build system allows
 */
class MarkdownConverter {
  convert(markdown: string): ConversionResult {
    let text = markdown;
    
    // Remove frontmatter
    text = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
    
    // Remove H1 headers
    text = text.replace(/^# .+$/gm, '');
    
    // Track entities and offset changes
    const entities: any[] = [];
    let offsetDelta = 0;
    
    // Bold text **text** or __text__ -> text with bold entity
    text = text.replace(/\*\*(.*?)\*\*/g, (match, content, offset) => {
      entities.push({
        type: 'bold',
        offset: offset - offsetDelta,
        length: content.length,
      });
      offsetDelta += 4; // removed ** **
      return content;
    });
    
    text = text.replace(/__(.*?)__/g, (match, content, offset) => {
      entities.push({
        type: 'bold',
        offset: offset - offsetDelta,
        length: content.length,
      });
      offsetDelta += 4; // removed __ __
      return content;
    });
    
    // Italic *text* or _text_ -> text with italic entity
    text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, (match, content, offset) => {
      entities.push({
        type: 'italic',
        offset: offset - offsetDelta,
        length: content.length,
      });
      offsetDelta += 2; // removed * *
      return content;
    });
    
    text = text.replace(/(?<!_)_([^_]+?)_(?!_)/g, (match, content, offset) => {
      entities.push({
        type: 'italic',
        offset: offset - offsetDelta,
        length: content.length,
      });
      offsetDelta += 2; // removed _ _
      return content;
    });
    
    // Code `code` -> code with code entity
    text = text.replace(/`([^`]+?)`/g, (match, content, offset) => {
      entities.push({
        type: 'code',
        offset: offset - offsetDelta,
        length: content.length,
      });
      offsetDelta += 2; // removed ` `
      return content;
    });
    
    // Code blocks ```lang\ncode\n``` -> code with pre entity
    text = text.replace(/```(\w+)?\n([\s\S]*?)\n```/g, (match, lang, content, offset) => {
      entities.push({
        type: 'pre',
        offset: offset - offsetDelta,
        length: content.length,
        language: lang || 'text',
      });
      const originalLength = match.length;
      const newLength = content.length;
      offsetDelta += originalLength - newLength;
      return content;
    });
    
    // Links [text](url) -> text with text_link entity
    text = text.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (match, linkText, url, offset) => {
      entities.push({
        type: 'text_link',
        offset: offset - offsetDelta,
        length: linkText.length,
        url: url,
      });
      const originalLength = match.length;
      const newLength = linkText.length;
      offsetDelta += originalLength - newLength;
      return linkText;
    });
    
    // Strikethrough ~~text~~ -> text with strikethrough entity
    text = text.replace(/~~(.*?)~~/g, (match, content, offset) => {
      entities.push({
        type: 'strikethrough',
        offset: offset - offsetDelta,
        length: content.length,
      });
      offsetDelta += 4; // removed ~~ ~~
      return content;
    });
    
    // Convert headers (h2-h6) to bold text
    text = text.replace(/^#{2,6} (.+)$/gm, (match, headerText) => {
      return `**${headerText}**`;
    });
    
    // Clean up extra whitespace and newlines
    text = text.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
    text = text.trim();
    
    // Sort entities by offset
    entities.sort((a, b) => a.offset - b.offset);
    
    return {
      text,
      entities,
      truncated: false,
      originalLength: markdown.length
    };
  }
}

// Singleton instance
const converter = new MarkdownConverter();

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
  markdownContent?: string;
  fileName?: string;
  entities?: any[];
  buttons?: any[];
  disableWebPagePreview?: boolean;
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
    fileName, 
    entities, 
    buttons, 
    disableWebPagePreview 
  } = options;

  let finalMessage = message || '';
  let finalEntities: Api.TypeMessageEntity[] = [];
  let conversionInfo: any = undefined;

  // If markdownContent is provided, convert it
  if (message) {
    const conversionResult = converter.convert(message);
    
    // Add fileName header if provided
    if (fileName) {
      const header = `📝 *${fileName}*\n\n`;
      finalMessage = header + conversionResult.text;
      
      // Adjust entity offsets and add bold for filename
      const adjustedEntities = conversionResult.entities?.map(entity => ({
        ...entity,
        offset: entity.offset + header.length
      })) || [];
      
      // Add bold entity for filename
      adjustedEntities.unshift({
        type: 'bold',
        offset: 3, // After "📝 "
        length: fileName.length
      });
      
      finalEntities = convertToGramJSEntities(adjustedEntities);
    } else {
      finalMessage = conversionResult.text;
      finalEntities = convertToGramJSEntities(conversionResult.entities);
    }
    
    // Validate message length
    if (finalMessage.length > 4096) {
      throw new Error(`Message too long: ${finalMessage.length} characters (max 4096)`);
    }
    
    conversionInfo = {
      hasMarkdown: true,
      finalLength: finalMessage.length,
      entitiesCount: finalEntities.length
    };
  }
  // Handle legacy entities (custom emoji)
  else if (entities && entities.length > 0) {
    finalEntities = entities.map((entity: any) => new Api.MessageEntityCustomEmoji({
      offset: entity.offset,
      length: entity.length,
      documentId: entity.custom_emoji_id,
    }));
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
  params: { peer?: string; messageId?: number; message?: string; markdownContent?: string }
): void {
  const { peer, messageId, message, markdownContent } = params;
  
  if (!peer) {
    throw new Error('peer is required');
  }
  
  if (operation === 'edit' && !messageId) {
    throw new Error('messageId is required for edit operation');
  }
  
  if (!message && !markdownContent) {
    throw new Error('either message or markdownContent is required');
  }
}
