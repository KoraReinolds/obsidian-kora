/**
 * Userbot strategy for Telegram operations
 * Handles personal Telegram accounts using session strings
 */
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const TelegramClientStrategy = require('./TelegramClientStrategy');

class UserbotStrategy extends TelegramClientStrategy {
  constructor(config) {
    super(config);
  }

  /**
   * Validate userbot-specific configuration
   */
  validateConfig() {
    if (!this.config.stringSession) {
      throw new Error('Session string is required for userbot mode. Set TELEGRAM_SESSION environment variable.');
    }
    if (!this.config.apiId || !this.config.apiHash) {
      throw new Error('API ID and Hash are required. Get them from https://my.telegram.org/apps');
    }
  }

  /**
   * Initialize userbot client
   */
  async initialize() {
    this.validateConfig();
    
    console.log('[UserbotStrategy] Initializing userbot client...');
    console.log('[UserbotStrategy] API ID:', this.config.apiId);
    console.log('[UserbotStrategy] Session string length:', this.config.stringSession?.length || 0);
    
    this.client = new TelegramClient(
      new StringSession(this.config.stringSession),
      this.config.apiId,
      this.config.apiHash,
      { connectionRetries: 5 }
    );
    
    await this.client.connect();
    this.isConnected = true;
    
    const me = await this.client.getMe();
    console.log(`[UserbotStrategy] Userbot connected successfully: @${me.username} (${me.firstName} ${me.lastName})`);
    
    return me;
  }

  /**
   * Get strategy mode
   */
  getMode() {
    return 'userbot';
  }

  /**
   * Resolve target peer for userbot mode
   * Userbots can send to any accessible peer, including special aliases
   */
  resolveTargetPeer(peer) {
    // For userbots, we can send to self or any accessible peer
    if (peer === 'me' || peer === 'self') {
      console.log('[UserbotStrategy] Resolving "me" to current user');
      return 'me'; // GramJS will resolve this to current user
    }
    
    console.log(`[UserbotStrategy] Using peer as-is: ${peer}`);
    return peer;
  }

  /**
   * Get dialogs with full userbot access
   */
  async getDialogsImpl(options = {}) {
    console.log('[UserbotStrategy] Getting dialogs with full userbot access...');
    
    // Userbots have full access to all dialogs
    return await this.client.getDialogs(options);
  }

  /**
   * Format channels with userbot-specific metadata
   */
  formatChannels(dialogs) {
    const channels = super.formatChannels(dialogs);
    
    // Add userbot-specific metadata
    return channels.map(channel => ({
      ...channel,
      fullAccess: true,
      note: 'Userbot mode provides full access to all accessible channels and chats.'
    }));
  }

  /**
   * Send message with userbot-specific handling
   */
  async sendMessage(peer, options) {
    try {
      console.log(`[UserbotStrategy] Sending message to peer: ${peer}`);
      
      const result = await super.sendMessage(peer, options);
      
      console.log('[UserbotStrategy] Message sent successfully in userbot mode');
      return {
        ...result,
        mode: 'userbot'
      };
    } catch (error) {
      console.error('[UserbotStrategy] Userbot message error:', error);
      
      // Provide userbot-specific error context
      if (error.message.includes('PEER_ID_INVALID')) {
        throw new Error('Invalid peer ID. Check if the chat/user exists and is accessible.');
      }
      if (error.message.includes('USER_DEACTIVATED')) {
        throw new Error('Your account has been deactivated. Cannot send messages.');
      }
      if (error.message.includes('FLOOD_WAIT')) {
        const match = error.message.match(/FLOOD_WAIT_(\d+)/);
        const seconds = match ? match[1] : 'unknown';
        throw new Error(`Rate limited. Please wait ${seconds} seconds before sending another message.`);
      }
      
      throw error;
    }
  }

  /**
   * Get messages with full userbot access
   */
  async getMessages(peer, options = {}) {
    try {
      console.log(`[UserbotStrategy] Getting messages from peer: ${peer} (userbot mode)`);
      return await super.getMessages(peer, options);
    } catch (error) {
      console.error('[UserbotStrategy] Userbot message retrieval error:', error);
      
      if (error.message.includes('CHAT_ADMIN_REQUIRED')) {
        throw new Error('Admin rights required to read message history in this chat.');
      }
      if (error.message.includes('CHANNEL_PRIVATE')) {
        throw new Error('This channel is private and you don\'t have access.');
      }
      
      throw error;
    }
  }

  /**
   * Send file with userbot-specific handling
   */
  async sendFile(peer, options) {
    try {
      console.log(`[UserbotStrategy] Sending file to peer: ${peer}`);
      return await super.sendFile(peer, options);
    } catch (error) {
      console.error('[UserbotStrategy] Userbot file send error:', error);
      
      if (error.message.includes('PEER_ID_INVALID')) {
        throw new Error('Invalid peer ID for file sending. Check if the chat/user exists.');
      }
      if (error.message.includes('MEDIA_TOO_BIG')) {
        throw new Error('File is too large. Consider compressing or splitting the file.');
      }
      
      throw error;
    }
  }

  /**
   * Get current user info with additional userbot details
   */
  async getMe() {
    const me = await super.getMe();
    
    // Add userbot-specific metadata
    return {
      ...me,
      mode: 'userbot',
      capabilities: {
        canSendToAnyUser: true,
        canAccessAllChats: true,
        canUseCustomEmojis: true,
        hasFullApiAccess: true
      }
    };
  }
}

module.exports = UserbotStrategy;