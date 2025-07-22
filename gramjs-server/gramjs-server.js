#!/usr/bin/env node

/**
 * Standalone GramJS server for Obsidian plugin
 * Runs as separate Node.js process to avoid Electron compatibility issues
 */

// Load environment variables from .env file FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { v4: uuidv4 } = require('uuid');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const VectorService = require('./vector-service');

const app = express();
const PORT = 8124; // Different from main plugin port

// Middleware
app.use(cors());
app.use(express.json());

// Configuration (you'll need to set these)
const CONFIG = {
  apiId: process.env.TELEGRAM_API_ID || 27782052, // Replace with your API ID
  apiHash: process.env.TELEGRAM_API_HASH || '68a4d2fd1466ab6faccfb81bd4b68255', // Replace with your API Hash
  stringSession: process.env.TELEGRAM_SESSION || '1AgAOMTQ5LjE1NC4xNjcuNDEBu12zMcMWPrgkH8lmy5vdKybpnoWFxGiwtvdXgCvXK7WFLyZB6LiT5vILrCFUDSnU0Ae9zXHPkBjBtGwuv5vCUIHCFc26j31/Kx25D0YyX21CGAXvMTi9kNZhlCakjo+BqgztIyVWs+2Je63WyTPp3893JoCjwUBcHx3l7NqR6JMYUzReE6P6C4nFnnjc8WP9QyKXC7kretLCKgacK+xzpFMcW35sMmemlmflB3a/cnqL+uWPmMsFHNS+R1GgnprS7Yta6K8R3A7uOhaP31LocYuKFfoL07mWMB5HsfIZME8kZgQ5K55DJH/mhsQrq1u93CtVTldbKcm2yjbAskbbl3A=' // Replace with your session string
};

let client = null;
let isConnected = false;
let vectorService = null;

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
 * Initialize GramJS client
 */
async function initClient() {
  if (client && isConnected) {
    console.log('[initClient] Client already connected, skipping initialization');
    return;
  }
  
  try {
    console.log('[initClient] Initializing GramJS client...');
    console.log('[initClient] API ID:', CONFIG.apiId);
    console.log('[initClient] Session string length:', CONFIG.stringSession?.length || 0);
    
    client = new TelegramClient(
      new StringSession(CONFIG.stringSession),
      CONFIG.apiId,
      CONFIG.apiHash,
      { connectionRetries: 5 }
    );
    
    console.log('[initClient] Client created, attempting to connect...');
    await client.connect();
    isConnected = true;
    
    // Get user info to verify connection
    const me = await client.getMe();
    console.log(`[initClient] GramJS client connected successfully as: @${me.username} (${me.firstName} ${me.lastName})`);
  } catch (error) {
    console.error('[initClient] Failed to initialize GramJS client:', error);
    console.error('[initClient] Error details:', error.message);
    isConnected = false;
    throw error;
  }
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connected: isConnected,
    timestamp: new Date().toISOString()
  });
});

/**
 * Send text message with support for MarkdownV2 and custom emojis
 */
app.post('/send_message', async (req, res) => {
  try {
    const { peer, message, entities } = req.body;

    if (!peer || !message) {
      return res.status(400).json({ error: 'peer and message are required' });
    }
    
    await initClient();
    
    // Build message options
    const messageOptions = {
      message,
    };
    
    // Convert entities to proper GramJS format for custom emojis
    if (entities && entities.length > 0) {      
      messageOptions.formattingEntities = entities.map(entity => {
        return new Api.MessageEntityCustomEmoji({
          offset: entity.offset,
          length: entity.length,
          documentId: entity.custom_emoji_id
        });
      });
    }
    
    const result = await client.sendMessage(peer, messageOptions);
    console.log(`[send_message] Message sent successfully. Options:`, messageOptions);
    
    res.json({ success: true, message: 'Message sent successfully', result });
  } catch (error) {
    console.error('[send_message] Error sending message:', error);
    console.error('[send_message] Error stack:', error.stack);
    res.status(500).json({ error: error.message, details: error.toString() });
  }
});

