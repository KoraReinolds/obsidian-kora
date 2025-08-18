import { z } from 'zod';
import type { App } from 'obsidian';
import { BaseEndpoint } from './base';
import { getAreas } from '../../../lib/obsidian';

export class AreasEndpoint extends BaseEndpoint<Record<string, never>, string[]> {
	path = '/areas';
	method = 'GET' as const;
	description = 'Return an array of all areas in the Obsidian vault';
	toolName = 'get_areas';
	inputSchema = {} as Record<string, never>;

	async handler(app: App, _input: Record<string, never>): Promise<string[]> {
		return getAreas(app);
	}

	protected formatMcpResponse(areas: string[]): {
		content: Array<{ type: 'text'; text: string }>;
	} {
		return {
			content: [
				{ type: 'text', text: `Retrieved ${areas.length} areas ✅` },
				{ type: 'text', text: JSON.stringify(areas, null, 2) },
			],
		};
	}
}
