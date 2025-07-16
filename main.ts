import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';
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
import { TelegramBot, TelegramSettings } from './modules/telegram';
import { McpSettingTab } from 'settings';

interface KoraMcpPluginSettings {
	port: number;
	telegram: TelegramSettings;
}

const DEFAULT_SETTINGS: KoraMcpPluginSettings = {
	port: 8123,
	telegram: {
		botToken: '',
		chatId: '',
		enabled: false,
		customIconUrl: '',
		stickerFileId: '',
		sendAsPhoto: false,
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
};

export default class KoraMcpPlugin extends Plugin {
	settings: KoraMcpPluginSettings;
	private server: http.Server | null = null;
	private telegramBot: TelegramBot;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new McpSettingTab(this.app, this));
		
		// Инициализируем Telegram бота
		this.telegramBot = new TelegramBot(this.app, this.settings.telegram);

		this.startServer();

		this.addCommand({
			id: 'restart-mcp-server',
			name: 'Restart MCP Server',
			callback: () => {
				this.stopServer();
				this.startServer();
			},
		});

		this.addCommand({
			id: 'send-note-to-telegram',
			name: 'Отправить заметку в Telegram',
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (file) {
					await this.telegramBot.sendFile(file);
				} else {
					new Notice('Нет активного файла');
				}
			},
		});

		this.addCommand({
			id: 'test-telegram-connection',
			name: 'Проверить подключение Telegram бота',
			callback: async () => {
				await this.telegramBot.testConnection();
			},
		});
    
    this.addCommand({
			id: "move-to-notes",
			name: "Переместить файл в Notes",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (file) {
					await this.moveFileToFolder(file, "Organize/Notes");
				} else {
					new Notice("Нет активного файла");
				}
			}
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", this.handleLeafChange.bind(this))
		);
	}

	handleLeafChange(leaf: WorkspaceLeaf | null) {
		if (!leaf || !leaf.view || leaf.view.getViewType() !== "markdown") return;

		const file = (leaf.view as any).file as TFile;
		if (!file) return;

		// Пример: показываем кнопку, если файл в папке "Projects"
		// if (file.path.startsWith("Projects/")) {
			this.injectButton(leaf);
		// }
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

	injectButton(leaf: WorkspaceLeaf) {
		const container = (leaf.view as any).containerEl;

		// Удалим уже существующие наши кнопки, если есть
		const existing = container.querySelector(".custom-folder-button");
		if (existing) existing.remove();

		// Создаём кнопки
		const buttonNotes = document.createElement("button");
		buttonNotes.textContent = "Move to Notes";
		buttonNotes.className = "custom-folder-button";
		buttonNotes.style.margin = "10px";
		buttonNotes.onclick = () => {
			if ((leaf.view as any).file) {
				this.moveFileToFolder((leaf.view as any).file as TFile, "Organize/Notes");
			} else {
				new Notice("Нет активного файла");
			}
		};

		const buttonTelegram = document.createElement("button");
		buttonTelegram.textContent = "📤 Send to Telegram";
		buttonTelegram.className = "custom-telegram-button";
		buttonTelegram.style.margin = "10px";
		buttonTelegram.style.backgroundColor = "#0088cc";
		buttonTelegram.style.color = "white";
		buttonTelegram.style.border = "none";
		buttonTelegram.style.borderRadius = "5px";
		buttonTelegram.style.padding = "5px 10px";
		buttonTelegram.onclick = async () => {
			if ((leaf.view as any).file) {
				await this.telegramBot.sendFile((leaf.view as any).file as TFile);
			} else {
				new Notice("Нет активного файла");
			}
		};

		// const buttonMOC = document.createElement("button");
		// buttonMOC.textContent = "Move to MOC";
		// buttonMOC.className = "custom-folder-button";
		// buttonMOC.style.margin = "10px";
		// buttonMOC.onclick = () => {
		// 	if (leaf.view.file) {
		// 		this.moveFileToFolder(leaf.view.file as TFile, "Organize/MOC");
		// 	} else {
		// 		new Notice("Нет активного файла");
		// 	}
		// };


		// Вставляем в начало preview-панели
		const markdownEl = container.querySelector(".view-content");
		if (markdownEl) {
			markdownEl.prepend(buttonTelegram);
			markdownEl.prepend(buttonNotes);
			// markdownEl.prepend(buttonMOC);
		}
	}

	onunload() {
		this.stopServer();
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
		// Обновляем настройки Telegram бота
		if (this.telegramBot) {
			this.telegramBot.updateSettings(this.settings.telegram);
		}
	}

	/**
	 * Публичный метод для тестирования Telegram подключения
	 */
	async testTelegramConnection(): Promise<boolean> {
		return await this.telegramBot.testConnection();
	}

	/**
	 * Публичный метод для тестирования кастомной иконки
	 */
	async testCustomIcon(): Promise<boolean> {
		return await this.telegramBot.sendTestWithIcon();
	}

	/**
	 * Публичный метод для тестирования кастомных эмодзи
	 */
	async testCustomEmojis(): Promise<boolean> {
		return await this.telegramBot.testCustomEmojis();
	}

	/**
	 * Получить Telegram бота (для настроек)
	 */
	getTelegramBot() {
		return this.telegramBot;
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
