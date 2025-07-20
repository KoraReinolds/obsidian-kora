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
  async sendMessage(peer: string, message: string, entities?: MessageEntity[]): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/send_message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer, message, entities } as SendMessageRequest),
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
  async sendNoteAsImage(peer: string, content: string, title?: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/send_note_as_image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer, content, title } as SendNoteAsImageRequest),
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