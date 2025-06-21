import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import * as http from 'http';
import { AddressInfo } from 'net';
import {
	getAreaFrontmatters,
	getAreas,
	getAutomateDocs,
	getFrontmatterForFiles,
	getMarkdownFiles,
	updateFrontmatterForFiles,
} from './lib/obsidian';

interface KoraMcpPluginSettings {
	port: number;
}

const DEFAULT_SETTINGS: KoraMcpPluginSettings = {
	port: 8123,
};

export default class KoraMcpPlugin extends Plugin {
	settings: KoraMcpPluginSettings;
	private server: http.Server | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new McpSettingTab(this.app, this));

		this.startServer();

		this.addCommand({
			id: 'restart-mcp-server',
			name: 'Restart MCP Server',
			callback: () => {
				this.stopServer();
				this.startServer();
			},
		});
	}

	onunload() {
		this.stopServer();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	startServer() {
		console.log('Starting MCP server...');

		if (this.server) {
			new Notice('MCP server is already running.');
			return;
		}

		this.server = http.createServer(async (req, res) => {
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader(
				'Access-Control-Allow-Headers',
				'Content-Type, Authorization'
			);

			if (req.method === 'OPTIONS') {
				res.writeHead(204);
				res.end();
				return;
			}

			if (req.url === '/frontmatter' && req.method === 'POST') {
				let body = '';
				req.on('data', (chunk) => {
					body += chunk.toString();
				});
				req.on('end', async () => {
					try {
						const { files, frontmatter } = JSON.parse(body);

						if (
							!Array.isArray(files) ||
							typeof frontmatter !== 'object' ||
							frontmatter === null
						) {
							res.writeHead(400, {
								'Content-Type': 'application/json',
							});
							res.end(
								JSON.stringify({ error: 'Invalid request body' })
							);
							return;
						}

						const result = await updateFrontmatterForFiles(
							this.app,
							files,
							frontmatter
						);

						res.writeHead(200, {
							'Content-Type': 'application/json',
						});
						res.end(JSON.stringify(result));
					} catch (error) {
						res.writeHead(400, {
							'Content-Type': 'application/json',
						});
						res.end(
							JSON.stringify({
								error: 'Invalid JSON in request body',
							})
						);
					}
				});
				return;
			}

			if (req.url === '/area_frontmatters' && req.method === 'GET') {
				const frontmatters = await getAreaFrontmatters(this.app);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(frontmatters));
				return;
			}

			if (req.url === '/get_frontmatter' && req.method === 'POST') {
				let body = '';
				req.on('data', (chunk) => {
					body += chunk.toString();
				});
				req.on('end', async () => {
					try {
						const { files } = JSON.parse(body);
						if (!Array.isArray(files)) {
							res.writeHead(400, {
								'Content-Type': 'application/json',
							});
							res.end(
								JSON.stringify({
									error: 'Invalid request body, "files" must be an array.',
								})
							);
							return;
						}
						const result = await getFrontmatterForFiles(
							this.app,
							files
						);
						res.writeHead(200, {
							'Content-Type': 'application/json',
						});
						res.end(JSON.stringify(result));
					} catch (error: any) {
						res.writeHead(400, {
							'Content-Type': 'application/json',
						});
						res.end(
							JSON.stringify({
								error: 'Invalid JSON in request body',
								message: error.message,
							})
						);
					}
				});
				return;
			}

			if (req.url === '/areas' && req.method === 'GET') {
				const areas = getAreas(this.app);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(areas));
				return;
			}

			if (req.url === '/files' && req.method === 'GET') {
				const files = await getMarkdownFiles(this.app);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(files));
				return;
			}

			if (req.url === '/file_content' && req.method === 'POST') {
				let body = '';
				req.on('data', (chunk) => {
					body += chunk.toString();
				});
				req.on('end', async () => {
					try {
						const { file } = JSON.parse(body);
						if (typeof file !== 'string') {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(
								JSON.stringify({ error: 'Invalid "file" parameter' })
							);
							return;
						}

						const abstract = this.app.vault.getAbstractFileByPath(file);
						if (!(abstract instanceof TFile)) {
							res.writeHead(404, {
								'Content-Type': 'application/json',
							});
							res.end(JSON.stringify({ error: 'File not found' }));
							return;
						}

						const content = await this.app.vault.read(abstract);
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ file, content }));
					} catch (error: any) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(
							JSON.stringify({ error: 'Invalid JSON', message: error.message })
						);
					}
				});
				return;
			}

			if (req.url === '/automate_docs' && req.method === 'GET') {
				try {
					const docs = await getAutomateDocs(this.app);
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(docs));
				} catch (error: any) {
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
				}
				return;
			}

			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not Found' }));
		});

		this.server.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE') {
				new Notice(
					`MCP Server: Port ${this.settings.port} is already in use. Please change the port in the settings.`
				);
				this.server = null;
			} else {
				new Notice(`MCP Server error: ${err.message}`);
			}
		});

		this.server.listen(this.settings.port, '127.0.0.1', () => {
			const address = this.server?.address() as AddressInfo;
			const port = address.port;
			new Notice(`MCP server started on port ${port}`);
			console.log(`MCP server listening on http://127.0.0.1:${port}`);
		});
	}

	stopServer() {
		if (this.server) {
			this.server.close(() => {
				new Notice('MCP server stopped.');
				console.log('MCP server stopped.');
				this.server = null;
			});
		}
	}
}

class McpSettingTab extends PluginSettingTab {
	plugin: KoraMcpPlugin;

	constructor(app: App, plugin: KoraMcpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'MCP Server Settings' });

		new Setting(containerEl)
			.setName('Server Port')
			.setDesc(
				'The port for the MCP server to listen on. The server needs to be restarted for changes to take effect.'
			)
			.addText((text) =>
				text
					.setPlaceholder('Enter port')
					.setValue(this.plugin.settings.port.toString())
					.onChange(async (value) => {
						const port = parseInt(value, 10);
						if (!isNaN(port) && port > 0 && port < 65536) {
							this.plugin.settings.port = port;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}
