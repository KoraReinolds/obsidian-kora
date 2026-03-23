/**
 * @module obsidian-plugin/vector/vector-bridge
 * @description Мост для обмена с векторными сервисами на сервере GramJS.
 */

import { Notice } from 'obsidian';
import { chunkNote } from '../../../../packages/kora-core/src/chunking/index.js';

interface VectorBridgeConfig {
	host: string;
	port: number;
	timeout: number;
}

interface VectorizeRequest {
	id: string;
	contentType: 'telegram_post' | 'telegram_comment' | 'obsidian_note';
	title?: string;
	content: string;
	metadata?: any;
}

interface VectorizeMessagesRequest {
	peer: string;
	startDate?: string;
	endDate?: string;
	limit?: number;
}

interface SearchRequest {
	query: string;
	limit?: number;
	contentTypes?: string[];
	filters?: Record<string, any>;
	scoreThreshold?: number;
	/** Только для semantic backend sqlite: вес FTS в `vectorScore + lexical * weight`. */
	lexicalBoostWeight?: number;
	/** Отрицательные фильтры по текущему контексту, чтобы исключить self-match до `limit`. */
	exclude?: {
		chunkId?: string;
		originalId?: string;
		filePath?: string;
	};
}

interface VectorStats {
	totalPoints: number;
	vectorSize: number;
	contentTypeBreakdown: Record<string, number>;
	status: string;
	backend?: 'sqlite';
	databasePath?: string;
}

export interface SearchResult {
	id: string;
	score: number;
	content: any;
	snippet: string;
	scoreDetails?: {
		mode: 'hybrid' | 'vector' | 'lexical_fallback';
		vectorScore: number | null;
		lexicalScore: number | null;
		lexicalContribution: number | null;
		lexicalBoostWeight: number | null;
		combinedScore: number;
	};
}

export interface VectorStoredContentRecord {
	pointId: string;
	payload: any;
}

export interface VectorHealthResponse {
	status: 'healthy' | 'unhealthy' | 'unavailable' | 'error';
	backend?: 'sqlite';
	databasePath?: string;
	embeddingModel?: string;
	embeddingBaseUrl?: string;
	stats?: VectorStats;
	error?: string;
}

export class VectorBridge {
	private config: VectorBridgeConfig;
	private baseUrl: string;

	constructor(config: Partial<VectorBridgeConfig> = {}) {
		this.config = {
			host: '127.0.0.1',
			port: 8124,
			timeout: 30000,
			...config,
		};
		this.baseUrl = `http://${this.config.host}:${this.config.port}`;
	}

	/**
	 * @description Проверяет доступность векторного сервиса по health endpoint.
	 * @returns {Promise<boolean>}
	 */
	async isVectorServiceHealthy(): Promise<boolean> {
		try {
			const health = await this.getVectorHealthDetails();
			return health.status === 'healthy';
		} catch {
			return false;
		}
	}

