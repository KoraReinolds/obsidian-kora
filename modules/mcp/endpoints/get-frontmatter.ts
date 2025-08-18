import { z } from 'zod';
import type { App } from 'obsidian';
import { BaseEndpoint } from './base';
import { getFrontmatterForFiles } from '../../../lib/obsidian';

const GetFrontmatterSchema = z.object({
	files: z.array(z.string()).describe('Array of file paths to read frontmatter from.'),
});

type GetFrontmatterInput = z.infer<typeof GetFrontmatterSchema>;

export class GetFrontmatterEndpoint extends BaseEndpoint<GetFrontmatterInput, any[]> {
	path = '/get_frontmatter';
	method = 'POST' as const;
	description = 'Returns the frontmatter for a given list of files';
	toolName = 'get_frontmatter_for_files';
	inputSchema = GetFrontmatterSchema;

	async handler(app: App, input: GetFrontmatterInput): Promise<any[]> {
		const { files } = input;
		return await getFrontmatterForFiles(app, files);
	}

	protected formatMcpResponse(frontmatters: any[]): {
		content: Array<{ type: 'text'; text: string }>;
	} {
		return {
			content: [
				{ type: 'text', text: `Retrieved frontmatter for files ✅` },
				{ type: 'text', text: JSON.stringify(frontmatters, null, 2) },
			],
		};
	}
}
