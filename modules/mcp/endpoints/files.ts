import { z } from 'zod';
import type { App } from 'obsidian';
import { BaseEndpoint } from './base';
import { getMarkdownFiles } from '../../obsidian';

interface FilesInput {
	include?: string[];
	exclude?: string[];
}

export class FilesEndpoint extends BaseEndpoint<FilesInput, string[]> {
	path = '/files';
	method = 'POST' as const;
	description = 'Return an array of markdown files from the vault with optional include/exclude filters';
	toolName = 'get_obsidian_files';
	inputSchema = z.object({
		include: z.array(z.string()).optional().describe('Array of path patterns to include'),
		exclude: z.array(z.string()).optional().describe('Array of path patterns to exclude'),
	});

	async handler(app: App, input: FilesInput): Promise<string[]> {
		const files = await getMarkdownFiles(app, {
			include: input.include,
			exclude: input.exclude
		});
		return files.map(file => file.path);
	}

	protected formatMcpResponse(files: string[]): {
		content: Array<{ type: 'text'; text: string }>;
	} {
		return {
			content: [
				{ type: 'text', text: `Retrieved ${files.length} files ✅` },
				{ type: 'text', text: JSON.stringify(files, null, 2) },
			],
		};
	}
}
