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
    console.log('🔄 MarkdownToTelegramConverter.convert() started');
    console.log('📝 Input markdown length:', markdown.length);
    console.log('⚙️ Options:', JSON.stringify(options, null, 2));
    
    const opts = { ...this.defaultOptions, ...options };
    console.log('⚙️ Merged options:', JSON.stringify(opts, null, 2));
    
    let text = markdown;
    let entities: TelegramMessageEntity[] = [];

    console.log('📋 Original text preview (first 200 chars):', text.substring(0, 200));

    // Step 1: Remove frontmatter
    if (opts.removeFrontmatter) {
      console.log('🗂️ Step 1: Removing frontmatter...');
      const beforeFrontmatter = text.length;
      text = this.removeFrontmatter(text);
      console.log(`✂️ Frontmatter removal: ${beforeFrontmatter} -> ${text.length} chars`);
      if (beforeFrontmatter !== text.length) {
        console.log('📋 Text after frontmatter removal (first 200 chars):', text.substring(0, 200));
      }
    }

    // Step 2: Remove H1 headers
    if (opts.removeH1Headers) {
      console.log('📰 Step 2: Removing H1 headers...');
      const beforeH1 = text.length;
      text = this.removeH1Headers(text);
      console.log(`✂️ H1 headers removal: ${beforeH1} -> ${text.length} chars`);
      if (beforeH1 !== text.length) {
        console.log('📋 Text after H1 removal (first 200 chars):', text.substring(0, 200));
      }
    }

    // Step 3: Convert markdown formatting to Telegram MarkdownV2
    console.log('🔄 Step 3: Converting markdown to Telegram format...');
    const beforeConversion = text.length;
    const conversionResult = this.convertMarkdownToTelegram(text, opts);
    text = conversionResult.text;
    entities = conversionResult.entities;
    console.log(`🔄 Markdown conversion: ${beforeConversion} -> ${text.length} chars`);
    console.log('📊 Generated entities count:', entities.length);
    console.log('📊 Entities:', entities.map(e => `${e.type}[${e.offset}:${e.offset + e.length}]`).join(', '));
    console.log('📋 Text after conversion (first 200 chars):', text.substring(0, 200));

    // Step 4: Handle length limits
    const originalLength = text.length;
    let truncated = false;
    console.log('📏 Step 4: Checking length limits...');
    console.log(`📏 Text length: ${text.length}, Max length: ${opts.maxLength}`);
    
    if (opts.maxLength && text.length > opts.maxLength) {
      console.log('✂️ Text exceeds limit, truncating...');
      const beforeTruncation = text.length;
      const entitiesBeforeTruncation = entities.length;
      
      text = this.truncateText(text, opts.maxLength);
      truncated = true;
      
      // Recalculate entities for truncated text
      entities = entities.filter(entity => 
        entity.offset + entity.length <= text.length
      );
      
      console.log(`✂️ Truncation: ${beforeTruncation} -> ${text.length} chars`);
      console.log(`📊 Entities after truncation: ${entitiesBeforeTruncation} -> ${entities.length}`);
      console.log('📋 Final truncated text (first 200 chars):', text.substring(0, 200));
    }

    const finalText = text.trim();
    const result = {
      text: finalText,
      entities,
      truncated,
      originalLength,
    };

    console.log('✅ Conversion completed');
    console.log('📊 Final result stats:');
    console.log(`  - Text length: ${finalText.length}`);
    console.log(`  - Entities: ${entities.length}`);
    console.log(`  - Truncated: ${truncated}`);
    console.log(`  - Original length: ${originalLength}`);
    console.log('📋 Final text preview (first 200 chars):', finalText.substring(0, 200));
    
    return result;
  }

  /**
   * Remove frontmatter from markdown content
   */
  private removeFrontmatter(content: string): string {
    console.log('🗂️ removeFrontmatter() called');
    console.log('📝 Input length:', content.length);
    
    // Remove YAML frontmatter (between --- markers)
    const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n?/;
    const match = content.match(frontmatterRegex);
    
    if (match) {
      console.log('✂️ Found frontmatter:', match[0].substring(0, 100) + (match[0].length > 100 ? '...' : ''));
      console.log('✂️ Frontmatter length:', match[0].length);
    } else {
      console.log('❌ No frontmatter found');
    }
    
    const result = content.replace(frontmatterRegex, '');
    console.log('📝 Output length:', result.length);
    
    return result;
  }

  /**
   * Remove H1 headers from markdown content
   */
  private removeH1Headers(content: string): string {
    console.log('📰 removeH1Headers() called');
    console.log('📝 Input length:', content.length);
    
    // Remove # headers at the beginning of lines
    const h1Regex = /^# .+$/gm;
    const matches = content.match(h1Regex);
    
    if (matches) {
      console.log('✂️ Found H1 headers:', matches.length);
      matches.forEach((header, index) => {
        console.log(`  📍 H1 ${index + 1}: "${header}"`);
      });
    } else {
      console.log('❌ No H1 headers found');
    }
    
    const result = content.replace(h1Regex, '');
    console.log('📝 Output length:', result.length);
    
    return result;
  }

  /**
   * Convert markdown formatting to Telegram MarkdownV2
   */
  private convertMarkdownToTelegram(
    content: string, 
    options: ConversionOptions
  ): { text: string; entities: TelegramMessageEntity[] } {
    console.log('🔧 convertMarkdownToTelegram() started');
    console.log('📝 Input content length:', content.length);
    console.log('📝 Input content preview:', content.substring(0, 100));
    
    let text = content;
    const entities: TelegramMessageEntity[] = [];

    // Track offset changes during processing
    let offsetDelta = 0;
    console.log('📊 Starting conversion with offsetDelta:', offsetDelta);

    // Convert bold **text** or __text__ to *text*
    console.log('🔲 Processing bold formatting (**text**)...');
    let boldMatches = 0;
    text = text.replace(/\*\*(.*?)\*\*/g, (match, content, offset) => {
      boldMatches++;
      const adjustedOffset = offset - offsetDelta;
      console.log(`  📍 Bold match ${boldMatches}: "${content}" at offset ${offset} (adjusted: ${adjustedOffset})`);
      entities.push({
        type: 'bold',
        offset: adjustedOffset,
        length: content.length,
      });
      offsetDelta += 2; // Removed 2 asterisks, added 0
      console.log(`  📊 Updated offsetDelta: ${offsetDelta}`);
      return content;
    });
    console.log(`✅ Bold (**) processing complete: ${boldMatches} matches`);

    console.log('🔳 Processing bold formatting (__text__)...');
    let underscoreBoldMatches = 0;
    text = text.replace(/__(.*?)__/g, (match, content, offset) => {
      underscoreBoldMatches++;
      const adjustedOffset = offset - offsetDelta;
      console.log(`  📍 Underscore bold match ${underscoreBoldMatches}: "${content}" at offset ${offset} (adjusted: ${adjustedOffset})`);
      entities.push({
        type: 'bold',
        offset: adjustedOffset,
        length: content.length,
      });
      offsetDelta += 4; // Removed 4 underscores, added 0
      console.log(`  📊 Updated offsetDelta: ${offsetDelta}`);
      return content;
    });
    console.log(`✅ Bold (__) processing complete: ${underscoreBoldMatches} matches`);

    // Convert italic *text* or _text_ to _text_ (Telegram uses underscores for italic)
    console.log('🔺 Processing italic formatting (*text*)...');
    let italicMatches = 0;
    text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, (match, content, offset) => {
      italicMatches++;
      const adjustedOffset = offset - offsetDelta;
      console.log(`  📍 Italic match ${italicMatches}: "${content}" at offset ${offset} (adjusted: ${adjustedOffset})`);
      entities.push({
        type: 'italic',
        offset: adjustedOffset,
        length: content.length,
      });
      offsetDelta += 2; // Removed 2 asterisks, added 0
      console.log(`  📊 Updated offsetDelta: ${offsetDelta}`);
      return content;
    });
    console.log(`✅ Italic (*) processing complete: ${italicMatches} matches`);

    console.log('🔻 Processing italic formatting (_text_)...');
    let underscoreItalicMatches = 0;
    text = text.replace(/(?<!_)_([^_]+?)_(?!_)/g, (match, content, offset) => {
      underscoreItalicMatches++;
      const adjustedOffset = offset - offsetDelta;
      console.log(`  📍 Underscore italic match ${underscoreItalicMatches}: "${content}" at offset ${offset} (adjusted: ${adjustedOffset})`);
      entities.push({
        type: 'italic',
        offset: adjustedOffset,
        length: content.length,
      });
      offsetDelta += 2; // Removed 2 underscores, added 0
      console.log(`  📊 Updated offsetDelta: ${offsetDelta}`);
      return content;
    });
    console.log(`✅ Italic (_) processing complete: ${underscoreItalicMatches} matches`);

    // Convert code `code` to code (Telegram uses entities for formatting)
    console.log('💻 Processing inline code formatting (`code`)...');
    let codeMatches = 0;
    text = text.replace(/`([^`]+?)`/g, (match, content, offset) => {
      codeMatches++;
      const adjustedOffset = offset - offsetDelta;
      console.log(`  📍 Code match ${codeMatches}: "${content}" at offset ${offset} (adjusted: ${adjustedOffset})`);
      entities.push({
        type: 'code',
        offset: adjustedOffset,
        length: content.length,
      });
      offsetDelta += 2; // Removed 2 backticks, added 0
      console.log(`  📊 Updated offsetDelta: ${offsetDelta}`);
      return content;
    });
    console.log(`✅ Inline code processing complete: ${codeMatches} matches`);

    // Convert code blocks ```lang\ncode\n``` to code (preserve if option is set)
    console.log('📦 Processing code blocks...');
    console.log('📦 preserveCodeBlocks option:', options.preserveCodeBlocks);
    let codeBlockMatches = 0;
    if (options.preserveCodeBlocks) {
      text = text.replace(/```(\w+)?\n([\s\S]*?)\n```/g, (match, lang, content, offset) => {
        codeBlockMatches++;
        const adjustedOffset = offset - offsetDelta;
        console.log(`  📍 Code block match ${codeBlockMatches}: lang="${lang || 'none'}", content length=${content.length} at offset ${offset} (adjusted: ${adjustedOffset})`);
        entities.push({
          type: 'pre',
          offset: adjustedOffset,
          length: content.length,
          language: lang || 'text',
        });
        const originalLength = match.length;
        const newLength = content.length;
        offsetDelta += originalLength - newLength;
        console.log(`  📊 Code block offset change: ${originalLength} -> ${newLength}, offsetDelta: ${offsetDelta}`);
        return content;
      });
    } else {
      // Just remove code block markers
      text = text.replace(/```(\w+)?\n([\s\S]*?)\n```/g, (match, lang, content) => {
        codeBlockMatches++;
        console.log(`  📍 Code block match ${codeBlockMatches} (markers removed): lang="${lang || 'none'}", content length=${content.length}`);
        return content;
      });
    }
    console.log(`✅ Code blocks processing complete: ${codeBlockMatches} matches`);

    // Convert links [text](url) to text with url entity
    console.log('🔗 Processing links...');
    console.log('🔗 preserveLinks option:', options.preserveLinks);
    let linkMatches = 0;
    if (options.preserveLinks) {
      text = text.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (match, linkText, url, offset) => {
        linkMatches++;
        const adjustedOffset = offset - offsetDelta;
        console.log(`  📍 Link match ${linkMatches}: text="${linkText}", url="${url}" at offset ${offset} (adjusted: ${adjustedOffset})`);
        entities.push({
          type: 'text_link',
          offset: adjustedOffset,
          length: linkText.length,
          url: url,
        });
        const originalLength = match.length;
        const newLength = linkText.length;
        offsetDelta += originalLength - newLength;
        console.log(`  📊 Link offset change: ${originalLength} -> ${newLength}, offsetDelta: ${offsetDelta}`);
        return linkText;
      });
    } else {
      // Just keep the link text
      text = text.replace(/\[([^\]]+?)\]\([^)]+?\)/g, (match, linkText) => {
        linkMatches++;
        console.log(`  📍 Link match ${linkMatches} (text only): "${linkText}"`);
        return linkText;
      });
    }
    console.log(`✅ Links processing complete: ${linkMatches} matches`);

    // Convert strikethrough ~~text~~ to text with strikethrough entity
    console.log('🚫 Processing strikethrough formatting (~~text~~)...');
    let strikethroughMatches = 0;
    text = text.replace(/~~(.*?)~~/g, (match, content, offset) => {
      strikethroughMatches++;
      const adjustedOffset = offset - offsetDelta;
      console.log(`  📍 Strikethrough match ${strikethroughMatches}: "${content}" at offset ${offset} (adjusted: ${adjustedOffset})`);
      entities.push({
        type: 'strikethrough',
        offset: adjustedOffset,
        length: content.length,
      });
      offsetDelta += 4; // Removed 4 tildes, added 0
      console.log(`  📊 Updated offsetDelta: ${offsetDelta}`);
      return content;
    });
    console.log(`✅ Strikethrough processing complete: ${strikethroughMatches} matches`);

    // Convert headers (h2-h6) to bold text
    console.log('📰 Processing headers (h2-h6)...');
    let headerMatches = 0;
    text = text.replace(/^#{2,6} (.+)$/gm, (match, headerText) => {
      headerMatches++;
      console.log(`  📍 Header match ${headerMatches}: "${headerText}"`);
      return `*${headerText}*`;
    });
    console.log(`✅ Headers processing complete: ${headerMatches} matches`);

    // Clean up extra whitespace and newlines
    console.log('🧹 Cleaning up whitespace...');
    const beforeCleanup = text.length;
    text = text.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
    text = text.replace(/^\s+|\s+$/g, ''); // Trim start and end
    console.log(`🧹 Cleanup: ${beforeCleanup} -> ${text.length} chars`);

    // Sort entities by offset
    console.log('📊 Sorting entities...');
    console.log('📊 Entities before sorting:', entities.map(e => `${e.type}[${e.offset}:${e.offset + e.length}]`).join(', '));
    entities.sort((a, b) => a.offset - b.offset);
    console.log('📊 Entities after sorting:', entities.map(e => `${e.type}[${e.offset}:${e.offset + e.length}]`).join(', '));

    console.log('✅ convertMarkdownToTelegram() completed');
    console.log('📊 Final stats:');
    console.log(`  - Text length: ${text.length}`);
    console.log(`  - Entities count: ${entities.length}`);
    console.log(`  - Final offsetDelta: ${offsetDelta}`);

    return { text, entities };
  }

  /**
   * Truncate text while preserving word boundaries
   */
  private truncateText(text: string, maxLength: number): string {
    console.log('✂️ truncateText() called');
    console.log('📏 Input length:', text.length);
    console.log('📏 Max length:', maxLength);
    
    if (text.length <= maxLength) {
      console.log('✅ Text within limit, no truncation needed');
      return text;
    }

    // Try to truncate at word boundary
    const truncated = text.substring(0, maxLength);
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    const wordBoundaryThreshold = maxLength * 0.8;
    
    console.log('📍 Last space index:', lastSpaceIndex);
    console.log('📍 Word boundary threshold (80%):', wordBoundaryThreshold);
    
    if (lastSpaceIndex > wordBoundaryThreshold) {
      // If we found a space in the last 20% of the text, truncate there
      const result = truncated.substring(0, lastSpaceIndex) + '...';
      console.log('✂️ Truncated at word boundary, result length:', result.length);
      return result;
    } else {
      // Otherwise just truncate at the limit
      const result = truncated + '...';
      console.log('✂️ Truncated at character limit, result length:', result.length);
      return result;
    }
  }

  /**
   * Escape special characters for Telegram MarkdownV2
   */
  private escapeMarkdownV2(text: string): string {
    // Characters that need to be escaped in MarkdownV2
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    
    let escaped = text;
    specialChars.forEach(char => {
      escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
    });
    
    return escaped;
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
