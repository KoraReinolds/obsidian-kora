import type { App } from 'obsidian';

export interface McpResponse<T = unknown> {
	content: Array<{ type: 'text'; text: string }>;
	data?: T;
}

export interface FrontmatterUpdateRequest {
	files: string[];
	frontmatter: Record<string, any>;
}

export interface FileContentRequest {
	file: string;
}

export interface FileContentResponse {
	file: string;
	content: string;
}

export interface FrontmatterRequest {
	files: string[];
}

export interface AreaFrontmatter {
	file: string;
	frontmatter: Record<string, any>;
}

export interface AutomateDoc {
	path: string;
	basename: string;
	title: string;
	content: string;
	stat: any;
}

export interface McpEndpointHandler {
	(app: App, req: any, res: any): Promise<void>;
}

export interface McpEndpoints {
	'/frontmatter': McpEndpointHandler;
	'/get_frontmatter': McpEndpointHandler;
	'/files-get': McpEndpointHandler;
	'/file_content': McpEndpointHandler;
	'/automate_docs': McpEndpointHandler;
}
