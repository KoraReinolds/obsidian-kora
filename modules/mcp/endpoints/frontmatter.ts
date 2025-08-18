import { z } from 'zod';
import type { App } from 'obsidian';
import { BaseEndpoint } from './base';
import { updateFrontmatterForFiles } from '../../../lib/obsidian';

const FrontmatterUpdateSchema = z.object({
	files: z.array(z.string()).describe('Array of file paths to update.'),
	frontmatter: z.record(z.any()).describe('JSON object with frontmatter keys and values to set.'),
});

type FrontmatterUpdateInput = z.infer<typeof FrontmatterUpdateSchema>;

export class FrontmatterUpdateEndpoint extends BaseEndpoint<FrontmatterUpdateInput, any> {
	path = '/frontmatter';
	method = 'POST' as const;
	description = 'Create or update frontmatter for a list of files';
	toolName = 'update_frontmatter';
	inputSchema = FrontmatterUpdateSchema;

	async handler(app: App, input: FrontmatterUpdateInput): Promise<any> {
		const { files, frontmatter } = input;
		return await updateFrontmatterForFiles(app, files, frontmatter);
	}

	protected formatMcpResponse(result: any): {
		content: Array<{ type: 'text'; text: string }>;
	} {
		return {
			content: [
				{ type: 'text', text: `Updated frontmatter for files ✅` },
				{ type: 'text', text: JSON.stringify(result, null, 2) },
			],
		};
	}
}
