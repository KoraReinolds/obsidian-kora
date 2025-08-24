import { Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { CHUNK_VIEW_TYPE, ChunkView } from './modules/chunking/ui/chunk-view';
import { RELATED_CHUNKS_VIEW_TYPE, RelatedChunksView } from './modules/chunking/ui/related-chunks-view';
import { GramJSBridge } from './modules/telegram';
import { UIManager } from './modules/ui-plugins';
import { VectorBridge } from './modules/vector';
import { McpServerManager } from './modules/mcp';
import { UIPluginManager, UIPluginSettingsTab, DEFAULT_UI_PLUGIN_SETTINGS } from './modules/ui-plugins';
import { McpServerSettingTab } from './modules/mcp/settings-tab';
import { TelegramSettingTab } from './modules/telegram/settings-tab';
import { VectorSettingTab } from './modules/vector/settings-tab';
import type { EmojiMapping } from './modules/telegram';
import type { VectorSettingsInterface } from './modules/vector';
import type { UIPluginSettings } from './modules/ui-plugins';
import { defaultVectorSettings } from './modules/vector';
import { PluginCommands, VaultOperations } from './modules/obsidian';

export interface TelegramChannelConfig {
	name: string;
	channelId: string;
}

export interface TelegramFolderConfig {
	folder: string;
	channels: TelegramChannelConfig[];
}

export interface TelegramSettings {
	customEmojis?: EmojiMapping[];
	useCustomEmojis?: boolean;
	disableWebPagePreview?: boolean;
	// New folder-based configuration
	folderConfigs: TelegramFolderConfig[];
}

export interface KoraMcpPluginSettings {
	port: number;
	telegram: TelegramSettings;
	gramjs?: {
		mode?: 'bot' | 'userbot';
		apiId?: number;
		apiHash?: string;
		stringSession?: string;
		botToken?: string;
		chatId?: string;
	};
	vectorSettings: VectorSettingsInterface;
	uiPlugins: UIPluginSettings;
}

const DEFAULT_SETTINGS: KoraMcpPluginSettings = {
	port: 8123,
	telegram: {
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
		folderConfigs: [],
	},
	gramjs: {
		apiId: 0,
		apiHash: '',
		stringSession: '',
		chatId: '',
	},
	vectorSettings: defaultVectorSettings,
	uiPlugins: DEFAULT_UI_PLUGIN_SETTINGS,
};

export default class KoraPlugin extends Plugin {
	settings: KoraMcpPluginSettings;
	private mcpServerManager: McpServerManager;
	private gramjsBridge: GramJSBridge;
	private vectorBridge: VectorBridge;
	private pluginCommands: PluginCommands;
	private uiManager: UIManager;
	private uiPluginManager: UIPluginManager;
	private vaultOps: VaultOperations;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new McpServerSettingTab(this.app, this));
		this.addSettingTab(new TelegramSettingTab(this.app, this));
		this.addSettingTab(new VectorSettingTab(this.app, this));
		
		// Initialize UI Plugin Manager
		this.uiPluginManager = new UIPluginManager(this.app, this.settings.uiPlugins);
		this.addSettingTab(new UIPluginSettingsTab(this.app, this));
		
		// Инициализируем MCP сервер
		this.mcpServerManager = new McpServerManager(this.app);
		
		// Инициализируем GramJS bridge
		this.gramjsBridge = new GramJSBridge();
		
		// Инициализируем Vector bridge
		this.vectorBridge = new VectorBridge();
		
		// Инициализируем VaultOperations
		this.vaultOps = new VaultOperations(this.app);
		
		// Инициализируем команды
		this.pluginCommands = new PluginCommands(this.app, this.settings, this.gramjsBridge);
		
		// Инициализируем UI manager
		this.uiManager = new UIManager(
			this.app,
			this.settings,
			this.vectorBridge,
			this.app.vault.read.bind(this.app.vault),
			this.uiPluginManager
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

		// Скрываем заголовок и метаданные
		setTimeout(() => {
			leaf.view.containerEl.querySelectorAll('.metadata-container, .inline-title').forEach(el => el.remove());
		}, 0);

		// Показываем note UI для всех markdown файлов
		this.uiManager.injectUI(leaf);
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
    
    // Инициализируем структуру данных если она отсутствует
    if (!data) {
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
      return;
    }
    
    // Инициализируем telegram настройки если отсутствуют
    if (!data.telegram) {
      data.telegram = {};
    }
    
    // Инициализируем customEmojis если отсутствуют
    if (!data.telegram.customEmojis) {
      data.telegram.customEmojis = DEFAULT_SETTINGS.telegram.customEmojis;
    }
    
    // Инициализируем folderConfigs если отсутствуют
    if (!data.telegram.folderConfigs) {
      data.telegram.folderConfigs = [];
    }
    
    // Инициализируем uiPlugins если отсутствуют
    if (!data.uiPlugins) {
      data.uiPlugins = DEFAULT_UI_PLUGIN_SETTINGS;
    }
    
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Синхронизируем настройки с GramJS сервером
		await this.syncGramJSConfig();
	}

	/**
	 * Синхронизировать конфигурацию GramJS сервера
	 */
	private async syncGramJSConfig() {
		if (!this.settings.gramjs) {
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
