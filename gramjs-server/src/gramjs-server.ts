#!/usr/bin/env node

/**
 * Standalone GramJS server for Obsidian plugin
 * Runs as separate Node.js process to avoid Electron compatibility issues
 */

// Load environment variables from .env file FIRST
import { config as configDotenv } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
configDotenv({ path: join(__dirname, '..', '.env') });

import { v4 as uuidv4 } from 'uuid';
import { Api } from 'telegram';
import express, { type Request, type Response } from 'express';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import cors from 'cors';
import VectorService from './vector-service.js';
import StrategyFactory from './strategies/StrategyFactory.js';
import type { TelegramClientStrategy } from './strategies/TelegramClientStrategy.js';

const app = express();
const PORT = 8124; // Different from main plugin port

// Middleware
app.use(cors());
app.use(express.json());

interface ServerConfig {
  apiId: number;
  apiHash: string;
  stringSession: string;
  botToken: string;
  mode: 'bot' | 'userbot';
}

interface MessageOptions {
  message?: string;
  entities?: Array<{
    offset: number;
    length: number;
    custom_emoji_id: string;
  }>;
  buttons?: Array<Array<{
    text: string;
    url?: string;
    data?: string;
  }>>;
  parseMode?: string;
  replyMarkup?: any;
  formattingEntities?: any[];
  [key: string]: any;
}

interface FileOptions {
  file: string;
  caption?: string;
  buttons?: Array<Array<{
    text: string;
    url?: string;
    data?: string;
  }>>;
  parseMode?: string;
  replyMarkup?: any;
  [key: string]: any;
}

// Configuration (you'll need to set these)
const CONFIG: ServerConfig = {
  // Userbot configuration
  apiId: Number(process.env.TELEGRAM_API_ID) || 27782052, // Replace with your API ID
  apiHash: process.env.TELEGRAM_API_HASH || '68a4d2fd1466ab6faccfb81bd4b68255', // Replace with your API Hash
  stringSession: process.env.TELEGRAM_SESSION || '1AgAOMTQ5LjE1NC4xNjcuNDEBu12zMcMWPrgkH8lmy5vdKybpnoWFxGiwtvdXgCvXK7WFLyZB6LiT5vILrCFUDSnU0Ae9zXHPkBjBtGwuv5vCUIHCFc26j31/Kx25D0YyX21CGAXvMTi9kNZhlCakjo+BqgztIyVWs+2Je63WyTPp3893JoCjwUBcHx3l7NqR6JMYUzReE6P6C4nFnnjc8WP9QyKXC7kretLCKgacK+xzpFMcW35sMmemlmflB3a/cnqL+uWPmMsFHNS+R1GgnprS7Yta6K8R3A7uOhaP31LocYuKFfoL07mWMB5HsfIZME8kZgQ5K55DJH/mhsQrq1u93CtVTldbKcm2yjbAskbbl3A=', // Replace with your session string
  
  // Bot configuration
  botToken: process.env.TELEGRAM_BOT_TOKEN || '7548908784:AAGOiQ2iOeaa9mMsBh7l0A68ndhIh24oy_I',
  
  // Mode: 'userbot' or 'bot'
  mode: (process.env.TELEGRAM_MODE as 'bot' | 'userbot') || 'bot' // Default to userbot for backward compatibility
};

let currentStrategy: TelegramClientStrategy | null = null;
let vectorService: VectorService | null = null;

// Initialize vector service
try {
  vectorService = new VectorService({
    qdrantUrl: process.env.QDRANT_URL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    collectionName: process.env.QDRANT_COLLECTION,
  });
  console.log('[VectorService] Initialized');
} catch (error) {
  console.warn('[VectorService] Failed to initialize:', error.message);
}

/**
 * Initialize Telegram client using strategy pattern
 */
