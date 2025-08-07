/**
 * Bridge for communicating with standalone GramJS server
 * Handles HTTP requests to the Node.js GramJS server
 */

import { Notice } from 'obsidian';

interface GramJSBridgeConfig {
  host: string;
  port: number;
  timeout: number;
}

interface SendMessageRequest {
  peer: string;
  message: string;
  entities?: MessageEntity[];
  parseMode?: string;
  buttons?: InlineButton[][];
}

interface InlineButton {
  text: string;
  url?: string;
  data?: string;
}

interface MessageEntity {
  type: string;
  offset: number;
  length: number;
  custom_emoji_id?: string;
}

interface SendFileRequest {
  peer: string;
  filePath: string;
  caption?: string;
}

interface SendNoteAsImageRequest {
  peer: string;
  content: string;
  title?: string;
  buttons?: InlineButton[][];
}

interface GetMessagesRequest {
  peer: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

interface Channel {
  id: string;
  title: string;
  username?: string;
  type: 'channel' | 'group' | 'chat';
  participantsCount?: number;
  isChannel: boolean;
  isGroup: boolean;
  isUser: boolean;
  accessHash?: string;
  date: Date;
}

interface Message {
  id: number;
  message?: string;
  date: string;
  fromId?: string;
  peerId: any;
  out: boolean;
  mentioned?: boolean;
  mediaUnread?: boolean;
  silent?: boolean;
  post?: boolean;
  fromScheduled?: boolean;
  legacy?: boolean;
  editHide?: boolean;
  pinned?: boolean;
  noforwards?: boolean;
  media?: any;
  views?: number;
  forwards?: number;
  replies?: any;
  editDate?: string;
  postAuthor?: string;
  groupedId?: string;
}

export class GramJSBridge {
  private config: GramJSBridgeConfig;
  private baseUrl: string;

  constructor(config: Partial<GramJSBridgeConfig> = {}) {
    this.config = {
      host: '127.0.0.1',
      port: 8124,
      timeout: 10000,
      ...config
    };
    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
  }

  /**
   * Check if GramJS server is running
   */
  async isServerRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Send text message via GramJS userbot with MarkdownV2 support
   */
  async sendMessage(peer: string, message: string, entities?: MessageEntity[], buttons?: InlineButton[][]): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/send_message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer, message, entities, buttons } as SendMessageRequest),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      return true;
    } catch (error) {
      console.error('Error sending message via GramJS:', error);
      new Notice(`Ошибка отправки сообщения: ${error.message}`);
      return false;
    }
  }

  /**
   * Send file via GramJS userbot
   */
  async sendFile(peer: string, filePath: string, caption?: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/send_file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer, filePath, caption } as SendFileRequest),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send file');
      }

      return true;
    } catch (error) {
      console.error('Error sending file via GramJS:', error);
      new Notice(`Ошибка отправки файла: ${error.message}`);
      return false;
    }
  }

  /**
   * Send note content as image via GramJS userbot
   */
  async sendNoteAsImage(peer: string, content: string, title?: string, buttons?: InlineButton[][]): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/send_note_as_image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer, content, title, buttons } as SendNoteAsImageRequest),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send note as image');
      }

      return true;
    } catch (error) {
      console.error('Error sending note as image via GramJS:', error);
      new Notice(`Ошибка отправки заметки как изображения: ${error.message}`);
      return false;
    }
  }

  /**
   * Get current user info from GramJS
   */
  async getMe(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/me`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get user info');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting user info from GramJS:', error);
      throw error;
    }
  }

  /**
   * Get all channels (chats, groups, channels)
   */
  async getChannels(): Promise<Channel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/channels`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get channels');
      }

      const data = await response.json();
      return data.channels.map((channel: any) => ({
        ...channel,
        date: new Date(channel.date)
      }));
    } catch (error) {
      console.error('Error getting channels from GramJS:', error);
      new Notice(`Ошибка получения каналов: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get messages from a specific channel/chat between dates
   */
  async getMessages(peer: string, startDate?: string, endDate?: string, limit = 100): Promise<Message[]> {
    try {
      const params = new URLSearchParams({ peer, limit: limit.toString() });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`${this.baseUrl}/messages?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get messages');
      }

      const data = await response.json();
      return data.messages;
    } catch (error) {
      console.error('Error getting messages from GramJS:', error);
      new Notice(`Ошибка получения сообщений: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update GramJS server configuration
   */
  async updateConfig(config: {
    mode?: 'bot' | 'userbot';
    botToken?: string;
    apiId?: number;
    apiHash?: string;
    stringSession?: string;
  }): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update configuration');
      }

      const data = await response.json();
      console.log('[updateConfig] Configuration updated:', data.currentConfig);
      return true;
    } catch (error) {
      console.error('Error updating GramJS configuration:', error);
      new Notice(`Ошибка обновления конфигурации GramJS: ${error.message}`);
      return false;
    }
  }

  /**
   * Test connection to GramJS server
   */
  async testConnection(): Promise<boolean> {
    try {
      const isRunning = await this.isServerRunning();
      if (!isRunning) {
        new Notice('GramJS сервер не запущен. Запустите: npm run gramjs-server');
        return false;
      }

      const userInfo = await this.getMe();
      new Notice(`GramJS подключен как: @${userInfo.username}`);
      return true;
    } catch (error) {
      console.error('Error testing GramJS connection:', error);
      new Notice(`Ошибка подключения к GramJS: ${error.message}`);
      return false;
    }
  }
}