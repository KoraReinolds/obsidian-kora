import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z, type ZodRawShape } from 'zod';
import { ALL_ENDPOINTS } from './endpoints';
import type { McpEndpointDefinition } from './endpoints';
import { getMcpUrl, MCP_CONFIG } from './config';

export class McpToolsGenerator {
	/**
	 * @description Автоматически регистрирует все MCP-инструменты из endpoint-реестра.
	 * SDK ожидает raw shape, а не целый `ZodObject`, поэтому здесь делаем адаптацию.
	 * @param {McpServer} server - MCP server instance.
	 * @param {string} [baseUrl] - Базовый URL Kora MCP server.
	 * @returns {void}
	 */
	static registerAllTools(server: McpServer, baseUrl?: string): void {
		const url = baseUrl || getMcpUrl(MCP_CONFIG.DEFAULT_PORT);

		for (const endpoint of ALL_ENDPOINTS) {
			this.registerEndpointTool(server, endpoint, url);
		}
	}

	/**
	 * @description Возвращает краткую сводку по всем зарегистрируемым endpoint-ам.
	 * @returns {Array<{ toolName: string; path: string; method: string; description: string }>}
	 */
	static getEndpointsSummary(): Array<{
		toolName: string;
		path: string;
		method: string;
		description: string;
	}> {
		return ALL_ENDPOINTS.map(endpoint => ({
			toolName: endpoint.toolName,
			path: endpoint.path,
			method: endpoint.method,
			description: endpoint.description,
		}));
	}

	/**
	 * @description Регистрирует один endpoint как MCP tool.
	 * @param {McpServer} server - MCP server instance.
	 * @param {McpEndpointDefinition<any, any>} endpoint - Описание endpoint-а.
	 * @param {string} baseUrl - Базовый URL Kora MCP server.
	 * @returns {void}
	 */
	private static registerEndpointTool(
		server: McpServer,
		endpoint: McpEndpointDefinition<any, any>,
		baseUrl: string
	): void {
		server.registerTool(
			endpoint.toolName,
			{
				description: endpoint.description,
				inputSchema: this.toRawShape(endpoint),
			},
			async input => {
				return await endpoint.mcpTool(baseUrl, input as any);
			}
		);

		console.log(
			`Registered MCP tool: ${endpoint.toolName} -> ${endpoint.path}`
		);
	}

	/**
	 * @description Приводит endpoint schema к формату `ZodRawShape`, который ожидает MCP SDK.
	 * Для zero-arg endpoint-ов возвращает пустую shape.
	 * @param {McpEndpointDefinition<any, any>} endpoint - Описание endpoint-а.
	 * @returns {ZodRawShape}
	 */
	private static toRawShape(
		endpoint: McpEndpointDefinition<any, any>
	): ZodRawShape {
		return endpoint.inputSchema instanceof z.ZodObject
			? endpoint.inputSchema.shape
			: {};
	}
}