async function initClient(): Promise<TelegramClientStrategy> {
  // Check if current strategy is already valid
  if (currentStrategy && 
      currentStrategy.isClientConnected() && 
      currentStrategy.getMode() === CONFIG.mode) {
    console.log('[initClient] Strategy already connected, skipping initialization');
    return currentStrategy;
  }
  
  // Disconnect existing strategy if mode changed
  if (currentStrategy && currentStrategy.getMode() !== CONFIG.mode) {
    console.log(`[initClient] Mode changed from ${currentStrategy.getMode()} to ${CONFIG.mode}, switching strategy...`);
    try {
      await currentStrategy.disconnect();
    } catch (error) {
      console.warn('[initClient] Error disconnecting previous strategy:', error.message);
    }
    currentStrategy = null;
  }
  
  try {
    console.log(`[initClient] Creating ${CONFIG.mode} strategy...`);
    
    // Create new strategy
    currentStrategy = StrategyFactory.createValidatedStrategy(CONFIG.mode, CONFIG);
    
    // Initialize the strategy
    await currentStrategy.initialize();
    
    console.log(`[initClient] Strategy initialized successfully: ${CONFIG.mode} mode`);
    return currentStrategy;
    
  } catch (error) {
    console.error(`[initClient] Failed to initialize strategy in ${CONFIG.mode} mode:`, error);
    currentStrategy = null;
    throw error;
  }
}

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    connected: currentStrategy ? currentStrategy.isClientConnected() : false,
    mode: currentStrategy ? currentStrategy.getMode() : null,
    configuredMode: CONFIG.mode,
    strategyInfo: currentStrategy ? StrategyFactory.getStrategyInfo(currentStrategy.getMode()) : null,
    timestamp: new Date().toISOString()
  });
});

/**
 * Convert buttons array to GramJS inline keyboard
 */
function createInlineKeyboard(buttons?: Array<Array<{ text: string; url?: string; data?: string }>>): any {
  if (!buttons || buttons.length === 0) return null;
  
  // Создаем ряды кнопок
  const rows = buttons.map(row => {
    const buttonRow = row.map(btn => {
      if (btn.url) {
        return new Api.KeyboardButtonUrl({
          text: btn.text,
          url: btn.url
        });
      } else if (btn.data) {
        return new Api.KeyboardButtonCallback({
          text: btn.text,
          data: Buffer.from(btn.data, 'utf-8')
        });
      }
      // Обычная кнопка без действия (редко используется в inline)
      return new Api.KeyboardButtonCallback({
        text: btn.text,
        data: Buffer.from(btn.text, 'utf-8') // fallback data
      });
    });
    
    // Оборачиваем в KeyboardButtonRow
    return new Api.KeyboardButtonRow({ buttons: buttonRow });
  });
  
  // Возвращаем ReplyInlineMarkup
  return new Api.ReplyInlineMarkup({ rows });
}

/**
 * Send text message with support for MarkdownV2 and custom emojis
 */
app.post('/send_message', async (req: Request, res: Response) => {
  try {
    const { peer, message, entities, buttons } = req.body;

    if (!peer || !message) {
      return res.status(400).json({ error: 'peer and message are required' });
    }
    
    const strategy = await initClient();
    
    // Build message options
    const messageOptions: MessageOptions = {
      message,
    };
    
    // Convert entities to proper GramJS format for custom emojis
    if (entities && entities.length > 0) {      
      messageOptions.formattingEntities = entities.map((entity: any) => {
        return new Api.MessageEntityCustomEmoji({
          offset: entity.offset,
          length: entity.length,
          documentId: entity.custom_emoji_id
        });
      });
    }
    
    // Add inline buttons if provided
    const inlineButtons = createInlineKeyboard(buttons);
    if (inlineButtons) {
      messageOptions.replyMarkup = {
        inline_keyboard: buttons.map((row: any) => 
            row.map((btn: any) => ({
                text: btn.text,
                ...(btn.url ? { url: btn.url } : {}),
                ...(btn.data ? { callback_data: btn.data } : {})
            }))
        )
      };
    }

    // Send message using strategy
    const result = await strategy.sendMessage(peer, messageOptions);
    
    res.json({ 
      success: true, 
      message: 'Message sent successfully', 
      mode: strategy.getMode(),
      result 
    });
  } catch (error) {
    console.error(`[send_message] Error sending message:`, error);
    res.status(500).json({ 
      error: error.message,
      mode: currentStrategy ? currentStrategy.getMode() : 'unknown'
    });
  }
});

/**
 * Send file
 */
