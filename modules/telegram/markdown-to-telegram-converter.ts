/**
 * Markdown to Telegram format converter
 * Converts Obsidian markdown notes to Telegram-compatible format
 */

export interface ConversionOptions {
  removeFrontmatter?: boolean;
  removeH1Headers?: boolean;
  maxLength?: number;
  preserveCodeBlocks?: boolean;
  preserveLinks?: boolean;
}

export interface ConversionResult {
  text: string;
  entities?: TelegramMessageEntity[];
  truncated?: boolean;
  originalLength?: number;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
}

export class MarkdownToTelegramConverter {
  private readonly defaultOptions: ConversionOptions = {
    removeFrontmatter: true,
    removeH1Headers: true,
    maxLength: 4096, // Telegram message limit
    preserveCodeBlocks: true,
    preserveLinks: true,
  };

  /**
   * Convert markdown content to Telegram format
   */
  convert(markdown: string, options: ConversionOptions = {}): ConversionResult {
    const opts = { ...this.defaultOptions, ...options };
    
    let text = markdown
    let entities: TelegramMessageEntity[] = [];

    // Step 1: Remove frontmatter
    if (opts.removeFrontmatter) {
      text = this.removeFrontmatter(text);
    }

    // Step 2: Remove H1 headers
    if (opts.removeH1Headers) {
      text = this.removeH1Headers(text);
    }

    // Step 3: Convert markdown formatting to Telegram MarkdownV2
    const conversionResult = this.convertMarkdownToTelegram(text, opts);
    text = conversionResult.text;
    entities = conversionResult.entities;

    // Step 4: Handle length limits
    const originalLength = text.length;
    let truncated = false;
    
    if (opts.maxLength && text.length > opts.maxLength) {
      const beforeTruncation = text.length;
      const entitiesBeforeTruncation = entities.length;
      
      text = this.truncateText(text, opts.maxLength);
      truncated = true;
      
      // Recalculate entities for truncated text
      entities = entities.filter(entity => 
        entity.offset + entity.length <= text.length
      );
    }

    const finalText = text.trim();
    const result = {
      text: finalText,
      entities,
      truncated,
      originalLength,
    };

    return result;
  }

  /**
   * Remove frontmatter from markdown content
   */
  private removeFrontmatter(content: string): string {
    // Remove YAML frontmatter (between --- markers)
    const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n?/;
    const result = content.replace(frontmatterRegex, '');
    return result;
  }

  /**
   * Remove H1 headers from markdown content
   */
  private removeH1Headers(content: string): string {
    // Remove # headers at the beginning of lines
    const h1Regex = /^# .+$/gm;
    const result = content.replace(h1Regex, '');
    return result.trim();
  }

