/**
 * Bridge for communicating with standalone GramJS server
 * Handles HTTP requests to the Node.js GramJS server
 */

import { Notice } from 'obsidian';
import {
	BaseHttpClient,
	type HttpClientConfig,
} from '../core/base-http-client';
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
	UserInfo,
} from '../../../telegram-types';

export class GramJSBridge extends BaseHttpClient {
	constructor(config: Partial<GramJSBridgeConfig> = {}) {
		// Convert GramJSBridgeConfig to HttpClientConfig with proper defaults
		const httpConfig: Partial<HttpClientConfig> = {};

		if (config.host !== undefined) {
			httpConfig.host = config.host;
		}
		if (config.port !== undefined) {
			httpConfig.port = config.port;
		}
		if (config.timeout !== undefined) {
			httpConfig.timeout = config.timeout;
		}

		super(httpConfig);
	}

	/**
	 * Check if GramJS server is running
	 */
	async isServerRunning(): Promise<boolean> {
		return await this.isServerReachable();
	}

	/**
	 * Send text message via GramJS userbot with MarkdownV2 support
	 */
	async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
		const result = await this.handleRequest<SendMessageResponse>(
			'/send_message',
			{ method: 'POST', body: request },
			'Ошибка отправки сообщения'
		);

		if (result) {
			return {
				...result,
				messageId: result.result?.messageId || result.result?.id,
			};
		}

		return { success: false };
	}

	/**
	 * Edit existing message via GramJS userbot
	 */
	async editMessage(request: EditMessageRequest): Promise<boolean> {
		const result = await this.handleRequest(
			'/edit_message',
			{ method: 'POST', body: request },
			'Ошибка редактирования сообщения'
		);

		return result !== null;
	}

	/**
	 * Send file via GramJS userbot
	 */
	async sendFile(request: SendFileRequest): Promise<boolean> {
		const result = await this.handleRequest(
			'/send_file',
			{ method: 'POST', body: request },
			'Ошибка отправки файла'
		);

		return result !== null;
	}

	/**
	 * Get current user info from GramJS
	 */
	async getMe(): Promise<UserInfo> {
		return await this.makeRequest<UserInfo>('/me');
	}

	/**
	 * Get all channels (chats, groups, channels)
	 */
	async getChannels(): Promise<Channel[]> {
		const data = await this.handleRequest<ChannelsResponse>(
			'/channels',
			{},
			'Ошибка получения каналов'
		);

		if (data) {
			return data.channels.map(channel => ({
				...channel,
				date: new Date(channel.date),
			}));
		}

		throw new Error('Failed to get channels');
	}

	/**
	 * Get messages from a specific channel/chat between dates
	 */
	async getMessages(request: GetMessagesRequest): Promise<Message[]> {
		const { peer, startDate, endDate, limit = 100 } = request;
		const params = new URLSearchParams({ peer, limit: limit.toString() });
		if (startDate) params.append('startDate', startDate);
		if (endDate) params.append('endDate', endDate);

		const data = await this.handleRequest<MessagesResponse>(
			`/messages?${params.toString()}`,
			{},
			'Ошибка получения сообщений'
		);

		if (data) {
			return data.messages;
		}

		throw new Error('Failed to get messages');
	}

	/**
	 * Update GramJS server configuration
	 */
	async updateGramJSConfig(config: GramJSConfig): Promise<boolean> {
		const data = await this.handleRequest<ConfigResponse>(
			'/config',
			{ method: 'POST', body: config },
			'Ошибка обновления конфигурации GramJS'
		);

		if (data) {
			console.log('[updateConfig] Configuration updated:', data.currentConfig);
			return true;
		}

		return false;
	}

	/**
	 * Test connection to GramJS server
	 */
	async testConnection(): Promise<boolean> {
		try {
			const isRunning = await this.isServerRunning();
			if (!isRunning) {
				new Notice(
					'GramJS сервер не запущен. Запустите: npm run gramjs-server'
				);
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