/**
 * Send file
 */
app.post('/send_file', async (req, res) => {
  try {
    const { peer, filePath, caption } = req.body;
    
    if (!peer || !filePath) {
      return res.status(400).json({ error: 'peer and filePath are required' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }
    
    await initClient();
    await client.sendFile(peer, { 
      file: filePath,
      caption: caption || ''
    });
    
    res.json({ success: true, message: 'File sent successfully' });
  } catch (error) {
    console.error('Error sending file:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send note as image (screenshot)
 */
app.post('/send_note_as_image', async (req, res) => {
  try {
    const { peer, content, title } = req.body;
    
    if (!peer || !content) {
      return res.status(400).json({ error: 'peer and content are required' });
    }
    
    // Create temporary HTML file for screenshot
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
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
    
    const htmlFile = path.join(tempDir, `note_${Date.now()}.html`);
    fs.writeFileSync(htmlFile, htmlContent);
    
    await initClient();
    await client.sendFile(peer, { 
      file: htmlFile,
      caption: title || 'Note from Obsidian'
    });
    
    // Clean up
    fs.unlinkSync(htmlFile);
    
    res.json({ success: true, message: 'Note sent as image successfully' });
  } catch (error) {
    console.error('Error sending note as image:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get user info
 */
app.get('/me', async (req, res) => {
  try {
    await initClient();
    const me = await client.getMe();
    
    res.json({
      id: me.id,
      username: me.username,
      firstName: me.firstName,
      lastName: me.lastName,
      phone: me.phone
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all channels (chats, groups, channels)
 */
app.get('/channels', async (req, res) => {
  try {
    await initClient();
    
    // Get all dialogs (chats)
    const dialogs = await client.getDialogs();
    
    const channels = dialogs.map(dialog => ({
      id: dialog.id,
      title: dialog.title,
      username: dialog.entity.username || null,
      type: dialog.isChannel ? 'channel' : dialog.isGroup ? 'group' : 'chat',
      participantsCount: dialog.entity.participantsCount || null,
      isChannel: dialog.isChannel,
      isGroup: dialog.isGroup,
      isUser: dialog.isUser,
      accessHash: dialog.entity.accessHash?.toString() || null,
      date: dialog.date
    }));
    
    res.json({
      success: true,
      channels,
      total: channels.length
    });
  } catch (error) {
    console.error('Error getting channels:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get messages from a specific channel/chat between dates
 */
app.get('/messages', async (req, res) => {
  try {
    const { peer, startDate, endDate, limit = 100 } = req.query;
    
    if (!peer) {
      return res.status(400).json({ error: 'peer is required' });
    }
    
    await initClient();
    
    // Parse dates
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    // Get messages
    const messages = await client.getMessages(peer, {
      limit: parseInt(limit),
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
      dateRange: {
        start: start?.toISOString() || null,
        end: end?.toISOString() || null
      }
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// VECTOR SERVICE ENDPOINTS
// ============================================================================

/**
 * Vectorize content (universal endpoint)
 */
app.post('/vectorize', async (req, res) => {
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
app.post('/vectorize_messages', async (req, res) => {
  try {
    if (!vectorService) {
      return res.status(503).json({ error: 'Vector service not available' });
    }

    const { peer, startDate, endDate, limit = 100 } = req.body;
    
    if (!peer) {
      return res.status(400).json({ error: 'peer is required' });
    }
    
    await initClient();
    
    // Get messages first
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    const messages = await client.getMessages(peer, {
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
app.post('/search', async (req, res) => {
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
app.get('/content/:id', async (req, res) => {
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
app.delete('/content/:id', async (req, res) => {
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
app.get('/vector_stats', async (req, res) => {
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
app.get('/vector_health', async (req, res) => {
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
  if (client && isConnected) {
    await client.disconnect();
  }
  process.exit(0);
});

// Start server
app.listen(PORT, '127.0.0.1', () => {
  console.log(`GramJS server running on http://127.0.0.1:${PORT}`);
  console.log('Use Ctrl+C to stop');
});