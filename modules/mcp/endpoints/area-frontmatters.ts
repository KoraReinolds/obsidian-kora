import { z } from 'zod';
import type { App } from 'obsidian';
import { BaseEndpoint } from './base';
import { getAreaFrontmatters } from '../../obsidian';

export class AreaFrontmattersEndpoint extends BaseEndpoint<Record<string, never>, any[]> {
	path = '/area_frontmatters';
	method = 'GET' as const;
	description = 'Returns the frontmatter for all notes in the "Area/" folder';
	toolName = 'get_area_frontmatters';
	inputSchema = {} as Record<string, never>;

	async handler(app: App, _input: Record<string, never>): Promise<any[]> {
		return await getAreaFrontmatters(app);
	}

	protected formatMcpResponse(frontmatters: any[]): {
		content: Array<{ type: 'text'; text: string }>;
	} {
		return {
			content: [
				{ type: 'text', text: `Retrieved ${frontmatters.length} area frontmatters ✅` },
				{ type: 'text', text: JSON.stringify(frontmatters, null, 2) },
			],
		};
	}
}
