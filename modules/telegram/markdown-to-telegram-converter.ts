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

    // Step 2: Process blockquotes first (before other patterns to avoid conflicts)
    const blockquoteResult = this.processBlockquotes(text, []);
    text = blockquoteResult.text;
    entities.push(...blockquoteResult.entities);

    // Step 3: Process remaining markdown patterns (now code blocks and blockquotes are protected)
    const patterns = [
      { regex: /\*\*(.*?)\*\*/g, type: 'bold', removedChars: 4 },
      { regex: /__(.*?)__/g, type: 'bold', removedChars: 4 },
      { regex: /(?<!\*)\*([^*]+?)\*(?!\*)/g, type: 'italic', removedChars: 2 },
      { regex: /(?<!_)_([^_]+?)_(?!_)/g, type: 'italic', removedChars: 2 },
      { regex: /`([^`]+?)`/g, type: 'code', removedChars: 2 },
      { regex: /~~(.*?)~~/g, type: 'strikethrough', removedChars: 4 },
      { regex: /\[([^\]]+?)\](?!\()/g, type: 'spoiler', removedChars: 2 },
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
      console.log(`🔧 ${match.type}: "${match.match}" at offset ${match.start}, delta ${offsetDelta}, adjusted ${adjustedOffset}, content: "${match.content}"`);
      
      entities.push({
        type: match.type,
        offset: adjustedOffset,
        length: match.content.length,
      });
      
      offsetDelta += match.removedChars;
      console.log(`   New offsetDelta: ${offsetDelta}`);
    }

    // Apply all replacements in one pass (from end to start to avoid offset issues)
    const sortedMatches = [...matches].sort((a, b) => b.start - a.start);
    console.log(`📝 Text before replacements: "${text}"`);
    for (const match of sortedMatches) {
      const before = text;
      text = text.slice(0, match.start) + match.content + text.slice(match.end);
      console.log(`   Replaced "${match.match}" → "${match.content}" at ${match.start}: "${before}" → "${text}"`);
    }
    console.log(`📝 Text after replacements: "${text}"`)

    // Step 3: Restore code blocks and calculate their positions
    // Process in order of appearance to correctly adjust offsets
    const sortedCodeBlocks = codeBlockPlaceholders.sort((a, b) => {
      const aIndex = text.indexOf(a.placeholder);
      const bIndex = text.indexOf(b.placeholder);
      return aIndex - bIndex;
    });

    for (const codeBlock of sortedCodeBlocks) {
      const placeholderIndex = text.indexOf(codeBlock.placeholder);
      if (placeholderIndex !== -1) {
        const placeholderLength = codeBlock.placeholder.length;
        const contentLength = codeBlock.content.length;
        const lengthDelta = contentLength - placeholderLength;
        
        console.log(`🔧 Restoring code block at position ${placeholderIndex}, placeholder "${codeBlock.placeholder}" → content length ${contentLength}, delta: ${lengthDelta}`);
        
        // Replace placeholder with actual content
        text = text.replace(codeBlock.placeholder, codeBlock.content);
        
        // Adjust offset of all entities that come after this placeholder
        entities.forEach(entity => {
          if (entity.offset > placeholderIndex) {
            const oldOffset = entity.offset;
            entity.offset += lengthDelta;
            console.log(`   Adjusted entity ${entity.type} offset: ${oldOffset} → ${entity.offset}`);
          }
        });
        
        // Add entity if preserving code blocks
        if (codeBlock.entity) {
          codeBlock.entity.offset = placeholderIndex;
          entities.push(codeBlock.entity);
        }
      }
    }

    // Step 4: Process links (they can contain other formatting)
    // We need to collect all link matches first, then process them from end to start
    const linkMatches: Array<{
      match: string;
      linkText: string;
      url?: string;
      start: number;
      end: number;
      lengthDelta: number;
    }> = [];

    // Find all link matches
    if (options.preserveLinks) {
      const linkRegex = /\[([^\]]+?)\]\(([^)]+?)\)/g;
      let match;
      while ((match = linkRegex.exec(text)) !== null) {
        linkMatches.push({
          match: match[0],
          linkText: match[1],
          url: match[2],
          start: match.index,
          end: match.index + match[0].length,
          lengthDelta: match[0].length - match[1].length
        });
      }
    } else {
      const linkRegex = /\[([^\]]+?)\]\([^)]+?\)/g;
      let match;
      while ((match = linkRegex.exec(text)) !== null) {
        linkMatches.push({
          match: match[0],
          linkText: match[1],
          start: match.index,
          end: match.index + match[0].length,
          lengthDelta: match[0].length - match[1].length
        });
      }
    }

    // Process links from end to start to avoid offset issues
    const sortedLinkMatches = linkMatches.sort((a, b) => b.start - a.start);
    for (const linkMatch of sortedLinkMatches) {
      console.log(`🔗 Processing link "${linkMatch.match}" at offset ${linkMatch.start}`);
      
      // Replace link with just the text
      text = text.slice(0, linkMatch.start) + linkMatch.linkText + text.slice(linkMatch.end);
      
      // Add entity if preserving links
      if (options.preserveLinks && linkMatch.url) {
        entities.push({
          type: 'text_link',
          offset: linkMatch.start,
          length: linkMatch.linkText.length,
          url: linkMatch.url,
        });
      }
      
      // Adjust offset of entities that come after this link
      entities.forEach(entity => {
        if (entity.offset > linkMatch.start && entity.type !== 'text_link') {
          const oldOffset = entity.offset;
          entity.offset -= linkMatch.lengthDelta;
          console.log(`   Adjusted entity ${entity.type} offset after link: ${oldOffset} → ${entity.offset}`);
        }
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
   * Process blockquotes (both regular and expandable)
   * Groups consecutive blockquote lines into single blocks
   */
  private processBlockquotes(text: string, currentEntities: TelegramMessageEntity[]): { text: string; entities: TelegramMessageEntity[] } {
    const newEntities: TelegramMessageEntity[] = [];
    const lines = text.split('\n');
    const processedLines: string[] = [];
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      // Check if this line starts a blockquote block
      const expandableMatch = line.match(/^>\[!\s*[^\]]*\](-?)\s*(.*)$/);
      const regularMatch = line.match(/^>\s*(.+)$/);
      
      if (expandableMatch) {
        // Process expandable blockquote block
        const isCollapsed = expandableMatch[1] === '-';
        const firstLineContent = expandableMatch[2];
        const blockStartOffset = processedLines.join('\n').length + (processedLines.length > 0 ? 1 : 0);
        
        // Collect all content lines for this blockquote
        const contentLines: string[] = [];
        if (firstLineContent.trim()) {
          contentLines.push(firstLineContent);
        }
        
        // Look for following blockquote lines
        let j = i + 1;
        while (j < lines.length && lines[j].match(/^>\s*(.*)$/)) {
          const nextMatch = lines[j].match(/^>\s*(.*)$/);
          if (nextMatch) {
            contentLines.push(nextMatch[1]);
          }
          j++;
        }
        
        const blockContent = contentLines.join('\n');
        console.log(`🔧 Expandable blockquote (${isCollapsed ? 'collapsed' : 'expanded'}): content="${blockContent}" at offset ${blockStartOffset}`);
        
        // Add the content to processed lines
        processedLines.push(blockContent);
        
        // Add entity
        newEntities.push({
          type: isCollapsed ? 'expandable_blockquote' : 'blockquote',
          offset: blockStartOffset,
          length: blockContent.length,
        });
        
        // Skip all processed lines
        i = j;
        
      } else if (regularMatch && !expandableMatch) {
        // Process regular blockquote block
        const blockStartOffset = processedLines.join('\n').length + (processedLines.length > 0 ? 1 : 0);
        
        // Collect all content lines for this blockquote
        const contentLines: string[] = [];
        let j = i;
        while (j < lines.length && lines[j].match(/^>\s*(.*)$/)) {
          const match = lines[j].match(/^>\s*(.*)$/);
          if (match) {
            contentLines.push(match[1]);
          }
          j++;
        }
        
        const blockContent = contentLines.join('\n');
        console.log(`🔧 Regular blockquote: content="${blockContent}" at offset ${blockStartOffset}`);
        
        // Add the content to processed lines
        processedLines.push(blockContent);
        
        // Add entity
        newEntities.push({
          type: 'blockquote',
          offset: blockStartOffset,
          length: blockContent.length,
        });
        
        // Skip all processed lines
        i = j;
        
      } else {
        // Regular line, keep as is
        processedLines.push(line);
        i++;
      }
    }

    return { text: processedLines.join('\n'), entities: newEntities };
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
