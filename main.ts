import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { CHUNK_VIEW_TYPE, ChunkView } from './modules/chunk-view';
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
import { GramJSBridge } from './modules/gramjs-bridge';
import { PluginCommands } from './modules/commands';
import { UIManager } from './modules/ui-manager';
import { VectorBridge } from './modules/vector-bridge';
import { McpSettingTab } from './settings';
import type { EmojiMapping } from './modules/message-formatter';
import type { VectorSettingsInterface } from './settings/VectorSettings';
import { defaultVectorSettings } from './settings/VectorSettings';

export interface TelegramSettings {
	botToken: string;
	chatId: string;
	enabled: boolean;
	customEmojis?: EmojiMapping[];
	useCustomEmojis?: boolean;
}

export interface KoraMcpPluginSettings {
	port: number;
	telegram: TelegramSettings;
	useGramJsUserbot?: boolean;
	gramjs?: {
		mode?: 'bot' | 'userbot';
		apiId?: number;
		apiHash?: string;
		stringSession?: string;
		botToken?: string;
		chatId?: string;
	};
	vectorSettings: VectorSettingsInterface;
}

const DEFAULT_SETTINGS: KoraMcpPluginSettings = {
	port: 8123,
	telegram: {
		botToken: '',
		chatId: '',
		enabled: false,
		customEmojis: [
			{ standard: '🗿', customId: '5346283626868812660', description: 'Moai' },
			{ standard: '🧠', customId: '5346180109567028520', description: 'Brain' },
			{ standard: '✅', customId: '5345939909226034997', description: 'Check' },
			{ standard: '❓', customId: '5346065137587482787', description: 'Question' },
			{ standard: '🛑', customId: '5345787871678723001', description: 'Stop' },
			{ standard: '➕', customId: '5345922583327962454', description: 'Plus' },
			{ standard: '❤️', customId: '5345784989755668154', description: 'Heart' },
			{ standard: '📂', customId: '5346104226084844010', description: 'Folder' },
			{ standard: '💾', customId: '5346103010609101716', description: 'Floppy' },
			{ standard: '🫂', customId: '5346048443049607054', description: 'Hug' },
			{ standard: '🗺', customId: '5346278150785497951', description: 'Map' }
		],
		useCustomEmojis: false,
	},
	useGramJsUserbot: false,
	gramjs: {
		apiId: 0,
		apiHash: '',
		stringSession: '',
		chatId: '',
	},
	vectorSettings: defaultVectorSettings,
};

export default class KoraMcpPlugin extends Plugin {
	settings: KoraMcpPluginSettings;
	private server: http.Server | null = null;
	private gramjsBridge: GramJSBridge;
	private vectorBridge: VectorBridge;
	private pluginCommands: PluginCommands;
	private uiManager: UIManager;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new McpSettingTab(this.app, this));
		
		// Инициализируем GramJS bridge
		this.gramjsBridge = new GramJSBridge();
		
		// Инициализируем Vector bridge
		this.vectorBridge = new VectorBridge();
		
		// Инициализируем команды
		this.pluginCommands = new PluginCommands(this.app, this.settings, this.gramjsBridge);
		
		// Инициализируем UI manager
		this.uiManager = new UIManager(
			this.app,
			this.settings,
			this.gramjsBridge,
			this.vectorBridge,
			this.moveFileToFolder.bind(this),
			this.app.vault.read.bind(this.app.vault)
		);

		this.startServer();

		// Register right panel view for chunks
		this.registerView(CHUNK_VIEW_TYPE, (leaf) => new ChunkView(leaf, this.app, this.vectorBridge));
		this.addRibbonIcon('blocks', 'Open Chunks', () => {
			this.activateChunkView();
		});

		// Регистрируем команды
		this.pluginCommands.getCommands().forEach(command => {
			this.addCommand(command);
		});

		// Добавляем команду перезапуска сервера
		this.addCommand({
			id: 'restart-mcp-server',
			name: 'Restart MCP Server',
			callback: () => {
				this.stopServer();
				this.startServer();
			},
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", this.handleLeafChange.bind(this))
		);
	}

	handleLeafChange(leaf: WorkspaceLeaf | null) {
		if (!leaf || !leaf.view || leaf.view.getViewType() !== "markdown") return;

		const file = (leaf.view as any).file as TFile;
		if (!file) return;

		// Показываем кнопки и note UI для всех markdown файлов
		this.uiManager.injectButtons(leaf);
	}

	async moveFileToFolder(file: TFile, targetFolder: string) {
		const fileName = file.name;
		const newPath = `${targetFolder}/${fileName}`;

		try {
			await this.app.vault.rename(file, newPath);
			new Notice(`Файл перемещён в ${targetFolder}`);
		} catch (err) {
			new Notice(`Ошибка перемещения: ${err}`);
		}
	}


	onunload() {
		this.stopServer();
		this.uiManager?.cleanup();
	}

		async activateChunkView() {
			const leaf = this.app.workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: CHUNK_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}

	async loadSettings() {
    const data: any = await this.loadData();
    if (!data.telegram.customEmojis) {
      data.telegram.customEmojis = DEFAULT_SETTINGS.telegram.customEmojis;
    }
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Обновляем настройки в модулях
		if (this.pluginCommands) {
			this.pluginCommands.updateSettings(this.settings);
		}
		if (this.uiManager) {
			this.uiManager.updateSettings(this.settings);
		}
		// Синхронизируем настройки с GramJS сервером
		await this.syncGramJSConfig();
	}

	/**
	 * Синхронизировать конфигурацию GramJS сервера
	 */
	private async syncGramJSConfig() {
		if (!this.settings.useGramJsUserbot || !this.settings.gramjs) {
			return;
		}

		try {
			const isRunning = await this.gramjsBridge.isServerRunning();
			if (!isRunning) {
				console.log('[syncGramJSConfig] GramJS server not running, skipping sync');
				return;
			}

			await this.gramjsBridge.updateConfig({
				mode: this.settings.gramjs.mode || 'userbot',
				botToken: this.settings.gramjs.botToken,
				apiId: this.settings.gramjs.apiId,
				apiHash: this.settings.gramjs.apiHash,
				stringSession: this.settings.gramjs.stringSession
			});

			console.log('[syncGramJSConfig] Configuration synced with GramJS server');
		} catch (error) {
			console.error('[syncGramJSConfig] Failed to sync with GramJS server:', error);
		}
	}

	/**
	 * Получить GramJS bridge (для настроек)
	 */
	getGramJSBridge() {
		return this.gramjsBridge;
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
