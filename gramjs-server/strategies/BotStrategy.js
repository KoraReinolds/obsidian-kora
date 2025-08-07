/**
 * Bot strategy for Telegram operations
 * Handles regular bots created via @BotFather
 */
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const TelegramClientStrategy = require('./TelegramClientStrategy');

class BotStrategy extends TelegramClientStrategy {
  constructor(config) {
    super(config);
  }

  /**
   * Validate bot-specific configuration
   */
  validateConfig() {
    if (!this.config.botToken) {
      throw new Error('Bot token is required for bot mode. Set TELEGRAM_BOT_TOKEN environment variable.');
    }
    if (!this.config.apiId || !this.config.apiHash) {
      throw new Error('API ID and Hash are required. Get them from https://my.telegram.org/apps');
    }
  }

  /**
   * Initialize bot client
   */
  async initialize() {
    this.validateConfig();
    
    console.log('[BotStrategy] Initializing bot client...');
    console.log('[BotStrategy] Bot token available:', !!this.config.botToken);
    
    this.client = new TelegramClient(
      new StringSession(''), // Empty session for bot
      this.config.apiId,
      this.config.apiHash,
      { connectionRetries: 5 }
    );
    
    await this.client.start({
      botAuthToken: this.config.botToken
    });
    
    this.isConnected = true;
    
    const me = await this.client.getMe();
    console.log(`[BotStrategy] Bot connected successfully: @${me.username} (${me.firstName})`);
    
    return me;
  }

  /**
   * Get strategy mode
   */
  getMode() {
    return 'bot';
  }

  /**
   * Resolve target peer for bot mode
   * Bots cannot send to arbitrary users, only to chats where they're added
   */
  resolveTargetPeer(peer) {
    // For bots, peer should be a chat ID where the bot can send messages
    // Bots cannot initiate conversations with users, only respond to them
    console.log(`[BotStrategy] Resolving peer: ${peer}`);
    return peer;
  }

  /**
   * Get dialogs with bot limitations
   */
  async getDialogsImpl(options = {}) {
    try {
      // Bots have limited access to chat information
      console.log('[BotStrategy] Getting dialogs with bot limitations...');
      
      const dialogs = await this.client.getDialogs({ 
        limit: options.limit || 100 
      });
      
      return dialogs;
    } catch (error) {
      console.warn('[BotStrategy] Bot dialog access limited:', error.message);
      // Return empty array if bot can't access dialogs (normal for new bots)
      return [];
    }
  }

  /**
   * Format channels with bot-specific metadata
   */
  formatChannels(dialogs) {
    const channels = super.formatChannels(dialogs);
    
    // Add bot-specific metadata
    return channels.map(channel => ({
      ...channel,
      botLimited: true,
      note: 'Bot mode has limited access to channels. Only shows chats where bot is a member.'
    }));
  }

  /**
   * Send message with bot-specific handling
   */
  async sendMessage(peer, options) {
    try {
      // Add bot-specific message handling if needed
      console.log(`[BotStrategy] Sending message to peer: ${peer}`);
      
      const result = await super.sendMessage(peer, options);
      
      console.log('[BotStrategy] Message sent successfully in bot mode');
      return {
        ...result,
        mode: 'bot'
      };
    } catch (error) {
      console.error('[BotStrategy] Bot message error:', error);
      
      // Provide bot-specific error context
      if (error.message.includes('PEER_ID_INVALID')) {
        throw new Error('Bot cannot send to this peer. Make sure bot is added to the chat and has permission to send messages.');
      }
      if (error.message.includes('BOT_METHOD_INVALID')) {
        throw new Error('This method is not available for bots. Some features are userbot-only.');
      }
      
      throw error;
    }
  }

  /**
   * Get messages with bot limitations
   */
  async getMessages(peer, options = {}) {
    try {
      console.log(`[BotStrategy] Getting messages from peer: ${peer} (bot mode)`);
      return await super.getMessages(peer, options);
    } catch (error) {
      console.warn('[BotStrategy] Bot message access limited:', error.message);
      
      if (error.message.includes('CHAT_ADMIN_REQUIRED')) {
        throw new Error('Bot needs admin rights to read messages in this chat.');
      }
      
      throw error;
    }
  }

  /**
   * Send file with bot-specific handling
   */
  async sendFile(peer, options) {
    try {
      console.log(`[BotStrategy] Sending file to peer: ${peer}`);
      return await super.sendFile(peer, options);
    } catch (error) {
      console.error('[BotStrategy] Bot file send error:', error);
      
      if (error.message.includes('PEER_ID_INVALID')) {
        throw new Error('Bot cannot send files to this peer. Make sure bot is added to the chat.');
      }
      
      throw error;
    }
  }
}

module.exports = BotStrategy;