  /**
   * Convert markdown formatting to Telegram MarkdownV2
   */
  private convertMarkdownToTelegram(
    content: string, 
    options: ConversionOptions
  ): { text: string; entities: TelegramMessageEntity[] } {
    let text = content;
    const entities: TelegramMessageEntity[] = [];

    // Step 1: Process code blocks first and protect them from further processing
    const codeBlockPlaceholders: Array<{
      placeholder: string;
      content: string;
      language?: string;
      start: number;
      entity?: TelegramMessageEntity;
    }> = [];

    let placeholderIndex = 0;
    text = text.replace(/```(\w+)?\n([\s\S]*?)\n```/g, (match, lang, content, offset) => {
      const placeholder = `\x00CODEBLOCK${placeholderIndex++}\x00`;
      const language = lang || 'text';
      
      console.log(`🔧 Code block: "${match}" at offset ${offset} → placeholder ${placeholder}`);
      
      if (options.preserveCodeBlocks) {
        codeBlockPlaceholders.push({
          placeholder,
          content,
          language,
          start: offset,
          entity: {
            type: 'pre',
            offset: 0, // Will be calculated later
            length: content.length,
            language
          }
        });
      } else {
        codeBlockPlaceholders.push({
          placeholder,
          content,
          start: offset
        });
      }
      
      return placeholder;
    });

    // Step 2: Process remaining markdown patterns (now code blocks are protected)
    const patterns = [
      { regex: /\*\*(.*?)\*\*/g, type: 'bold', removedChars: 4 },
      { regex: /__(.*?)__/g, type: 'bold', removedChars: 4 },
      { regex: /(?<!\*)\*([^*]+?)\*(?!\*)/g, type: 'italic', removedChars: 2 },
      { regex: /(?<!_)_([^_]+?)_(?!_)/g, type: 'italic', removedChars: 2 },
      { regex: /`([^`]+?)`/g, type: 'code', removedChars: 2 },
      { regex: /~~(.*?)~~/g, type: 'strikethrough', removedChars: 4 },
    ];

    // Find all matches and sort by position
    const matches: Array<{
      type: string;
      content: string;
      start: number;
      end: number;
      removedChars: number;
      match: string;
      language?: string;
      url?: string;
    }> = [];

    patterns.forEach(pattern => {
      let match;
      const regex = new RegExp(pattern.regex);
      console.log(`🔍 Searching for pattern: ${pattern.type} - ${pattern.regex}`);
      while ((match = regex.exec(text)) !== null) {
        console.log(`   Found match: "${match[0]}" at [${match.index}:${match.index + match[0].length}]`);
        
        matches.push({
          type: pattern.type,
          content: match[1],
          start: match.index,
          end: match.index + match[0].length,
          removedChars: pattern.removedChars,
          match: match[0]
        });
      }
    });

    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);

    // Process matches in order and track offset changes
    let offsetDelta = 0;
    for (const match of matches) {
      const adjustedOffset = match.start - offsetDelta;
      console.log(`🔧 ${match.type}: "${match.match}" at offset ${match.start}, delta ${offsetDelta}, adjusted ${adjustedOffset}`);
      
      entities.push({
        type: match.type,
        offset: adjustedOffset,
        length: match.content.length,
      });
      
      offsetDelta += match.removedChars;
    }

    // Apply all replacements in one pass (from end to start to avoid offset issues)
    const sortedMatches = [...matches].sort((a, b) => b.start - a.start);
    for (const match of sortedMatches) {
      text = text.slice(0, match.start) + match.content + text.slice(match.end);
    }

    // Step 3: Restore code blocks and calculate their positions
    let currentOffset = 0;
    for (const codeBlock of codeBlockPlaceholders) {
      const placeholderIndex = text.indexOf(codeBlock.placeholder);
      if (placeholderIndex !== -1) {
        console.log(`🔧 Restoring code block at position ${placeholderIndex}`);
        
        // Replace placeholder with actual content
        text = text.replace(codeBlock.placeholder, codeBlock.content);
        
        // Add entity if preserving code blocks
        if (codeBlock.entity) {
          codeBlock.entity.offset = placeholderIndex;
          entities.push(codeBlock.entity);
        }
      }
    }

    // Step 4: Process links (they can contain other formatting)
    if (options.preserveLinks) {
      let linkOffsetDelta = 0;
      text = text.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (match, linkText, url, offset) => {
        const adjustedOffset = offset - linkOffsetDelta;
        entities.push({
          type: 'text_link',
          offset: adjustedOffset,
          length: linkText.length,
          url: url,
        });
        linkOffsetDelta += match.length - linkText.length;
        return linkText;
      });
    } else {
      // Just keep the link text
      text = text.replace(/\[([^\]]+?)\]\([^)]+?\)/g, (match, linkText) => {
        return linkText;
      });
    }

    // Convert headers (h2-h6) to bold text
    let headerMatches = 0;
    text = text.replace(/^#{2,6} (.+)$/gm, (match, headerText) => {
      return `*${headerText}*`;
    });

    // Clean up extra whitespace and newlines
    const beforeCleanup = text.length;
    text = text.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
    text = text.replace(/^\s+|\s+$/g, ''); // Trim start and end

    // Sort entities by offset
    entities.sort((a, b) => a.offset - b.offset);
    console.log('📊 Entities after sorting:', entities.map(e => `${e.type}[${e.offset}:${e.offset + e.length}]`).join(', '));

    return { text, entities };
  }

  /**
   * Truncate text while preserving word boundaries
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    // Try to truncate at word boundary
    const truncated = text.substring(0, maxLength);
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    const wordBoundaryThreshold = maxLength * 0.8;
    
    if (lastSpaceIndex > wordBoundaryThreshold) {
      // If we found a space in the last 20% of the text, truncate there
      const result = truncated.substring(0, lastSpaceIndex) + '...';
      return result;
    } else {
      // Otherwise just truncate at the limit
      const result = truncated + '...';
      return result;
    }
  }

  /**
   * Check if the text is suitable for Telegram
   */
  validateForTelegram(text: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (text.length > 4096) {
      issues.push(`Text too long: ${text.length} characters (max 4096)`);
    }
    
    if (text.trim().length === 0) {
      issues.push('Text is empty after conversion');
    }
    
    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

// Export singleton instance for convenience
export const markdownToTelegramConverter = new MarkdownToTelegramConverter();
