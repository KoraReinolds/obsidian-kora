import { z, type ZodRawShape } from 'zod';

export interface McpToolResponse {
	[key: string]: unknown;
	content: Array<{ type: 'text'; text: string }>;
}

export interface McpToolDefinition<TInput = unknown, TOutput = unknown> {
	path: string;
	method: 'GET' | 'POST';
	description: string;
	toolName: string;
	inputSchema: z.ZodType<TInput> | Record<string, never>;
	formatMcpResponse: (data: TOutput) => McpToolResponse;
}

const FilesInputSchema = z.object({
	include: z
		.array(z.string())
		.optional()
		.describe('Array of path patterns to include'),
	exclude: z
		.array(z.string())
		.optional()
		.describe('Array of path patterns to exclude'),
});

const FrontmatterUpdateSchema = z.object({
	files: z.array(z.string()).describe('Array of file paths to update.'),
	frontmatter: z
		.record(z.any())
		.describe('JSON object with frontmatter keys and values to set.'),
});

const GetFrontmatterSchema = z.object({
	files: z
		.array(z.string())
		.describe('Array of file paths to read frontmatter from.'),
});

const FileContentSchema = z.object({
	file: z.string().describe('Path to the markdown file.'),
});

const AutomateDocsSchema = z.object({});

/**
 * @description Возвращает MCP-ответ с текстовым summary и JSON-данными.
 * @param {string} summary - Краткое описание результата.
 * @param {unknown} data - Данные endpoint-а.
 * @returns {McpToolResponse}
 */
function createJsonMcpResponse(
	summary: string,
	data: unknown
): McpToolResponse {
	return {
		content: [
			{ type: 'text', text: summary },
			{ type: 'text', text: JSON.stringify(data, null, 2) },
		],
	};
}

export const MCP_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
	{
		path: '/files-get',
		method: 'GET',
		description:
			'Return an array of markdown files from the vault with optional include/exclude filters',
		toolName: 'get_obsidian_files',
		inputSchema: FilesInputSchema,
		formatMcpResponse: (files: string[]) =>
			createJsonMcpResponse(`Retrieved ${files.length} files`, files),
	},
	{
		path: '/frontmatter',
		method: 'POST',
		description: 'Create or update frontmatter for a list of files',
		toolName: 'update_frontmatter',
		inputSchema: FrontmatterUpdateSchema,
		formatMcpResponse: (result: unknown) =>
			createJsonMcpResponse('Updated frontmatter for files', result),
	},
	{
		path: '/get_frontmatter',
		method: 'POST',
		description: 'Returns the frontmatter for a given list of files',
		toolName: 'get_frontmatter_for_files',
		inputSchema: GetFrontmatterSchema,
		formatMcpResponse: (frontmatters: unknown[]) =>
			createJsonMcpResponse('Retrieved frontmatter for files', frontmatters),
	},
	{
		path: '/file_content',
		method: 'POST',
		description: 'Return raw markdown content of a specified file',
		toolName: 'get_file_content',
		inputSchema: FileContentSchema,
		formatMcpResponse: (result: { file: string; content: string }) => ({
			content: [
				{
					type: 'text',
					text: `Content of ${result.file} retrieved`,
				},
				{ type: 'text', text: result.content },
			],
		}),
	},
	{
		path: '/automate_docs',
		method: 'GET',
		description:
			'Return documentation from the Automate/mcp/ folder with full content',
		toolName: 'get_automate_docs',
		inputSchema: AutomateDocsSchema,
		formatMcpResponse: (docs: unknown[]) =>
			createJsonMcpResponse(
				`Retrieved ${docs.length} documentation files`,
				docs
			),
	},
];

/**
 * @description Делает HTTP-запрос к встроенному MCP HTTP server и приводит ответ к MCP-формату.
 * @param {McpToolDefinition<TInput, TOutput>} definition - Описание MCP-инструмента.
 * @param {string} baseUrl - Базовый URL встроенного HTTP server.
 * @param {TInput} input - Входные параметры инструмента.
 * @returns {Promise<McpToolResponse>}
 */
export async function callMcpTool<TInput, TOutput>(
	definition: McpToolDefinition<TInput, TOutput>,
	baseUrl: string,
	input: TInput
): Promise<McpToolResponse> {
	const url = `${baseUrl}${definition.path}`;
	const fetchOptions: RequestInit = {
		method: definition.method,
		headers: { 'Content-Type': 'application/json' },
	};

	if (definition.method === 'POST') {
		fetchOptions.body = JSON.stringify(input);
	}

	const res = await fetch(url, fetchOptions);
	if (!res.ok) {
		throw new Error(`HTTP ${res.status}: ${await res.text()}`);
	}

	const result = (await res.json()) as TOutput;
	return definition.formatMcpResponse(result);
}

/**
 * @description Возвращает raw shape для MCP SDK из схемы инструмента.
 * @param {McpToolDefinition} definition - Описание MCP-инструмента.
 * @returns {ZodRawShape}
 */
export function getToolInputRawShape(
	definition: McpToolDefinition
): ZodRawShape {
	return definition.inputSchema instanceof z.ZodObject
		? definition.inputSchema.shape
		: {};
}
