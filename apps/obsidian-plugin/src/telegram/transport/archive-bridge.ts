import { Notice } from 'obsidian';
import {
	BaseHttpClient,
	type HttpClientConfig,
} from '../core/base-http-client';
import type {
	ArchiveChat,
	ArchiveBackfillRequest,
	ArchiveBackfillResponse,
	ArchiveChatsResponse,
	ArchiveDeleteChatResponse,
	ArchiveMessage,
	ArchiveMessageResponse,
	ArchiveMessagesResponse,
	ArchiveSyncRequest,
	ArchiveSyncResponse,
	ArchiveSyncState,
	ArchiveSyncStateResponse,
	ConfigResponse,
	GetArchivedMessagesRequest,
	GramJSConfig,
	GramJSBridgeConfig,
} from '../../../../../packages/contracts/src/telegram';

/**
 * @description HTTP-клиент на стороне Obsidian для работы с архивом Telegram.
 */
export class ArchiveBridge extends BaseHttpClient {
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
	 * @description Обновляет runtime-конфиг archive server.
	 * @param {GramJSConfig} config - Конфигурация для POST `/config`.
	 * @returns {Promise<boolean>}
	 */
	async updateArchiveServerConfig(config: GramJSConfig): Promise<boolean> {
		const response = await this.handleRequest<ConfigResponse>(
			'/config',
			{ method: 'POST', body: config },
			'Ошибка обновления конфигурации архива'
		);

		return response?.success === true;
	}

	/**
	 * @description Запускает один прогон синхронизации архива для peer.
	 * @param {ArchiveSyncRequest} request - Параметры синка.
	 * @returns {Promise<NonNullable<ArchiveSyncResponse['result']>>}
	 */
	async syncArchive(
		request: ArchiveSyncRequest
	): Promise<NonNullable<ArchiveSyncResponse['result']>> {
		const response = await this.handleRequest<ArchiveSyncResponse>(
			'/archive/sync',
			{ method: 'POST', body: request, timeout: 60000 },
			'Ошибка синхронизации архива'
		);

		if (!response?.result) {
			throw new Error(response?.error || 'Не удалось синхронизировать архив');
		}

		return response.result;
	}

	/**
	 * @description Запускает ручную догрузку более старой истории.
	 * @param {ArchiveBackfillRequest} request - Параметры backfill.
	 * @returns {Promise<NonNullable<ArchiveBackfillResponse['result']>>}
	 */
	async backfillArchive(
		request: ArchiveBackfillRequest
	): Promise<NonNullable<ArchiveBackfillResponse['result']>> {
		const response = await this.handleRequest<ArchiveBackfillResponse>(
			'/archive/backfill',
			{ method: 'POST', body: request, timeout: 60000 },
			'Ошибка догрузки старых сообщений'
		);

		if (!response?.result) {
			throw new Error(
				response?.error || 'Не удалось догрузить старые сообщения'
			);
		}

		return response.result;
	}

	/**
	 * @description Возвращает архивные чаты с количеством сообщений.
	 * @param {number} limit - Максимум чатов в ответе.
	 * @returns {Promise<ArchiveChat[]>}
	 */
	async getArchivedChats(limit = 100): Promise<ArchiveChat[]> {
		const response = await this.handleRequest<ArchiveChatsResponse>(
			`/archive/chats?limit=${limit}`,
			{},
			'Ошибка получения архивных чатов'
		);

		return response?.chats || [];
	}

	/**
	 * @description Удаляет чат и его историю из локального архива.
	 * @param {string} chatId - Идентификатор чата.
	 * @returns {Promise<{ deleted: boolean }>}
	 */
	async deleteArchivedChat(chatId: string): Promise<{ deleted: boolean }> {
		const trimmed = chatId.trim();
		if (!trimmed) {
			throw new Error('chatId не задан');
		}

		const response = await this.handleRequest<ArchiveDeleteChatResponse>(
			`/archive/chat/${encodeURIComponent(trimmed)}`,
			{ method: 'DELETE' },
			'Ошибка удаления чата из архива'
		);

		if (!response) {
			throw new Error('Не удалось удалить чат из архива');
		}

		if (!response.success) {
			throw new Error(response.error || 'Не удалось удалить чат из архива');
		}

		return { deleted: response.deleted === true };
	}

	/**
	 * @description Возвращает страницу архивных сообщений для чата.
	 * @param {GetArchivedMessagesRequest} request - Параметры пагинации.
	 * @returns {Promise<ArchiveMessagesResponse>}
	 */
	async getArchivedMessages(
		request: GetArchivedMessagesRequest
	): Promise<ArchiveMessagesResponse> {
		const params = new URLSearchParams({
			chatId: request.chatId,
			limit: String(request.limit ?? 100),
			offset: String(request.offset ?? 0),
		});
		const response = await this.handleRequest<ArchiveMessagesResponse>(
			`/archive/messages?${params.toString()}`,
			{},
			'Ошибка получения архивных сообщений'
		);

		if (!response) {
			throw new Error('Не удалось получить архивные сообщения');
		}

		return response;
	}

	/**
	 * @description Возвращает состояние синхронизации архива.
	 * @param {string | undefined} chatId - Необязательный фильтр по чату.
	 * @returns {Promise<ArchiveSyncState[] | ArchiveSyncState | null>}
	 */
	async getArchiveSyncState(
		chatId?: string
	): Promise<ArchiveSyncState[] | ArchiveSyncState | null> {
		const endpoint = chatId
			? `/archive/sync_state?chatId=${encodeURIComponent(chatId)}`
			: '/archive/sync_state';
		const response = await this.handleRequest<ArchiveSyncStateResponse>(
			endpoint,
			{},
			'Ошибка получения статуса архива'
		);

		if (!response) {
			return null;
		}

		return chatId ? response.state || null : response.states || [];
	}

	/**
	 * @description Читает одно архивное сообщение по первичному ключу.
	 * @param {string} messagePk - Ключ записи в архиве.
	 * @returns {Promise<ArchiveMessage | null>}
	 */
	async getArchivedMessage(messagePk: string): Promise<ArchiveMessage | null> {
		const response = await this.handleRequest<ArchiveMessageResponse>(
			`/archive/message/${encodeURIComponent(messagePk)}`,
			{},
			'Ошибка получения архивного сообщения'
		);

		return response?.message || null;
	}

	/**
	 * @description Проверяет доступность API архива и показывает краткий Notice.
	 * @returns {Promise<boolean>}
	 */
	async testConnection(): Promise<boolean> {
		try {
			const reachable = await this.isServerReachable();
			if (!reachable) {
				new Notice('GramJS сервер архива недоступен.');
				return false;
			}

			const chats = await this.getArchivedChats(5);
			new Notice(`Архив Telegram доступен. Чатов в архиве: ${chats.length}`);
			return true;
		} catch (error) {
			console.error('Error testing archive connection:', error);
			new Notice(
				`Ошибка подключения к архиву Telegram: ${(error as Error).message}`
			);
			return false;
		}
	}
}
