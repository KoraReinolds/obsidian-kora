import { z } from 'zod';
import type { App } from 'obsidian';
import { BaseEndpoint } from './base';
import { getMarkdownFiles } from '../../../lib/obsidian';

interface FilesOutput {
	files: string[];
}

export class FilesEndpoint extends BaseEndpoint<Record<string, never>, string[]> {
	path = '/files';
	method = 'GET' as const;
	description = 'Return an array of markdown files from the vault';
	toolName = 'get_obsidian_files';
	inputSchema = {} as Record<string, never>; // No input parameters

	async handler(app: App, _input: Record<string, never>): Promise<string[]> {
		return await getMarkdownFiles(app);
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
