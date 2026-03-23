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
} from '../../../../../packages/contracts/src/telegram';

export class GramJSBridge extends BaseHttpClient {
	constructor(config: Partial<GramJSBridgeConfig> = {}) {
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
	 * @description Проверяет, запущен ли Kora server.
	 * @returns {Promise<boolean>}
	 */
	async isServerRunning(): Promise<boolean> {
		return await this.isServerReachable();
	}

	/**
	 * @description Отправляет текст через Kora server с поддержкой MarkdownV2.
	 * @param {SendMessageRequest} request - Параметры отправки.
	 * @returns {Promise<SendMessageResponse>}
	 */
	async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
		const result = await this.handleRequest<SendMessageResponse>(
			'/send_message',
			{ method: 'POST', body: request, timeout: 60000 },
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
	 * @description Редактирует существующее сообщение через Kora server.
	 * @param {EditMessageRequest} request - Параметры редактирования.
	 * @returns {Promise<boolean>}
	 */
	async editMessage(request: EditMessageRequest): Promise<boolean> {
		const result = await this.handleRequest(
			'/edit_message',
			{ method: 'POST', body: request, timeout: 60000 },
			'Ошибка редактирования сообщения'
		);

		return result !== null;
	}

	/**
	 * @description Отправляет файл через Kora server.
	 * @param {SendFileRequest} request - Параметры отправки.
	 * @returns {Promise<boolean>}
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
	 * @description Возвращает данные текущего пользователя Kora server.
	 * @returns {Promise<UserInfo>}
	 */
	async getMe(): Promise<UserInfo> {
		return await this.makeRequest<UserInfo>('/me');
	}

	/**
	 * @description Возвращает список каналов, групп и чатов.
	 * @returns {Promise<Channel[]>}
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
	 * @description Возвращает сообщения чата или канала за интервал дат.
	 * @param {GetMessagesRequest} request - Параметры выборки.
	 * @returns {Promise<Message[]>}
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
	 * @description Обновляет runtime-конфигурацию Kora server.
	 * @param {GramJSConfig} config - Новая конфигурация.
	 * @returns {Promise<boolean>}
	 */
	async updateGramJSConfig(config: GramJSConfig): Promise<boolean> {
		const data = await this.handleRequest<ConfigResponse>(
			'/config',
			{ method: 'POST', body: config },
			'Ошибка обновления конфигурации Kora server'
		);

		if (data) {
			console.log('[updateConfig] Configuration updated:', data.currentConfig);
			return true;
		}

		return false;
	}

	/**
	 * @description Проверяет подключение к Kora server и показывает Notice.
	 * @returns {Promise<boolean>}
	 */
	async testConnection(): Promise<boolean> {
		try {
			const isRunning = await this.isServerRunning();
			if (!isRunning) {
				new Notice('Kora сервер не запущен. Запустите: npm run kora-server');
				return false;
			}

			const userInfo = await this.getMe();
			new Notice(
				`Telegram подключен через Kora server как: @${userInfo.username}`
			);
			return true;
		} catch (error) {
			console.error('Error testing Kora server connection:', error);
			new Notice(
				`Ошибка подключения к Kora server: ${(error as Error).message}`
			);
			return false;
		}
	}
}
