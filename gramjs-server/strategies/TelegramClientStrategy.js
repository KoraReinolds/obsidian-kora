/**
 * Base strategy class for Telegram client operations
 * Defines common interface for bot and userbot strategies
 */
class TelegramClientStrategy {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Initialize and connect the client
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Disconnect the client
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Get current user/bot information
   * @returns {Promise<Object>}
   */
  async getMe() {
    if (!this.isConnected || !this.client) {
      throw new Error('Client not connected');
    }
    return await this.client.getMe();
  }

  /**
   * Send a message
   * @param {string} peer - Target peer
   * @param {Object} options - Message options
   * @returns {Promise<Object>}
   */
  async sendMessage(peer, options) {
    if (!this.isConnected || !this.client) {
      throw new Error('Client not connected');
    }
    
    const targetPeer = this.resolveTargetPeer(peer);
    const result = await this.client.sendMessage(targetPeer, options);
    
    // Clean result to avoid circular references
    return this.sanitizeResult(result);
  }

  /**
   * Sanitize result object to remove circular references and non-serializable data
   * @param {Object} result - Raw result from GramJS
   * @returns {Object} Clean result safe for JSON serialization
   */
  sanitizeResult(result) {
    if (!result) return null;
    
    const cleanResult = {
      id: result.id,
      date: result.date ? new Date(result.date * 1000).toISOString() : null,
      message: result.message || null,
      out: result.out,
      mentioned: result.mentioned,
      mediaUnread: result.mediaUnread,
      silent: result.silent,
      post: result.post,
      fromScheduled: result.fromScheduled,
      legacy: result.legacy,
      editHide: result.editHide,
      pinned: result.pinned,
      noforwards: result.noforwards,
      views: result.views,
      forwards: result.forwards,
      editDate: result.editDate ? new Date(result.editDate * 1000).toISOString() : null,
      postAuthor: result.postAuthor,
      groupedId: result.groupedId?.toString() || null,
      // Add basic peer info without circular references
      peerId: result.peerId ? {
        channelId: result.peerId.channelId?.toString() || null,
        chatId: result.peerId.chatId?.toString() || null,
        userId: result.peerId.userId?.toString() || null
      } : null,
      fromId: result.fromId ? {
        userId: result.fromId.userId?.toString() || null,
        channelId: result.fromId.channelId?.toString() || null
      } : null
    };

    // Handle media if present
    if (result.media) {
      cleanResult.media = {
        className: result.media.className,
        hasDocument: !!result.media.document,
        hasPhoto: !!result.media.photo,
        hasVideo: !!result.media.video
      };
    }

    return cleanResult;
  }

  /**
   * Send a file
   * @param {string} peer - Target peer
   * @param {Object} options - File options
   * @returns {Promise<Object>}
   */
  async sendFile(peer, options) {
    if (!this.isConnected || !this.client) {
      throw new Error('Client not connected');
    }
    
    const targetPeer = this.resolveTargetPeer(peer);
    const result = await this.client.sendFile(targetPeer, options);
    
    // Clean result to avoid circular references
    return this.sanitizeResult(result);
  }

  /**
   * Get dialogs/channels
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async getDialogs(options = {}) {
    if (!this.isConnected || !this.client) {
      throw new Error('Client not connected');
    }
    
    return await this.getDialogsImpl(options);
  }

  /**
   * Get messages from a channel/chat
   * @param {string} peer - Target peer
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async getMessages(peer, options = {}) {
    if (!this.isConnected || !this.client) {
      throw new Error('Client not connected');
    }
    
    return await this.client.getMessages(peer, options);
  }

  /**
   * Validate configuration for this strategy
   * @returns {void}
   * @throws {Error} If configuration is invalid
   */
  validateConfig() {
    throw new Error('validateConfig() must be implemented by subclass');
  }

  /**
   * Get strategy mode identifier
   * @returns {string}
   */
  getMode() {
    throw new Error('getMode() must be implemented by subclass');
  }

  /**
   * Resolve target peer based on strategy-specific logic
   * @param {string} peer - Input peer
   * @returns {string} Resolved peer
   */
  resolveTargetPeer(peer) {
    return peer; // Default implementation, can be overridden
  }

  /**
   * Get dialogs implementation (strategy-specific)
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async getDialogsImpl(options) {
    return await this.client.getDialogs(options);
  }

  /**
   * Format channel/dialog data
   * @param {Array} dialogs - Raw dialogs from client
   * @returns {Array} Formatted channels
   */
  formatChannels(dialogs) {
    return dialogs.map(dialog => ({
      id: dialog.id?.toString() || null,
      title: dialog.title,
      username: dialog.entity?.username || null,
      type: dialog.isChannel ? 'channel' : dialog.isGroup ? 'group' : 'chat',
      participantsCount: dialog.entity?.participantsCount || null,
      isChannel: dialog.isChannel,
      isGroup: dialog.isGroup,
      isUser: dialog.isUser,
      accessHash: dialog.entity?.accessHash?.toString() || null,
      date: dialog.date,
      mode: this.getMode()
    }));
  }

  /**
   * Check if client is connected
   * @returns {boolean}
   */
  isClientConnected() {
    return this.isConnected && this.client !== null;
  }
}

module.exports = TelegramClientStrategy;