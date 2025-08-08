/**
 * Bot strategy for Telegram operations
 * Handles regular bots created via @BotFather
 */
const TelegramBot = require('node-telegram-bot-api');
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
  }

  /**
   * Initialize bot client
   */
  async initialize() {
    this.validateConfig();
    
    console.log('[BotStrategy] Initializing bot client...');
    console.log('[BotStrategy] Bot token available:', !!this.config.botToken);
    
    this.client = new TelegramBot(this.config.botToken, { polling: false });
    
    this.isConnected = true;
    
    const me = await this.client.getMe();
    console.log(`[BotStrategy] Bot connected successfully: @${me.username} (${me.first_name})`);
    
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
      // node-telegram-bot-api doesn't have getDialogs method
      // Bots have limited access to chat information
      console.log('[BotStrategy] Getting dialogs with bot limitations...');
      console.warn('[BotStrategy] Bot dialog access limited: node-telegram-bot-api does not support getDialogs');
      // Return empty array as bots can't list dialogs
      return [];
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
      console.log(`[BotStrategy] Sending message to peer: ${peer}, ${JSON.stringify(options)}`);
      
      const opts = {};
      
      // Extract message and buttons from options (format matching gramjs-bridge)
      const message = options.message || options;
      
      if (options.replyMarkup && options.replyMarkup.inline_keyboard) {
        // gramjs-server.js format
        opts.reply_markup = options.replyMarkup;
        console.log(`[BotStrategy] Using replyMarkup directly:`, JSON.stringify(opts.reply_markup));
      }

      // Handle parse mode
      if (options.parseMode) {
        opts.parse_mode = options.parseMode;
      }

      const result = await this.client.sendMessage(peer, message, opts);
      
      console.log('[BotStrategy] Message sent successfully in bot mode');
      return {
        id: result.message_id,
        peerId: result.chat.id,
        message: result.text,
        date: result.date,
        mode: 'bot'
      };
    } catch (error) {
      console.error('[BotStrategy] Bot message error:', error);
      
      // Provide bot-specific error context
      if (error.message.includes('Bad Request: chat not found')) {
        throw new Error('Bot cannot send to this peer. Make sure bot is added to the chat and has permission to send messages.');
      }
      if (error.message.includes('Forbidden')) {
        throw new Error('Bot is blocked or doesn\'t have permission to send messages to this chat.');
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
      console.warn('[BotStrategy] Bot message access limited: node-telegram-bot-api does not support getMessages');
      // node-telegram-bot-api doesn't have getMessages method
      // Bots typically can only respond to incoming messages, not fetch history
      return [];
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
      
      const opts = {};
      
      // Handle buttons for file messages
      if (options.buttons && options.buttons.length > 0) {
        opts.reply_markup = {
          inline_keyboard: options.buttons.map(row => 
            row.map(btn => ({
              text: btn.text,
              ...(btn.url ? { url: btn.url } : {}),
              ...(btn.data ? { callback_data: btn.data } : {})
            }))
          )
        };
      }

      // Handle caption
      if (options.caption) {
        opts.caption = options.caption;
      }

      // Handle parse mode
      if (options.parseMode) {
        opts.parse_mode = options.parseMode;
      }

      const result = await this.client.sendDocument(peer, options.file, opts);
      
      console.log('[BotStrategy] File sent successfully in bot mode');
      return {
        id: result.message_id,
        peerId: result.chat.id,
        date: result.date,
        mode: 'bot'
      };
    } catch (error) {
      console.error('[BotStrategy] Bot file send error:', error);
      
      if (error.message.includes('Bad Request: chat not found')) {
        throw new Error('Bot cannot send files to this peer. Make sure bot is added to the chat.');
      }
      if (error.message.includes('Forbidden')) {
        throw new Error('Bot is blocked or doesn\'t have permission to send files to this chat.');
      }
      
      throw error;
    }
  }
}

module.exports = BotStrategy;