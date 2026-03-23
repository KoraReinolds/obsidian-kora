#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpToolsGenerator } from './apps/obsidian-plugin/src/mcp/mcp-tools-generator.js';
import {
	MCP_CONFIG,
	getMcpUrl,
} from './apps/obsidian-plugin/src/mcp/config.js';

console.error('[kora] server booted');
const KORA_URL = getMcpUrl(MCP_CONFIG.DEFAULT_PORT);

const server = new McpServer({
	name: 'kora-obsidian-vault',
	version: '0.1.0',
	info: { summary: 'Expose Obsidian vault files through MCP' },
});

// 🚀 Автоматическая регистрация всех MCP инструментов из эндпоинтов
McpToolsGenerator.registerAllTools(server, KORA_URL);

// Отладочная информация
const summary = McpToolsGenerator.getEndpointsSummary();
console.error(`[kora] Registered ${summary.length} MCP tools:`, summary);

// Note: Telegram runtime functionality is now handled by the separate kora-server process
// and accessed through the HTTP bridge in the main plugin

async function main() {
	// 3. Connect the server to the stdio transport
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch(e => {
	console.error(e);
	// The SDK handles logging errors to stderr, which is visible in Cursor's MCP logs.
});
