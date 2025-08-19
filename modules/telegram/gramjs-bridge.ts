/**
 * Bridge for communicating with standalone GramJS server
 * Handles HTTP requests to the Node.js GramJS server
 */

import { Notice } from 'obsidian';
import type {
  GramJSBridgeConfig,
  SendMessageRequest,
  EditMessageRequest,
  SendFileRequest,
  GetMessagesRequest,
  SendMessageResponse,
  Channel,
  ChannelsResponse,
  Message,
  MessagesResponse,
  GramJSConfig,
  ConfigResponse,
  UserInfo
} from '../../telegram-types';

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
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    try {
      const requestData: SendMessageRequest = request;
      
      const response = await fetch(`${this.baseUrl}/send_message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      const result: SendMessageResponse = await response.json();
      return {
        ...result,
        messageId: result.result?.messageId || result.result?.id,
      };
    } catch (error) {
      console.error('Error sending message via GramJS:', error);
      new Notice(`Ошибка отправки сообщения: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * Edit existing message via GramJS userbot
   */
  async editMessage(request: EditMessageRequest): Promise<boolean> {
    try {
      const requestData: EditMessageRequest = request;
      
      const response = await fetch(`${this.baseUrl}/edit_message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to edit message');
      }

      return true;
    } catch (error) {
      console.error('Error editing message via GramJS:', error);
      new Notice(`Ошибка редактирования сообщения: ${error.message}`);
      return false;
    }
  }

  /**
   * Send file via GramJS userbot
   */
  async sendFile(request: SendFileRequest): Promise<boolean> {
    try {
      const requestData: SendFileRequest = request;
      
      const response = await fetch(`${this.baseUrl}/send_file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
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
   * Get current user info from GramJS
   */
  async getMe(): Promise<UserInfo> {
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

      const data: ChannelsResponse = await response.json();
      return data.channels.map((channel) => ({
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
  async getMessages(request: GetMessagesRequest): Promise<Message[]> {
    try {
      const { peer, startDate, endDate, limit = 100 } = request;
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

      const data: MessagesResponse = await response.json();
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
  async updateConfig(config: GramJSConfig): Promise<boolean> {
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

      const data: ConfigResponse = await response.json();
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