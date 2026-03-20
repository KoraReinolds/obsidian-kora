/**
 * @module telegram/transport/archive-bridge
 *
 * @description Мост к HTTP API архива Telegram, который отдаёт gramjs-server.
 * Скрывает от UI Obsidian конкретные пути маршрутов и централизует обработку ошибок
 * для операций с архивом.
 */

import { Notice } from 'obsidian';
import {
	BaseHttpClient,
	type HttpClientConfig,
} from '../core/base-http-client';
import type {
	ArchiveChat,
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
} from '../../../telegram-types';

/**
 * @description HTTP-клиент на стороне Obsidian: чтение архива и запуск синка.
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
	 * @async
	 * @description Обновляет runtime-конфиг на том gramjs-server, который обслуживает архив.
	 * Нужно, когда архив живёт на отдельном userbot-порту и должен получить тот же путь к SQLite.
	 * @param {GramJSConfig} config - Конфиг GramJS/архива для POST `/config`.
	 * @returns {Promise<boolean>} true, если сервер принял конфиг.
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
	 * @async
	 * @description Запускает один прогон синхронизации архива для указанного peer.
	 * @param {ArchiveSyncRequest} request - Peer и параметры синка.
	 * @returns {Promise<NonNullable<ArchiveSyncResponse['result']>>} Полезная нагрузка результата синка.
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
	 * @async
	 * @description Возвращает архивные чаты с количеством сообщений.
	 * @param {number} limit - Максимум чатов в ответе.
	 * @returns {Promise<ArchiveChat[]>} Список чатов из архива.
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
	 * @async
	 * @description Удаляет чат и всю его историю из локального архива (SQLite на gramjs-server), без затрагивания Telegram.
	 * @param {string} chatId - Идентификатор чата в архиве.
	 * @returns {Promise<{ deleted: boolean }>} deleted — строка в `chats` была удалена; false если чата не было в архиве.
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
	 * @async
	 * @description Returns paginated archived messages for a chat.
	 * @param {GetArchivedMessagesRequest} request - Chat and pagination options.
	 * @returns {Promise<ArchiveMessagesResponse>} Paginated message payload.
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
	 * @async
	 * @description Возвращает состояние синка для одного чата или для всех.
	 * @param {string | undefined} chatId - Необязательный фильтр по чату.
	 * @returns {Promise<ArchiveSyncState[] | ArchiveSyncState | null>} Состояние(я) синхронизации.
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
	 * @async
	 * @description Читает одно архивное сообщение по стабильному первичному ключу.
	 * @param {string} messagePk - Ключ строки сообщения в архиве.
	 * @returns {Promise<ArchiveMessage | null>} Сообщение или null.
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
	 * @async
	 * @description Проверяет доступность API архива и показывает краткий Notice пользователю.
	 * @returns {Promise<boolean>} true, если запрос к API выполнен успешно.
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