	/**
	 * @description Возвращает полный health-payload векторного backend.
	 * @returns {Promise<VectorHealthResponse>}
	 */
	async getVectorHealthDetails(): Promise<VectorHealthResponse> {
		const response = await fetch(`${this.baseUrl}/vector_health`, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' },
		});
		return await response.json();
	}

	/**
	 * @description Векторизует единицу контента через универсальный endpoint.
	 * @param {VectorizeRequest} request - Параметры векторизации.
	 * @returns {Promise<any>}
	 */
	async vectorizeContent(request: VectorizeRequest): Promise<any> {
		try {
			const response = await fetch(`${this.baseUrl}/vectorize`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(request),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to vectorize content');
			}

			return await response.json();
		} catch (error) {
			console.error('Error vectorizing content:', error);
			new Notice(`Ошибка векторизации: ${(error as Error).message}`);
			throw error;
		}
	}

	/**
	 * @description Пакетно векторизует несколько фрагментов контента.
	 * @param {VectorizeRequest[]} contents - Массив запросов.
	 * @returns {Promise<any>}
	 */
	async batchVectorize(contents: VectorizeRequest[]): Promise<any> {
		try {
			const response = await fetch(`${this.baseUrl}/vectorize`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ batch: contents }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to batch vectorize content');
			}

			return await response.json();
		} catch (error) {
			console.error('Error batch vectorizing content:', error);
			new Notice(`Ошибка батч-векторизации: ${(error as Error).message}`);
			throw error;
		}
	}

	/**
	 * @description Векторизует сообщения Telegram по выбранному peer.
	 * @param {VectorizeMessagesRequest} request - Параметры выборки.
	 * @returns {Promise<any>}
	 */
	async vectorizeMessages(request: VectorizeMessagesRequest): Promise<any> {
		try {
			const response = await fetch(`${this.baseUrl}/vectorize_messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(request),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to vectorize messages');
			}

			return await response.json();
		} catch (error) {
			console.error('Error vectorizing messages:', error);
			new Notice(`Ошибка векторизации сообщений: ${(error as Error).message}`);
			throw error;
		}
	}

	/**
	 * @description Выполняет семантический поиск по проиндексированному контенту.
	 * @param {SearchRequest} request - Параметры поиска.
	 * @returns {Promise<{ results: SearchResult[]; total: number; query: string }>}
	 */
	async searchContent(
		request: SearchRequest
	): Promise<{ results: SearchResult[]; total: number; query: string }> {
		try {
			const response = await fetch(`${this.baseUrl}/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(request),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to search content');
			}

			return await response.json();
		} catch (error) {
			console.error('Error searching content:', error);
			new Notice(`Ошибка поиска: ${(error as Error).message}`);
			throw error;
		}
	}

	/**
	 * @description Получает контент по произвольному полю.
	 * @param {object} params - Параметры фильтрации.
	 * @returns {Promise<VectorStoredContentRecord | VectorStoredContentRecord[] | null>}
	 */
	async getContentBy(params: {
		by: string;
		value: string;
		multiple?: boolean;
		limit?: number;
	}): Promise<VectorStoredContentRecord | VectorStoredContentRecord[] | null> {
		const { by, value, multiple = false, limit = 2048 } = params;
		try {
			const qs = new URLSearchParams({
				by,
				value,
				multiple: String(multiple),
				limit: String(limit),
			});
			const response = await fetch(`${this.baseUrl}/content?${qs.toString()}`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' },
			});

			if (!multiple && response.status === 404) {
				return null;
			}

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to get content');
			}

			const result = await response.json();
			return multiple ? result.contents || [] : result.content || null;
		} catch (error) {
			console.error('Error getting content:', error);
			throw error;
		}
	}

	/**
	 * @description Удаляет все векторы для указанного `originalId`.
	 * @param {string} originalId - Стабильный id заметки.
	 * @returns {Promise<number>}
	 */
	async deleteByOriginalId(originalId: string): Promise<number> {
		try {
			const qs = new URLSearchParams({ by: 'originalId', value: originalId });
			const response = await fetch(`${this.baseUrl}/content?${qs.toString()}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
			});
			if (!response.ok) {
				const error = await response.json();
				throw new Error(
					error.error || 'Failed to delete content by originalId'
				);
			}
			const result = await response.json();
			return Number(result.deleted || 0);
		} catch (error) {
			console.error('Error deleting by originalId:', error);
			return 0;
		}
	}

	/**
	 * @description Удаляет несколько чанков по `chunkId`.
	 * @param {string[]} ids - Список идентификаторов.
	 * @returns {Promise<{ deleted: number; failed: string[] }>}
	 */
	async batchDelete(
		ids: string[]
	): Promise<{ deleted: number; failed: string[] }> {
		if (ids.length === 0) {
			return { deleted: 0, failed: [] };
		}

		const by = 'chunkId';

		try {
			const qs = new URLSearchParams({
				by,
				value: ids.join(','),
			});
			const response = await fetch(`${this.baseUrl}/content?${qs.toString()}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || `Failed to batch delete by ${by}`);
			}

			const result = await response.json();
			return {
				deleted: Number(result.deleted || 0),
				failed: [],
			};
		} catch (error) {
			console.error(`Error batch deleting by ${by}:`, error);
			return { deleted: 0, failed: ids };
		}
	}

	/**
	 * @description Возвращает статистику векторного backend.
	 * @returns {Promise<VectorStats>}
	 */
	async getStats(): Promise<VectorStats> {
		try {
			const response = await fetch(`${this.baseUrl}/vector_stats`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' },
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to get stats');
			}

			return await response.json();
		} catch (error) {
			console.error('Error getting vector stats:', error);
			throw error;
		}
	}

	/**
	 * @description Векторизует заметку Obsidian целиком или по чанкам.
	 * @param {object} file - Дескриптор заметки и ее metadata/cache.
	 * @returns {Promise<any>}
	 */
	async vectorizeNote(file: {
		originalId: string;
		path: string;
		content: string;
		title: string;
		metadata?: any;
		cache?: any;
	}): Promise<any> {
		const frontmatter = file?.metadata?.frontmatter ?? file?.metadata ?? {};
		const tags = Array.isArray(frontmatter?.tags) ? frontmatter.tags : [];
		const aliases = Array.isArray(frontmatter?.aliases)
			? frontmatter.aliases
			: [];
		const { originalId, title } = file;

		if (file.cache) {
			const chunks = chunkNote(
				file.content,
				{ notePath: file.path, originalId, frontmatter, tags, aliases },
				{},
				file.cache as any
			);
			try {
				await this.deleteByOriginalId(originalId);
			} catch (err) {
				console.warn(
					'Failed to delete old vectors before re-indexing (continuing):',
					(err as any)?.message ?? err
				);
			}
			const batch = chunks.map(c => ({
				id: `${originalId}#${c.chunkId}`,
				contentType: 'obsidian_note',
				title,
				content: c.contentRaw,
				metadata: c.meta,
			}));
			return await this.batchVectorize(batch as any);
		}

		try {
			await this.deleteByOriginalId(originalId);
		} catch (err) {
			console.warn(
				'Failed to delete previous vectors for single-note mode:',
				(err as any)?.message ?? err
			);
		}
		return await this.vectorizeContent({
			id: originalId,
			contentType: 'obsidian_note',
			title: file.title,
			content: file.content,
			metadata: {
				obsidian: {
					filePath: file.path,
					fileName: file.title,
					folder: file.path.substring(0, file.path.lastIndexOf('/')) || '/',
					modifiedAt: new Date().toISOString(),
					createdAt: originalId,
					...file.metadata,
				},
			},
		});
	}

	/**
	 * @description Проверяет подключение и показывает статус через Notice.
	 * @returns {Promise<boolean>}
	 */
	async testConnection(): Promise<boolean> {
		try {
			const isHealthy = await this.isVectorServiceHealthy();

			if (!isHealthy) {
				new Notice(
					'Vector service недоступен. Убедитесь, что Kora server запущен с настроенным SQLite backend и OpenAI.'
				);
				return false;
			}

			const stats = await this.getStats();
			new Notice(`Vector service готов: ${stats.totalPoints} документов`);
			return true;
		} catch (error) {
			console.error('Error testing vector connection:', error);
			new Notice(
				`Ошибка подключения к Vector service: ${(error as Error).message}`
			);
			return false;
		}
	}
}
