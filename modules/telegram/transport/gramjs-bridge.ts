/**
 * @module modules/telegram/transport/gramjs-bridge
 * @description Мост к отдельному серверу GramJS: HTTP-запросы к Node.js GramJS server.
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
} from '../../../packages/contracts/src/telegram';

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
	 * @description Проверяет, запущен ли сервер GramJS.
	 */
	async isServerRunning(): Promise<boolean> {
		return await this.isServerReachable();
	}

	/**
	 * @description Отправляет текст через userbot GramJS с поддержкой MarkdownV2.
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
	 * @description Редактирует существующее сообщение через userbot GramJS.
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
	 * @description Отправляет файл через userbot GramJS.
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
	 * @description Возвращает данные текущего пользователя GramJS (`/me`).
	 */
	async getMe(): Promise<UserInfo> {
		return await this.makeRequest<UserInfo>('/me');
	}

	/**
	 * @description Список каналов, групп и чатов (`/channels`).
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
	 * @description Сообщения чата/канала за интервал дат (`/messages`).
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
	 * @description Обновляет конфигурацию сервера GramJS.
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
	 * @description Проверяет подключение к серверу GramJS.
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
