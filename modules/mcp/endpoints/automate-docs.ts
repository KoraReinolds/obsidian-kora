import { z } from 'zod';
import type { App } from 'obsidian';
import { BaseEndpoint } from './base';
import { getAutomateDocs } from '../../../lib/obsidian';

interface AutomateDoc {
	path: string;
	basename: string;
	title: string;
	content: string;
	stat: any;
}

export class AutomateDocsEndpoint extends BaseEndpoint<Record<string, never>, AutomateDoc[]> {
	path = '/automate_docs';
	method = 'GET' as const;
	description = 'Return documentation from the Automate/mcp/ folder with full content';
	toolName = 'get_automate_docs';
	inputSchema = {} as Record<string, never>;

	async handler(app: App, _input: Record<string, never>): Promise<AutomateDoc[]> {
		return await getAutomateDocs(app);
	}

	protected formatMcpResponse(docs: AutomateDoc[]): {
		content: Array<{ type: 'text'; text: string }>;
	} {
		return {
			content: [
				{ type: 'text', text: `Retrieved ${docs.length} documentation files ✅` },
				{ type: 'text', text: JSON.stringify(docs, null, 2) },
			],
		};
	}
}
