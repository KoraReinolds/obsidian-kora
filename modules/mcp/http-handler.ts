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
		const endpoint = this.endpoints.get(url);
		
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

			// Вызываем handler эндпоинта
			const result = await endpoint.handler(this.app, input);
			
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(result));
		} catch (error: any) {
			console.error(`Error in endpoint ${url}:`, error);
			
			const statusCode = error.message === 'File not found' ? 404 : 400;
			res.writeHead(statusCode, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ 
				error: error.message || 'Internal server error' 
			}));
		}
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
