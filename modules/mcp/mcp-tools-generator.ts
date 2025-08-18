import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALL_ENDPOINTS } from './endpoints';
import { getMcpUrl, MCP_CONFIG } from './config';

export class McpToolsGenerator {
	/**
	 * Автоматически регистрирует все MCP инструменты из эндпоинтов
	 */
	static registerAllTools(server: McpServer, baseUrl?: string): void {
		const url = baseUrl || getMcpUrl(MCP_CONFIG.DEFAULT_PORT);
		
		for (const endpoint of ALL_ENDPOINTS) {
			server.registerTool(
				endpoint.toolName,
				{
					description: endpoint.description,
					inputSchema: endpoint.inputSchema,
				},
				async (input) => {
					return await endpoint.mcpTool(url, input);
				}
			);
			
			console.log(`✅ Registered MCP tool: ${endpoint.toolName} -> ${endpoint.path}`);
		}
	}

	/**
	 * Получить список всех эндпоинтов для отладки
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
}
