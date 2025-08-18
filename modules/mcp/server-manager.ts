import { Notice } from 'obsidian';
import * as http from 'http';
import { AddressInfo } from 'net';
import type { App } from 'obsidian';
import { McpHttpHandler } from './http-handler';

export class McpServerManager {
	private server: http.Server | null = null;
	private httpHandler: McpHttpHandler;

	constructor(private app: App) {
		this.httpHandler = new McpHttpHandler(app);
	}

	startServer(port: number): void {
		console.log('Starting MCP server...');

		if (this.server) {
			new Notice('MCP server is already running.');
			return;
		}

		const endpoints = this.httpHandler.getEndpoints();

		this.server = http.createServer(async (req, res) => {
			// CORS headers
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

			if (req.method === 'OPTIONS') {
				res.writeHead(204);
				res.end();
				return;
			}

			const url = req.url || '';
			const endpoint = endpoints[url as keyof typeof endpoints];

			if (endpoint) {
				try {
					await endpoint(this.app, req, res);
				} catch (error: any) {
					console.error(`Error handling ${url}:`, error);
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ 
						error: 'Internal server error', 
						message: error.message 
					}));
				}
				return;
			}

			// 404 for unknown endpoints
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not Found' }));
		});

		this.server.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE') {
				new Notice(
					`MCP Server: Port ${port} is already in use. Please change the port in the settings.`
				);
				this.server = null;
			} else {
				new Notice(`MCP Server error: ${err.message}`);
			}
		});

		this.server.listen(port, '127.0.0.1', () => {
			const address = this.server?.address() as AddressInfo;
			const actualPort = address.port;
			new Notice(`MCP server started on port ${actualPort}`);
			console.log(`MCP server listening on http://127.0.0.1:${actualPort}`);
		});
	}

	stopServer(): void {
		if (this.server) {
			this.server.close(() => {
				new Notice('MCP server stopped.');
				console.log('MCP server stopped.');
				this.server = null;
			});
		}
	}

	isRunning(): boolean {
		return this.server !== null;
	}
}
