#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
console.error('[kora] server booted');
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
    inputSchema: {} // No input parameters
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

server.registerTool(
	'update_frontmatter',
	{
		description: 'Create or update frontmatter for a list of files.',
		inputSchema: {
			files: z.array(z.string()).describe('Array of file paths to update.'),
			frontmatter: z
				.record(z.any())
				.describe('JSON object with frontmatter keys and values to set.'),
		},
	},
	async ({ files, frontmatter }) => {
		const res = await fetch(`${KORA_URL}/frontmatter`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ files, frontmatter }),
		});

		if (!res.ok) {
			const errorBody = await res.text();
			throw new Error(`Obsidian server responded ${res.status}: ${errorBody}`);
		}

		const result = await res.json();
		return {
			content: [
				{
					type: 'text',
					text: `Updated frontmatter for ${files.length} files.`,
				},
				{ type: 'text', text: JSON.stringify(result, null, 2) },
			],
		};
	}
);

server.registerTool(
	'get_areas',
	{
		description: 'Return an array of all areas in the Obsidian vault.',
		inputSchema: {}, // No input parameters
	},
	async () => {
		const res = await fetch(`${KORA_URL}/areas`);
		if (!res.ok) throw new Error(`Obsidian server responded ${res.status}`);
		const areas: string[] = await res.json();
		return {
			content: [
				{ type: 'text', text: `Retrieved ${areas.length} areas ✅` },
				{ type: 'text', text: JSON.stringify(areas, null, 2) },
			],
		};
	}
);

async function main() {
  // 3. Connect the server to the stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  // The SDK handles logging errors to stderr, which is visible in Cursor's MCP logs.
}); 