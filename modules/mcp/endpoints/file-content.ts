import { z } from 'zod';
import { App, TFile } from 'obsidian';
import { BaseEndpoint } from './base';

const FileContentSchema = z.object({
	file: z.string().describe('Path to the markdown file.'),
});

type FileContentInput = z.infer<typeof FileContentSchema>;

interface FileContentOutput {
	file: string;
	content: string;
}

export class FileContentEndpoint extends BaseEndpoint<
	FileContentInput,
	FileContentOutput
> {
	path = '/file_content';
	method = 'POST' as const;
	description = 'Return raw markdown content of a specified file';
	toolName = 'get_file_content';
	inputSchema = FileContentSchema;

	async handler(app: App, input: FileContentInput): Promise<FileContentOutput> {
		const { file } = input;

		const abstract = app.vault.getAbstractFileByPath(file);
		if (!(abstract instanceof TFile)) {
			throw new Error('File not found');
		}

		const content = await app.vault.read(abstract);
		return { file, content };
	}

	protected formatMcpResponse(result: FileContentOutput): {
		content: Array<{ type: 'text'; text: string }>;
	} {
		return {
			content: [
				{ type: 'text', text: `Content of ${result.file} retrieved ✅` },
				{ type: 'text', text: result.content },
			],
		};
	}
}
