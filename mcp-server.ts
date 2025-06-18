#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';                // удобнее, чем «ручной» JSON Schema

const KORA_PORT = 8123;
const KORA_URL  = `http://127.0.0.1:${KORA_PORT}`;

const server = new McpServer({
  name:    'kora-obsidian-vault',
  version: '0.1.0',
  info: { summary: 'Expose Obsidian vault files through MCP' }
});

/* ✅  use registerTool + correct keys  */
server.registerTool(
  'get_obsidian_files',
  {
    description: 'Return an array of markdown files from the vault.',
    inputSchema: { a: z.number(), b: z.number() }       // ← пустые параметры
  },
  async () => {
    const res = await fetch(`${KORA_URL}/files`);
    if (!res.ok) throw new Error(`Obsidian server responded ${res.status}`);
    const files: unknown[] = await res.json();
    return {
      content: [
        { type: 'text', text: `Retrieved ${files.length} files ✅` },
        { type: 'text', text: JSON.stringify(files, null, 2) }
      ]
    };
  }
);

async function main() {
  // 3. Connect the server to the stdio transport
  const transport = new StdioServerTransport();
  server.connect(transport);
}

main().catch((e) => {
  // The SDK handles logging errors to stderr, which is visible in Cursor's MCP logs.
}); 