import type { App } from 'obsidian';
import { ALL_ENDPOINTS } from './endpoints';
import type { McpEndpointDefinition } from './endpoints';

export class McpHttpHandler {
	private endpoints: Map<string, McpEndpointDefinition>;

	constructor(private app: App) {
		// Создаем мапу эндпоинтов для быстрого поиска
		this.endpoints = new Map();
		for (const endpoint of ALL_ENDPOINTS) {
			this.endpoints.set(endpoint.path, endpoint);
		}
	}

	async handleRequest(url: string, method: string, req: any, res: any): Promise<void> {
		// Парсим URL, чтобы отделить путь от query
		const parsedUrl = new URL(url, 'http://localhost');
		const path = parsedUrl.pathname;

		const endpoint = this.endpoints.get(path);
		
		if (!endpoint) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Endpoint not found' }));
			return;
		}

		if (endpoint.method !== method) {
			res.writeHead(405, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Method not allowed' }));
			return;
		}

		try {
			let input: any = {};
			
			// Для POST запросов читаем body
			if (method === 'POST') {
				input = await this.readRequestBody(req);
			}

			// Для GET запросов читаем query параметры
			if (method === 'GET' && parsedUrl.search) {
				input = this.parseQuery(parsedUrl.searchParams);
			}

			// Вызываем handler эндпоинта
			const result = await endpoint.handler(this.app, input);
			
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(result));
		} catch (error: any) {
			console.error(`Error in endpoint ${path}:`, error);
			
			const statusCode = error.message === 'File not found' ? 404 : 400;
			res.writeHead(statusCode, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ 
				error: error.message || 'Internal server error' 
			}));
		}
	}

	private parseQuery(params: URLSearchParams): any {
		const input: any = {};
		const arrayKeys = new Set(['include', 'exclude']);
		const booleanKeys = new Set(['includeContent', 'includeTitle']);

		for (const [rawKey, rawValue] of params.entries()) {
			const key = rawKey.endsWith('[]') ? rawKey.slice(0, -2) : rawKey;
			const isArrayKey = arrayKeys.has(key) || rawKey.endsWith('[]');
			const splitValues = rawValue.includes(',')
				? rawValue.split(',').map(v => v.trim()).filter(Boolean)
				: [rawValue];

			const coerce = (k: string, v: string) => {
				if (booleanKeys.has(k)) {
					return v === 'true' || v === '1';
				}
				return v;
			};

			if (isArrayKey) {
				if (!Array.isArray(input[key])) input[key] = [];
				input[key].push(...splitValues.map(v => coerce(key, v)));
			} else {
				const coercedValues = splitValues.map(v => coerce(key, v));
				if (key in input) {
					if (Array.isArray(input[key])) {
						input[key].push(...coercedValues);
					} else {
						input[key] = [input[key], ...coercedValues];
					}
				} else {
					input[key] = coercedValues.length === 1 ? coercedValues[0] : coercedValues;
				}
			}
		}

		// Ensure include/exclude are arrays if present
		if (typeof input.include === 'string') input.include = [input.include];
		if (typeof input.exclude === 'string') input.exclude = [input.exclude];

		return input;
	}

	private async readRequestBody(req: any): Promise<any> {
		return new Promise((resolve, reject) => {
			let body = '';
			req.on('data', (chunk: Buffer) => {
				body += chunk.toString();
			});
			req.on('end', () => {
				try {
					resolve(JSON.parse(body));
				} catch (error) {
					reject(new Error('Invalid JSON in request body'));
				}
			});
			req.on('error', reject);
		});
	}

	// Оставляем для обратной совместимости, но теперь используем новую логику
	getEndpoints(): Record<string, any> {
		const legacyEndpoints: Record<string, any> = {};
		
		for (const endpoint of ALL_ENDPOINTS) {
			legacyEndpoints[endpoint.path] = async (app: App, req: any, res: any) => {
				await this.handleRequest(endpoint.path, endpoint.method, req, res);
			};
		}
		
		return legacyEndpoints;
	}

}