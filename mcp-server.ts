#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// The port should match the one in the Obsidian plugin settings
const KORA_PORT = 8123;
const KORA_URL = `http://127.0.0.1:${KORA_PORT}`;

// 1. Initialize the MCP Server
const server = new McpServer({
  name: 'kora-obsidian-vault',
  version: '0.1.0',
  info: {
    summary: 'Provides access to the files in an Obsidian vault.',
  },
});

// 2. Define the tool
server.tool(
  'get_obsidian_files',
  {
    summary: 'Get a list of all markdown files from the Obsidian vault.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  async (params, context) => {
    try {
      const response = await fetch(`${KORA_URL}/files`);

      if (!response.ok) {
        throw new Error(
          `The Obsidian Kora server returned an error: ${response.status}`
        );
      }

      const files = await response.json();

      // Return a success message and the data as a JSON string
      return {
        content: [
          {
            type: 'text',
            text: `Successfully retrieved ${files.length} files from your Obsidian vault.`,
          },
          {
            type: 'text',
            text: JSON.stringify(files, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Return a helpful error message to the user
      return {
        content: [
          {
            type: 'text',
            text: `Error: Could not fetch files from Obsidian.\n- Is Obsidian running?\n- Is the "Kora MCP" plugin enabled?\n- Is the server port set to ${KORA_PORT}?\n\nDetails: ${errorMessage}`,
          },
        ],
      };
    }
  }
);

async function main() {
  // 3. Connect the server to the stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  // The SDK handles logging errors to stderr, which is visible in Cursor's MCP logs.
}); 