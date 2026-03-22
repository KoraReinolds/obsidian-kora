import { Notice } from 'obsidian';
import { TELEGRAM_CONSTANTS } from '../../../../../packages/kora-core/src/telegram/core/constants.js';

export interface HttpClientConfig {
	host?: string;
	port?: number;
	timeout?: number;
	headers?: Record<string, string>;
}

export interface HttpError {
	message: string;
	status?: number;
	code?: string;
}

export class BaseHttpClient {
	protected config: Required<HttpClientConfig>;
	protected baseUrl: string;

	constructor(config: Partial<HttpClientConfig> = {}) {
		this.config = {
			host: TELEGRAM_CONSTANTS.DEFAULT_HOST,
			port: TELEGRAM_CONSTANTS.DEFAULT_GRAMJS_PORT,
			timeout: TELEGRAM_CONSTANTS.DEFAULT_TIMEOUT,
			headers: { ...TELEGRAM_CONSTANTS.DEFAULT_HEADERS },
			...config,
		};
		this.baseUrl = `http://${this.config.host}:${this.config.port}`;
	}

	/**
	 * @description Выполняет HTTP-запрос с таймаутом и базовой обработкой ошибок.
	 * @param {string} endpoint - Путь endpoint на сервере.
	 * @param {object} options - Параметры запроса.
	 * @returns {Promise<T>}
	 */
	protected async makeRequest<T>(
		endpoint: string,
		options: {
			method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
			body?: any;
			headers?: Record<string, string>;
			timeout?: number;
		} = {}
	): Promise<T> {
		const {
			method = 'GET',
			body,
			headers: customHeaders = {},
			timeout = this.config.timeout,
		} = options;

		const url = `${this.baseUrl}${endpoint}`;
		const headers = { ...this.config.headers, ...customHeaders };

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			const response = await fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = await this.parseErrorResponse(response);
				throw new Error(
					errorData.message || `HTTP ${response.status}: ${response.statusText}`
				);
			}

			return await response.json();
		} catch (error) {
			if ((error as Error).name === 'AbortError') {
				throw new Error(`Request timeout after ${timeout}ms`);
			}
			throw error;
		}
	}

	/**
	 * @description Преобразует ошибочный HTTP-ответ в единый формат.
	 * @param {Response} response - Ответ сервера.
	 * @returns {Promise<HttpError>}
	 */
	private async parseErrorResponse(response: Response): Promise<HttpError> {
		try {
			const errorData = await response.json();
			return {
				message: errorData.error || errorData.message || 'Unknown error',
				status: response.status,
				code: errorData.code,
			};
		} catch {
			return {
				message: response.statusText || 'Unknown error',
				status: response.status,
			};
		}
	}

	/**
	 * @description Выполняет запрос и показывает Notice при ошибке.
	 * @param {string} endpoint - Путь endpoint.
	 * @param {object} options - Параметры запроса.
	 * @param {string} errorMessage - Базовый текст ошибки.
	 * @returns {Promise<T | null>}
	 */
	protected async handleRequest<T>(
		endpoint: string,
		options: Parameters<typeof this.makeRequest>[1] = {},
		errorMessage = 'Request failed'
	): Promise<T | null> {
		try {
			return await this.makeRequest<T>(endpoint, options);
		} catch (error) {
			console.error(`${errorMessage}:`, error);
			new Notice(`${errorMessage}: ${(error as Error).message}`);
			return null;
		}
	}

	/**
	 * @description Проверяет, отвечает ли сервер на `/health`.
	 * @returns {Promise<boolean>}
	 */
	async isServerReachable(): Promise<boolean> {
		try {
			await this.makeRequest('/health', { timeout: 5000 });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * @description Обновляет локальную конфигурацию клиента.
	 * @param {Partial<HttpClientConfig>} newConfig - Новые значения.
	 * @returns {void}
	 */
	updateConfig(newConfig: Partial<HttpClientConfig>): void {
		this.config = { ...this.config, ...newConfig };
		this.baseUrl = `http://${this.config.host}:${this.config.port}`;
	}

	/**
	 * @description Возвращает текущую конфигурацию клиента.
	 * @returns {HttpClientConfig}
	 */
	getConfig(): HttpClientConfig {
		return { ...this.config };
	}
}
