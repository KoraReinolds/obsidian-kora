import type { App } from 'obsidian';
import type { z } from 'zod';

export interface McpEndpointDefinition<TInput = any, TOutput = any> {
	// Метаданные эндпоинта
	path: string;
	method: 'GET' | 'POST';
	description: string;

	// MCP Tool схема
	toolName: string;
	inputSchema: z.ZodType<TInput> | Record<string, never>;

	// Серверная логика (Obsidian HTTP handler)
	handler: (app: App, input: TInput) => Promise<TOutput>;

	// Клиентская логика (MCP tool implementation)
	mcpTool: (
		baseUrl: string,
		input: TInput
	) => Promise<{
		content: Array<{ type: 'text'; text: string }>;
	}>;
}

export abstract class BaseEndpoint<TInput = any, TOutput = any>
	implements McpEndpointDefinition<TInput, TOutput>
{
	abstract path: string;
	abstract method: 'GET' | 'POST';
	abstract description: string;
	abstract toolName: string;
	abstract inputSchema: z.ZodType<TInput> | Record<string, never>;

	abstract handler(app: App, input: TInput): Promise<TOutput>;

	// Стандартная реализация MCP tool - делает HTTP запрос к серверу
	async mcpTool(
		baseUrl: string,
		input: TInput
	): Promise<{
		content: Array<{ type: 'text'; text: string }>;
	}> {
		const url = `${baseUrl}${this.path}`;

		const fetchOptions: RequestInit = {
			method: this.method,
			headers: { 'Content-Type': 'application/json' },
		};

		if (this.method === 'POST') {
			fetchOptions.body = JSON.stringify(input);
		}

		const res = await fetch(url, fetchOptions);
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		}

		const result = await res.json();
		return this.formatMcpResponse(result);
	}

	// Метод для форматирования ответа в MCP формат - можно переопределить
	protected formatMcpResponse(data: TOutput): {
		content: Array<{ type: 'text'; text: string }>;
	} {
		return {
			content: [
				{ type: 'text', text: `✅ ${this.description}` },
				{ type: 'text', text: JSON.stringify(data, null, 2) },
			],
		};
	}
}
