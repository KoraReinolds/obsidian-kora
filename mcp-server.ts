#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MCP_CONFIG, getMcpUrl, MCP_ENDPOINTS } from './modules/mcp/config';

console.error('[kora] server booted');
const KORA_URL = getMcpUrl(MCP_CONFIG.DEFAULT_PORT);

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
    const res = await fetch(`${KORA_URL}${MCP_ENDPOINTS.FILES}`);
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
		const res = await fetch(`${KORA_URL}${MCP_ENDPOINTS.FRONTMATTER}`, {
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
		const res = await fetch(`${KORA_URL}${MCP_ENDPOINTS.AREAS}`);
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

server.registerTool(
	'get_area_frontmatters',
	{
		description: 'Returns the frontmatter for all notes in the "Area/" folder.',
		inputSchema: {},
	},
	async () => {
		const res = await fetch(`${KORA_URL}${MCP_ENDPOINTS.AREA_FRONTMATTERS}`);
		if (!res.ok)
			throw new Error(`Obsidian server responded ${res.status}`);
		const frontmatters = await res.json();
		return {
			content: [
				{
					type: 'text',
					text: `Retrieved ${frontmatters.length} area frontmatters ✅`,
				},
				{ type: 'text', text: JSON.stringify(frontmatters, null, 2) },
			],
		};
	}
);

server.registerTool(
	'get_frontmatter_for_files',
	{
		description: 'Returns the frontmatter for a given list of files.',
		inputSchema: {
			files: z
				.array(z.string())
				.describe('Array of file paths to read frontmatter from.'),
		},
	},
	async ({ files }) => {
		const res = await fetch(`${KORA_URL}${MCP_ENDPOINTS.GET_FRONTMATTER}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ files }),
		});
		if (!res.ok)
			throw new Error(`Obsidian server responded ${res.status}`);
		const frontmatters = await res.json();
		return {
			content: [
				{
					type: 'text',
					text: `Retrieved frontmatter for ${files.length} files ✅`,
				},
				{ type: 'text', text: JSON.stringify(frontmatters, null, 2) },
			],
		};
	}
);

server.registerTool(
	'get_file_content',
	{
		description: 'Return raw markdown content of a specified file.',
		inputSchema: {
			file: z.string().describe('Path to the markdown file.'),
		},
	},
	async ({ file }) => {
		const res = await fetch(`${KORA_URL}${MCP_ENDPOINTS.FILE_CONTENT}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ file }),
		});
		if (!res.ok)
			throw new Error(`Obsidian server responded ${res.status}`);
		const { content } = await res.json();
		return {
			content: [
				{ type: 'text', text: `Content of ${file} retrieved ✅` },
				{ type: 'text', text: content },
			],
		};
	}
);

server.registerTool(
	'get_automate_docs',
	{
		description: 'Return documentation from the Automate/mcp/ folder with full content.',
		inputSchema: {}, // No input parameters
	},
	async () => {
		const res = await fetch(`${KORA_URL}${MCP_ENDPOINTS.AUTOMATE_DOCS}`);
		if (!res.ok) throw new Error(`Obsidian server responded ${res.status}`);
		const docs: Array<{ path: string; basename: string; title: string; content: string; stat: any }> = await res.json();
		return {
			content: [
				{ type: 'text', text: `Retrieved ${docs.length} documentation files ✅` },
				{ type: 'text', text: JSON.stringify(docs, null, 2) },
			],
		};
	}
);

// Note: GramJS functionality is now handled by the separate gramjs-server process
// and accessed through the HTTP bridge in the main plugin

async function main() {
  // 3. Connect the server to the stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  // The SDK handles logging errors to stderr, which is visible in Cursor's MCP logs.
}); 