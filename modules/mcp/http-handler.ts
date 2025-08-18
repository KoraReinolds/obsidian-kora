import type { App, TFile } from 'obsidian';
import {
	getAreaFrontmatters,
	getAreas,
	getAutomateDocs,
	getFrontmatterForFiles,
	getMarkdownFiles,
	updateFrontmatterForFiles,
} from '../../lib/obsidian';
import type {
	McpEndpoints,
	FrontmatterUpdateRequest,
	FileContentRequest,
	FrontmatterRequest,
} from './types';

export class McpHttpHandler {
	constructor(private app: App) {}

	getEndpoints(): McpEndpoints {
		return {
			'/frontmatter': this.handleFrontmatterUpdate.bind(this),
			'/area_frontmatters': this.handleAreaFrontmatters.bind(this),
			'/get_frontmatter': this.handleGetFrontmatter.bind(this),
			'/areas': this.handleAreas.bind(this),
			'/files': this.handleFiles.bind(this),
			'/file_content': this.handleFileContent.bind(this),
			'/automate_docs': this.handleAutomateDocs.bind(this),
		};
	}

	private async handleFrontmatterUpdate(app: App, req: any, res: any): Promise<void> {
		let body = '';
		req.on('data', (chunk: Buffer) => {
			body += chunk.toString();
		});
		req.on('end', async () => {
			try {
				const { files, frontmatter }: FrontmatterUpdateRequest = JSON.parse(body);

				if (
					!Array.isArray(files) ||
					typeof frontmatter !== 'object' ||
					frontmatter === null
				) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Invalid request body' }));
					return;
				}

				const result = await updateFrontmatterForFiles(app, files, frontmatter);

				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(result));
			} catch (error) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
			}
		});
	}

	private async handleAreaFrontmatters(app: App, req: any, res: any): Promise<void> {
		try {
			const frontmatters = await getAreaFrontmatters(app);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(frontmatters));
		} catch (error: any) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
		}
	}

	private async handleGetFrontmatter(app: App, req: any, res: any): Promise<void> {
		let body = '';
		req.on('data', (chunk: Buffer) => {
			body += chunk.toString();
		});
		req.on('end', async () => {
			try {
				const { files }: FrontmatterRequest = JSON.parse(body);
				if (!Array.isArray(files)) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							error: 'Invalid request body, "files" must be an array.',
						})
					);
					return;
				}
				const result = await getFrontmatterForFiles(app, files);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(result));
			} catch (error: any) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({
						error: 'Invalid JSON in request body',
						message: error.message,
					})
				);
			}
		});
	}

	private async handleAreas(app: App, req: any, res: any): Promise<void> {
		try {
			const areas = getAreas(app);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(areas));
		} catch (error: any) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
		}
	}

	private async handleFiles(app: App, req: any, res: any): Promise<void> {
		try {
			const files = await getMarkdownFiles(app);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(files));
		} catch (error: any) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
		}
	}

	private async handleFileContent(app: App, req: any, res: any): Promise<void> {
		let body = '';
		req.on('data', (chunk: Buffer) => {
			body += chunk.toString();
		});
		req.on('end', async () => {
			try {
				const { file }: FileContentRequest = JSON.parse(body);
				if (typeof file !== 'string') {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Invalid "file" parameter' }));
					return;
				}

				const abstract = app.vault.getAbstractFileByPath(file);
				if (!(abstract instanceof TFile)) {
					res.writeHead(404, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'File not found' }));
					return;
				}

				const content = await app.vault.read(abstract);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ file, content }));
			} catch (error: any) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({ error: 'Invalid JSON', message: error.message })
				);
			}
		});
	}

	private async handleAutomateDocs(app: App, req: any, res: any): Promise<void> {
		try {
			const docs = await getAutomateDocs(app);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(docs));
		} catch (error: any) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
		}
	}
}
