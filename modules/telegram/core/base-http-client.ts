/**
 * Base HTTP client for GramJS server communication
 * Provides common functionality for all HTTP operations
 */

import { Notice } from 'obsidian';
import { TELEGRAM_CONSTANTS } from './constants';

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
	 * Make HTTP request with error handling and timeout
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
			if (error.name === 'AbortError') {
				throw new Error(`Request timeout after ${timeout}ms`);
			}
			throw error;
		}
	}

	/**
	 * Parse error response from server
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
	 * Handle request with automatic error notification
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
			new Notice(`${errorMessage}: ${error.message}`);
			return null;
		}
	}

	/**
	 * Check if server is reachable
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
	 * Update client configuration
	 */
	updateConfig(newConfig: Partial<HttpClientConfig>): void {
		this.config = { ...this.config, ...newConfig };
		this.baseUrl = `http://${this.config.host}:${this.config.port}`;
	}

	/**
	 * Get current configuration
	 */
	getConfig(): HttpClientConfig {
		return { ...this.config };
	}
}
