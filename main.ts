import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { CHUNK_VIEW_TYPE, ChunkView } from './modules/chunking/ui/chunk-view';
import { RELATED_CHUNKS_VIEW_TYPE, RelatedChunksView } from './modules/chunking/ui/related-chunks-view';
import { GramJSBridge } from './modules/telegram';
import { PluginCommands, UIManager } from './modules/ui';
import { VectorBridge } from './modules/vector';
import { McpServerManager } from './modules/mcp';
import { McpSettingTab } from './settings';
import type { EmojiMapping } from './modules/telegram';
import type { VectorSettingsInterface } from './settings/VectorSettings';
import { defaultVectorSettings } from './settings/VectorSettings';

export interface TelegramSettings {
	botToken: string;
	chatId: string;
	enabled: boolean;
	customEmojis?: EmojiMapping[];
	useCustomEmojis?: boolean;
	disableWebPagePreview?: boolean;
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
		disableWebPagePreview: true,
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
	private mcpServerManager: McpServerManager;
	private gramjsBridge: GramJSBridge;
	private vectorBridge: VectorBridge;
	private pluginCommands: PluginCommands;
	private uiManager: UIManager;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new McpSettingTab(this.app, this));
		
		// Инициализируем MCP сервер
		this.mcpServerManager = new McpServerManager(this.app);
		
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

		this.mcpServerManager.startServer(this.settings.port);

		// Register right panel view for chunks
		this.registerView(CHUNK_VIEW_TYPE, (leaf) => new ChunkView(leaf, this.app, this.vectorBridge));
		this.registerView(RELATED_CHUNKS_VIEW_TYPE, (leaf) => new RelatedChunksView(leaf, this.app, this.vectorBridge));
		this.addRibbonIcon('blocks', 'Open Chunks', () => {
			this.activateChunkView();
		});
		this.addRibbonIcon('git-branch', 'Open Related Chunks', () => {
			this.activateRelatedChunksView();
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
				this.mcpServerManager.stopServer();
				this.mcpServerManager.startServer(this.settings.port);
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
		this.mcpServerManager?.stopServer();
		this.uiManager?.cleanup();
	}

		async activateChunkView() {
			const leaf = this.app.workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: CHUNK_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}

		async activateRelatedChunksView() {
			const leaf = this.app.workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: RELATED_CHUNKS_VIEW_TYPE, active: true });
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



}
