/**
 * Base strategy class for Telegram client operations
 * Defines common interface for bot and userbot strategies
 */

export interface TelegramConfig {
  apiId?: number;
  apiHash?: string;
  botToken?: string;
  stringSession?: string;
  mode?: 'bot' | 'userbot';
  [key: string]: any;
}

export interface DialogOptions {
  limit?: number;
  [key: string]: any;
}

export interface MessageOptions {
  message?: string;
  parseMode?: string;
  replyMarkup?: any;
  formattingEntities?: any[];
  disableWebPagePreview?: boolean;
  [key: string]: any;
}

export interface FileOptions {
  file: string;
  caption?: string;
  parseMode?: string;
  replyMarkup?: any;
  buttons?: Array<Array<{
    text: string;
    url?: string;
    data?: string;
  }>>;
  [key: string]: any;
}

export interface UserInfo {
  id: string | number;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  [key: string]: any;
}

export interface ChannelInfo {
  id: string;
  title: string;
  username?: string;
  type: 'channel' | 'group' | 'chat';
  participantsCount?: number;
  isChannel: boolean;
  isGroup: boolean;
  isUser: boolean;
  accessHash?: string;
  date: any;
  mode: string;
  [key: string]: any;
}

class TelegramClientStrategy {
  protected config: TelegramConfig;
  protected client: any;
  protected isConnected: boolean;

  constructor(config: TelegramConfig) {
    this.config = config;
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Initialize and connect the client
   * @returns {Promise<void>}
   */
  async initialize(): Promise<UserInfo> {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Disconnect the client
   * @returns {Promise<void>}
   */
  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Get current user/bot information
   * @returns {Promise<UserInfo>}
   */
  async getMe(): Promise<UserInfo> {
    this.validateConnection();
    return await this.client.getMe();
  }

  /**
   * Validate client connection
   * @throws {Error} If client is not connected
   */
  private validateConnection(): void {
    if (!this.isConnected || !this.client) {
      throw new Error('Client not connected');
    }
  }

  /**
   * Process link preview options
   * @param {any} targetOptions - Options object to modify
   * @param {MessageOptions} sourceOptions - Source options
   */
  private processLinkPreview(targetOptions: any, sourceOptions: MessageOptions): void {
    if (sourceOptions.disableWebPagePreview !== undefined) {
      targetOptions.linkPreview = !sourceOptions.disableWebPagePreview;
    }
  }

  /**
   * Convert and process reply markup (buttons)
   * @param {any} targetOptions - Options object to modify
   * @param {MessageOptions} sourceOptions - Source options
   * @param {boolean} removeReplyMarkup - Whether to remove original replyMarkup property
   */
  private processReplyMarkup(targetOptions: any, sourceOptions: MessageOptions, removeReplyMarkup = true): void {
    if (sourceOptions.replyMarkup) {
      // Convert different button formats for GramJS compatibility
      if (sourceOptions.replyMarkup.inline_keyboard) {
        // Convert from markdown-converter format to GramJS format
        targetOptions.buttons = sourceOptions.replyMarkup.inline_keyboard.map((row: any) => 
          row.map((btn: any) => ({
            text: btn.text,
            ...(btn.url ? { url: btn.url } : {}),
            ...(btn.callback_data ? { data: btn.callback_data } : {}),
            ...(btn.data ? { data: btn.data } : {})
          }))
        );
      } else {
        // Pass through GramJS ReplyInlineMarkup objects
        targetOptions.buttons = sourceOptions.replyMarkup;
      }
      
      // Remove the original replyMarkup to avoid conflicts if requested
      if (removeReplyMarkup) {
        delete targetOptions.replyMarkup;
      }
    }
  }

  /**
   * Send a message
   * @param {string} peer - Target peer
   * @param {MessageOptions} options - Message options
   * @returns {Promise<any>}
   */
  async sendMessage(peer: string, options: MessageOptions): Promise<any> {
    this.validateConnection();
    
    const targetPeer = this.resolveTargetPeer(peer);
    const messageOptions = { ...options };
    
    this.processLinkPreview(messageOptions, options);
    this.processReplyMarkup(messageOptions, options);
    
    const result = await this.client.sendMessage(targetPeer, messageOptions);
    return this.sanitizeResult(result);
  }

  /**
   * Edit an existing message
   * @param {string} peer - Target peer
   * @param {number} messageId - Message ID to edit
   * @param {MessageOptions} options - Message options
   * @returns {Promise<any>}
   */
  async editMessage(peer: string, messageId: number, options: MessageOptions): Promise<any> {
    this.validateConnection();
    const targetPeer = this.resolveTargetPeer(peer);
    
    const editOptions = {
      message: messageId,
      text: options.message,
      formattingEntities: options.formattingEntities
    };
    
    this.processLinkPreview(editOptions, options);
    this.processReplyMarkup(editOptions, options, false); // Don't remove replyMarkup for edit operations
   console.log('!!!',targetPeer, editOptions) 
    const result = await this.client.editMessage(targetPeer, editOptions);
    return this.sanitizeResult(result);
  }

  /**
   * Sanitize result object to remove circular references and non-serializable data
   * @param {any} result - Raw result from GramJS
   * @returns {any} Clean result safe for JSON serialization
   */
  sanitizeResult(result: any): any {
    if (!result) return null;
    
    const cleanResult = {
      id: result.id,
      messageId: result.id, // Add messageId alias for easier access
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
      (cleanResult as any).media = {
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
   * @param {FileOptions} options - File options
   * @returns {Promise<any>}
   */
  async sendFile(peer: string, options: FileOptions): Promise<any> {
    this.validateConnection();
    
    const targetPeer = this.resolveTargetPeer(peer);
    const result = await this.client.sendFile(targetPeer, options);
    
    return this.sanitizeResult(result);
  }

  /**
   * Get dialogs/channels
   * @param {DialogOptions} options - Query options
   * @returns {Promise<any[]>}
   */
  async getDialogs(options: DialogOptions = {}): Promise<any[]> {
    this.validateConnection();
    return await this.getDialogsImpl(options);
  }

  /**
   * Get messages from a channel/chat
   * @param {string} peer - Target peer
   * @param {any} options - Query options
   * @returns {Promise<any[]>}
   */
  async getMessages(peer: string, options: any = {}): Promise<any[]> {
    this.validateConnection();
    return await this.client.getMessages(peer, options);
  }

  /**
   * Validate configuration for this strategy
   * @returns {void}
   * @throws {Error} If configuration is invalid
   */
  validateConfig(): void {
    throw new Error('validateConfig() must be implemented by subclass');
  }

  /**
   * Get strategy mode identifier
   * @returns {string}
   */
  getMode(): string {
    throw new Error('getMode() must be implemented by subclass');
  }

  /**
   * Resolve target peer based on strategy-specific logic
   * @param {string} peer - Input peer
   * @returns {string} Resolved peer
   */
  resolveTargetPeer(peer: string): string {
    return peer; // Default implementation, can be overridden
  }

  /**
   * Get dialogs implementation (strategy-specific)
   * @param {DialogOptions} options - Query options
   * @returns {Promise<any[]>}
   */
  async getDialogsImpl(options: DialogOptions): Promise<any[]> {
    return await this.client.getDialogs(options);
  }

  /**
   * Format channel/dialog data
   * @param {any[]} dialogs - Raw dialogs from client
   * @returns {ChannelInfo[]} Formatted channels
   */
  formatChannels(dialogs: any[]): ChannelInfo[] {
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
  isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }
}

export { TelegramClientStrategy };
export default TelegramClientStrategy;