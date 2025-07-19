#!/usr/bin/env node

/**
 * Standalone GramJS server for Obsidian plugin
 * Runs as separate Node.js process to avoid Electron compatibility issues
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

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

/**
 * Initialize GramJS client
 */
async function initClient() {
  if (client && isConnected) return;
  
  try {
    client = new TelegramClient(
      new StringSession(CONFIG.stringSession),
      CONFIG.apiId,
      CONFIG.apiHash,
      { connectionRetries: 5 }
    );
    
    await client.connect();
    isConnected = true;
    console.log('GramJS client connected successfully');
  } catch (error) {
    console.error('Failed to initialize GramJS client:', error);
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
 * Send text message
 */
app.get('/send_message', async (req, res) => {
  try {
    const { peer, message } = req.body;
    
    if (!peer || !message) {
      return res.status(400).json({ error: 'peer and message are required' });
    }
    
    await initClient();
    await client.sendMessage(peer, { message });
    
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
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