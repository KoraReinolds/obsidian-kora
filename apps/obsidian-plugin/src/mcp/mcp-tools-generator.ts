import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMcpUrl, MCP_CONFIG } from './config';
import {
	MCP_TOOL_DEFINITIONS,
	callMcpTool,
	getToolInputRawShape,
	type McpToolDefinition,
} from './tool-definitions';

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

		for (const definition of MCP_TOOL_DEFINITIONS) {
			this.registerTool(server, definition, url);
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
		return MCP_TOOL_DEFINITIONS.map(definition => ({
			toolName: definition.toolName,
			path: definition.path,
			method: definition.method,
			description: definition.description,
		}));
	}

	/**
	 * @description Регистрирует один tool из standalone-реестра.
	 * @param {McpServer} server - MCP server instance.
	 * @param {McpToolDefinition<any, any>} definition - Описание MCP-инструмента.
	 * @param {string} baseUrl - Базовый URL Kora MCP server.
	 * @returns {void}
	 */
	private static registerTool(
		server: McpServer,
		definition: McpToolDefinition<any, any>,
		baseUrl: string
	): void {
		const registerTool = server.registerTool as (
			name: string,
			config: {
				description?: string;
				inputSchema?: Record<string, unknown>;
			},
			cb: (input: Record<string, unknown>) => Promise<unknown>
		) => unknown;

		registerTool(
			definition.toolName,
			{
				description: definition.description,
				inputSchema: getToolInputRawShape(definition) as Record<
					string,
					unknown
				>,
			},
			async input => {
				return await callMcpTool(definition, baseUrl, input as any);
			}
		);

		console.log(
			`Registered MCP tool: ${definition.toolName} -> ${definition.path}`
		);
	}
}