app.post('/send_file', async (req: Request, res: Response) => {
  try {
    const { peer, filePath, caption } = req.body;
    
    if (!peer || !filePath) {
      return res.status(400).json({ error: 'peer and filePath are required' });
    }
    
    if (!existsSync(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }
    
    const strategy = await initClient();
    const result = await strategy.sendFile(peer, { 
      file: filePath,
      caption: caption || ''
    });
    
    res.json({ 
      success: true, 
      message: 'File sent successfully',
      mode: strategy.getMode(),
      result
    });
  } catch (error) {
    console.error('Error sending file:', error);
    res.status(500).json({ 
      error: error.message,
      mode: currentStrategy ? currentStrategy.getMode() : 'unknown'
    });
  }
});

/**
 * Send note as image (screenshot)
 */
app.post('/send_note_as_image', async (req: Request, res: Response) => {
  try {
    const { peer, content, title, buttons } = req.body;
    
    if (!peer || !content) {
      return res.status(400).json({ error: 'peer and content are required' });
    }
    
    // Create temporary HTML file for screenshot
    const tempDir = join(__dirname, 'temp');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            background: white;
        }
        h1, h2, h3 { color: #333; }
        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
        blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; }
    </style>
</head>
<body>
    <h1>${title || 'Note'}</h1>
    <div>${content.replace(/\n/g, '<br>')}</div>
</body>
</html>`;
    
    const htmlFile = join(tempDir, `note_${Date.now()}.html`);
    writeFileSync(htmlFile, htmlContent);
    
    const strategy = await initClient();
    
    const sendOptions: FileOptions = { 
      file: htmlFile,
      caption: title || 'Note from Obsidian'
    };
    
    // Add inline buttons if provided
    const inlineButtons = createInlineKeyboard(buttons);
    if (inlineButtons) {
      sendOptions.replyMarkup = inlineButtons;
    }
    
    const result = await strategy.sendFile(peer, sendOptions);
    
    // Clean up
    unlinkSync(htmlFile);
    
    res.json({ 
      success: true, 
      message: 'Note sent as image successfully',
      mode: strategy.getMode(),
      result
    });
  } catch (error) {
    console.error('Error sending note as image:', error);
    res.status(500).json({ 
      error: error.message,
      mode: currentStrategy ? currentStrategy.getMode() : 'unknown'
    });
  }
});

/**
 * Get user info
 */
app.get('/me', async (req: Request, res: Response) => {
  try {
    const strategy = await initClient();
    const me = await strategy.getMe();
    
    res.json({
      id: me.id,
      username: me.username,
      firstName: me.firstName,
      lastName: me.lastName,
      phone: me.phone,
      mode: strategy.getMode(),
      capabilities: me.capabilities || null
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    res.status(500).json({ 
      error: error.message,
      mode: currentStrategy ? currentStrategy.getMode() : 'unknown'
    });
  }
});

/**
 * Get all channels (chats, groups, channels)
 */
app.get('/channels', async (req: Request, res: Response) => {
  try {
    const strategy = await initClient();
    const { limit } = req.query;
    
    const dialogs = await strategy.getDialogs({ 
      limit: limit ? parseInt(limit as string) : undefined 
    });
    
    const channels = strategy.formatChannels(dialogs);
    
    res.json({
      success: true,
      channels,
      total: channels.length,
      mode: strategy.getMode(),
      strategyInfo: StrategyFactory.getStrategyInfo(strategy.getMode())
    });
  } catch (error) {
    console.error(`[channels] Error getting channels:`, error);
    
    // Handle strategy-specific errors gracefully
    const mode = currentStrategy ? currentStrategy.getMode() : 'unknown';
    
    if (mode === 'bot' && error.message.includes('dialog')) {
      // Bot cannot access dialogs - this is normal
      res.json({
        success: true,
        channels: [],
        total: 0,
        mode: 'bot',
        note: 'Bot cannot access dialogs. This is normal for bots that haven\'t been added to any chats yet.',
        error: error.message
      });
    } else {
      res.status(500).json({ 
        error: error.message,
        mode
      });
    }
  }
});

/**
 * Get messages from a specific channel/chat between dates
 */
app.get('/messages', async (req: Request, res: Response) => {
  try {
    const { peer, startDate, endDate, limit = 100 } = req.query;
    
    if (!peer) {
      return res.status(400).json({ error: 'peer is required' });
    }
    
    const strategy = await initClient();
    
    // Parse dates
    const start = startDate ? new Date(startDate as string) : null;
    const end = endDate ? new Date(endDate as string) : null;
    
    // Get messages
    const messages = await strategy.getMessages(peer as string, {
      limit: parseInt(limit as string),
      offsetDate: end || undefined,
      minId: 0,
      maxId: 0
    });
    
    // Filter by date range if provided
    let filteredMessages = messages;
    if (start || end) {
      filteredMessages = messages.filter(message => {
        const msgDate = new Date(message.date * 1000);
        if (start && msgDate < start) return false;
        if (end && msgDate > end) return false;
        return true;
      });
    }
    
    // Format messages
    const formattedMessages = filteredMessages.map(message => ({
      id: message.id,
      message: message.message || null,
      date: new Date(message.date * 1000).toISOString(),
      fromId: message.fromId?.userId?.toString() || null,
      peerId: message.peerId,
      out: message.out,
      mentioned: message.mentioned,
      mediaUnread: message.mediaUnread,
      silent: message.silent,
      post: message.post,
      fromScheduled: message.fromScheduled,
      legacy: message.legacy,
      editHide: message.editHide,
      pinned: message.pinned,
      noforwards: message.noforwards,
      media: message.media ? {
        className: message.media.className,
        document: message.media.document ? {
          id: message.media.document.id?.toString(),
          mimeType: message.media.document.mimeType,
          size: message.media.document.size
        } : null,
        photo: message.media.photo ? {
          id: message.media.photo.id?.toString(),
          hasStickers: message.media.photo.hasStickers
        } : null
      } : null,
      views: message.views,
      forwards: message.forwards,
      replies: message.replies,
      editDate: message.editDate ? new Date(message.editDate * 1000).toISOString() : null,
      postAuthor: message.postAuthor,
      groupedId: message.groupedId?.toString() || null
    }));
    
    res.json({
      success: true,
      messages: formattedMessages,
      total: formattedMessages.length,
      peer,
      mode: strategy.getMode(),
      dateRange: {
        start: start?.toISOString() || null,
        end: end?.toISOString() || null
      }
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ 
      error: error.message,
      mode: currentStrategy ? currentStrategy.getMode() : 'unknown'
    });
  }
});

// ============================================================================
// VECTOR SERVICE ENDPOINTS
// ============================================================================

/**
 * Vectorize content (universal endpoint)
 */
app.post('/vectorize', async (req: Request, res: Response) => {
  try {
    if (!vectorService) {
      return res.status(503).json({ error: 'Vector service not available' });
    }

    const { id, contentType, title, content, metadata } = req.body;

    if (!id || !contentType || !content) {
      return res.status(400).json({ 
        error: 'id, contentType, and content are required' 
      });
    }

    const result = await vectorService.vectorizeContent({
      id,
      contentType,
      title,
      content,
      metadata
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[/vectorize] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Vectorize Telegram messages from a channel
 */
app.post('/vectorize_messages', async (req: Request, res: Response) => {
  try {
    if (!vectorService) {
      return res.status(503).json({ error: 'Vector service not available' });
    }

    const { peer, startDate, endDate, limit = 100 } = req.body;
    
    if (!peer) {
      return res.status(400).json({ error: 'peer is required' });
    }
    
    const strategy = await initClient();
    
    // Get messages first
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    const messages = await strategy.getMessages(peer, {
      // limit: parseInt(limit),
      limit: 1000,
      offsetDate: end || undefined,
      minId: 0,
      maxId: 0
    });

    // Filter by date range if provided
    let filteredMessages = messages;
    if (start || end) {
      filteredMessages = messages.filter(message => {
        const msgDate = new Date(message.date * 1000);
        if (start && msgDate < start) return false;
        if (end && msgDate > end) return false;
        return true;
      });
    }

    // Prepare content list for vectorization
    const contentList = filteredMessages
      .filter(msg => msg.message && msg.message.trim().length > 0)
      .map(msg => ({
        id: `telegram_${peer}_${msg.id}`,
        contentType: 'telegram_post',
        content: msg.message,
        metadata: {
          telegram: {
            channelId: peer,
            messageId: msg.id,
            author: msg.postAuthor || null,
            date: new Date(msg.date * 1000).toISOString(),
            views: msg.views,
            forwards: msg.forwards,
            isComment: false
          }
        }
      }));
    
    if (contentList.length === 0) {
      return res.json({
        success: true,
        message: 'No messages with content found to vectorize',
        processed: 0,
        results: []
      });
    }

    // Batch vectorize
    const results = await vectorService.batchVectorize(contentList, (progress) => {
      console.log(`[/vectorize_messages] Progress: ${progress.current}/${progress.total}`);
    });

    res.json({
      success: true,
      peer,
      processed: results.length,
      results,
      mode: strategy.getMode(),
      dateRange: {
        start: start?.toISOString() || null,
        end: end?.toISOString() || null
      }
    });

  } catch (error) {
    console.error('[/vectorize_messages] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Search vectorized content
 */
app.post('/search', async (req: Request, res: Response) => {
  try {
    if (!vectorService) {
      return res.status(503).json({ error: 'Vector service not available' });
    }

    const { 
      query, 
      limit = 10, 
      contentTypes = [], 
      filters = {},
      scoreThreshold = 0.0
    } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required and must be a string' });
    }

    const results = await vectorService.searchContent(query, {
      limit,
      contentTypes,
      filters,
      scoreThreshold
    });

    res.json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('[/search] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get vectorized content by ID
 */
app.get('/content/:id', async (req: Request, res: Response) => {
  try {
    if (!vectorService) {
      return res.status(503).json({ error: 'Vector service not available' });
    }

    const { id } = req.params;
    const content = await vectorService.getContent(id);

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json({
      success: true,
      content
    });

  } catch (error) {
    console.error(`[/content/${req.params.id}] Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete vectorized content
 */
app.delete('/content/:id', async (req: Request, res: Response) => {
  try {
    if (!vectorService) {
      return res.status(503).json({ error: 'Vector service not available' });
    }

    const { id } = req.params;
    const result = await vectorService.deleteContent(id);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error(`[DELETE /content/${req.params.id}] Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get vector service statistics
 */
app.get('/vector_stats', async (req: Request, res: Response) => {
  try {
    if (!vectorService) {
      return res.status(503).json({ error: 'Vector service not available' });
    }

    const stats = await vectorService.getStats();

    res.json({
      success: true,
      ...stats
    });

  } catch (error) {
    console.error('[/vector_stats] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Vector service health check
 */
app.get('/vector_health', async (req: Request, res: Response) => {
  try {
    if (!vectorService) {
      return res.status(503).json({ 
        status: 'unavailable',
        error: 'Vector service not initialized'
      });
    }

    const health = await vectorService.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(health);

  } catch (error) {
    console.error('[/vector_health] Error:', error);
    res.status(503).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
  console.log('Shutting down GramJS server...');
  if (currentStrategy) {
    try {
      await currentStrategy.disconnect();
      console.log('Strategy disconnected successfully');
    } catch (error) {
      console.warn('Error disconnecting strategy:', error.message);
    }
  }
  process.exit(0);
});

// Start server
/**
 * Update configuration endpoint
 */
app.post('/config', async (req: Request, res: Response) => {
  try {
    const { mode, botToken, apiId, apiHash, stringSession } = req.body;
    
    console.log(`[/config] Updating configuration - mode: ${mode}`);
    
    // Store previous mode
    const previousMode = CONFIG.mode;
    
    // Update config
    if (mode) CONFIG.mode = mode;
    if (botToken) CONFIG.botToken = botToken;
    if (apiId) CONFIG.apiId = apiId;
    if (apiHash) CONFIG.apiHash = apiHash;
    if (stringSession) CONFIG.stringSession = stringSession;
    
    // Disconnect existing strategy if mode changed
    if (currentStrategy && previousMode !== CONFIG.mode) {
      console.log(`[/config] Mode changed from ${previousMode} to ${CONFIG.mode}, disconnecting current strategy`);
      try {
        await currentStrategy.disconnect();
      } catch (error) {
        console.warn('[/config] Error disconnecting strategy:', error.message);
      }
      currentStrategy = null;
    }
    
    // Validate new configuration
    try {
      const validationResult = StrategyFactory.validateConfigCompleteness(CONFIG.mode, CONFIG);
      
      res.json({
        success: true,
        message: 'Configuration updated',
        currentConfig: {
          mode: CONFIG.mode,
          hasApiId: !!CONFIG.apiId,
          hasApiHash: !!CONFIG.apiHash,
          hasBotToken: !!CONFIG.botToken,
          hasStringSession: !!CONFIG.stringSession
        },
        validation: validationResult,
        strategyInfo: StrategyFactory.getStrategyInfo(CONFIG.mode)
      });
    } catch (validationError) {
      res.json({
        success: true,
        message: 'Configuration updated with validation warnings',
        currentConfig: {
          mode: CONFIG.mode,
          hasApiId: !!CONFIG.apiId,
          hasApiHash: !!CONFIG.apiHash,
          hasBotToken: !!CONFIG.botToken,
          hasStringSession: !!CONFIG.stringSession
        },
        validationError: validationError.message
      });
    }
    
  } catch (error) {
    console.error('[/config] Error updating configuration:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`GramJS server running on http://127.0.0.1:${PORT}`);
  console.log(`Mode: ${CONFIG.mode}`);
  console.log('Use Ctrl+C to stop');
});