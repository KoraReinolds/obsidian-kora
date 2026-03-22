import { Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import {
	RELATED_CHUNKS_VIEW_TYPE,
	RelatedChunksView,
} from '../../../modules/chunking/ui/related-chunks-view';
import {
	SEMANTIC_INSPECTOR_VIEW_TYPE,
	SemanticInspectorView,
} from '../../../modules/semantic-inspector';
import {
	ARCHIVE_VIEW_TYPE,
	ArchiveBridge,
	ArchiveSettingTab,
	ArchiveView,
	GramJSBridge,
} from '../../../modules/telegram';
import { UIManager } from '../../../modules/ui-plugins';
import { VectorBridge } from '../../../modules/vector';
import { McpServerManager } from '../../../modules/mcp';
import {
	UIPluginManager,
	UIPluginSettingsTab,
	DEFAULT_UI_PLUGIN_SETTINGS,
} from '../../../modules/ui-plugins';
import { McpServerSettingTab } from '../../../modules/mcp/settings-tab';
import { TelegramSettingTab } from '../../../modules/telegram/ui/settings-tab';
import { VectorSettingTab } from '../../../modules/vector/settings-tab';
import type { EmojiMapping } from '../../../modules/telegram';
import type { VectorSettingsInterface } from '../../../modules/vector';
import type { UIPluginSettings } from '../../../modules/ui-plugins';
import { defaultVectorSettings } from '../../../modules/vector';
import { PluginCommands, VaultOperations } from '../../../modules/obsidian';
import { DailyContentInjector } from '../../../modules/daily-notes';

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
	folderConfigs: TelegramFolderConfig[];
}

/**
 * @description Настройки MVP архива Telegram в плагине: включение UI, путь БД на сервере,
 * адрес userbot-сервера, peer и лимиты по умолчанию.
 */
export interface ArchiveSettings {
	enableArchive: boolean;
	serverHost: string;
	serverPort: number;
	databasePath: string;
	defaultPeer: string;
	defaultSyncLimit: number;
	recentMessagesLimit: number;
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
	archiveSettings: ArchiveSettings;
	vectorSettings: VectorSettingsInterface;
	uiPlugins: UIPluginSettings;
}

const DEFAULT_SETTINGS: KoraMcpPluginSettings = {
	port: 8123,
	telegram: {
		customEmojis: [
			{
				standard: 'рџ—ї',
				customId: '5346283626868812660',
				description: 'Moai',
			},
			{
				standard: 'рџ§ ',
				customId: '5346180109567028520',
				description: 'Brain',
			},
			{
				standard: 'вњ…',
				customId: '5345939909226034997',
				description: 'Check',
			},
			{
				standard: 'вќ“',
				customId: '5346065137587482787',
				description: 'Question',
			},
			{
				standard: 'рџ›‘',
				customId: '5345787871678723001',
				description: 'Stop',
			},
			{ standard: 'вћ•', customId: '5345922583327962454', description: 'Plus' },
			{
				standard: 'вќ¤пёЏ',
				customId: '5345784989755668154',
				description: 'Heart',
			},
			{
				standard: 'рџ“‚',
				customId: '5346104226084844010',
				description: 'Folder',
			},
			{
				standard: 'рџ’ѕ',
				customId: '5346103010609101716',
				description: 'Floppy',
			},
			{ standard: 'рџ«‚', customId: '5346048443049607054', description: 'Hug' },
			{ standard: 'рџ—є', customId: '5346278150785497951', description: 'Map' },
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
	archiveSettings: {
		enableArchive: true,
		serverHost: '127.0.0.1',
		serverPort: 8125,
		databasePath: 'data/telegram-archive.sqlite',
		defaultPeer: '',
		defaultSyncLimit: 200,
		recentMessagesLimit: 50,
	},
	vectorSettings: defaultVectorSettings,
	uiPlugins: DEFAULT_UI_PLUGIN_SETTINGS,
};

export default class KoraPlugin extends Plugin {
	settings: KoraMcpPluginSettings;
	private mcpServerManager: McpServerManager;
	private gramjsBridge: GramJSBridge;
	private archiveBridge: ArchiveBridge;
	private vectorBridge: VectorBridge;
	private pluginCommands: PluginCommands;
	private uiManager: UIManager;
	private uiPluginManager: UIPluginManager;
	private vaultOps: VaultOperations;
	private dailyContentInjector: DailyContentInjector;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new McpServerSettingTab(this.app, this));
		this.addSettingTab(new TelegramSettingTab(this.app, this));
		this.addSettingTab(new ArchiveSettingTab(this.app, this));
		this.addSettingTab(new VectorSettingTab(this.app, this));

		this.uiPluginManager = new UIPluginManager(
			this.app,
			this.settings.uiPlugins
		);
		this.addSettingTab(new UIPluginSettingsTab(this.app, this));

		this.mcpServerManager = new McpServerManager(this.app);
		this.gramjsBridge = new GramJSBridge();
		this.archiveBridge = new ArchiveBridge({
			host: this.settings.archiveSettings.serverHost,
			port: this.settings.archiveSettings.serverPort,
		});
		this.vectorBridge = new VectorBridge();

		await this.syncGramJSConfig();

		this.vaultOps = new VaultOperations(this.app);
		// this.dailyContentInjector = new DailyContentInjector(this.app);

		this.pluginCommands = new PluginCommands(
			this.app,
			this.settings,
			this.gramjsBridge
		);

		this.uiManager = new UIManager(
			this.app,
			this.settings,
			this.vectorBridge,
			this.app.vault.read.bind(this.app.vault),
			this.uiPluginManager
		);

		this.mcpServerManager.startServer(this.settings.port);

		this.registerView(
			RELATED_CHUNKS_VIEW_TYPE,
			leaf =>
				new RelatedChunksView(
					leaf,
					this.app,
					this.vectorBridge,
					() => ({
						scoreThreshold: this.settings.vectorSettings.searchScoreThreshold,
						lexicalBoostWeight: this.settings.vectorSettings.lexicalBoostWeight,
					}),
					this
				)
		);
		this.registerView(
			SEMANTIC_INSPECTOR_VIEW_TYPE,
			leaf =>
				new SemanticInspectorView(leaf, this.app, this.vectorBridge, () => ({
					scoreThreshold: this.settings.vectorSettings.searchScoreThreshold,
					lexicalBoostWeight: this.settings.vectorSettings.lexicalBoostWeight,
				}))
		);
		this.registerView(
			ARCHIVE_VIEW_TYPE,
			leaf => new ArchiveView(leaf, this, this.archiveBridge)
		);
		this.addRibbonIcon('git-branch', 'Open Related Chunks', () => {
			this.activateRelatedChunksView();
		});
		this.addRibbonIcon('search', 'Open Semantic Inspector', () => {
			this.activateSemanticInspectorView();
		});
		this.addRibbonIcon('database', 'РћС‚РєСЂС‹С‚СЊ Р°СЂС…РёРІ Telegram', () => {
			this.activateArchiveView();
		});

		this.pluginCommands.getCommands().forEach(command => {
			this.addCommand(command);
		});

		this.addCommand({
			id: 'restart-mcp-server',
			name: 'Restart MCP Server',
			callback: () => {
				this.mcpServerManager.stopServer();
				this.mcpServerManager.startServer(this.settings.port);
			},
		});

		this.registerEvent(
			this.app.workspace.on(
				'active-leaf-change',
				this.handleLeafChange.bind(this)
			)
		);
	}

	handleLeafChange(leaf: WorkspaceLeaf | null) {
		if (!leaf || !leaf.view || leaf.view.getViewType() !== 'markdown') return;

		const file = (leaf.view as any).file as TFile;
		if (!file) return;

		setTimeout(() => {
			leaf.view.containerEl
				.querySelectorAll('.metadata-container, .inline-title')
				.forEach(el => el.remove());
		}, 0);

		this.uiManager.injectUI(leaf);
		// this.dailyContentInjector.injectDailyContent(leaf);
	}

	onunload() {
		this.mcpServerManager?.stopServer();
		this.uiManager?.cleanup();
		this.dailyContentInjector?.cleanup();
	}

	async activateRelatedChunksView() {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: RELATED_CHUNKS_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	async activateSemanticInspectorView() {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: SEMANTIC_INSPECTOR_VIEW_TYPE,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		const data: any = await this.loadData();

		if (!data) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS);
			return;
		}

		if (!data.telegram) {
			data.telegram = {};
		}

		if (!data.telegram.customEmojis) {
			data.telegram.customEmojis = DEFAULT_SETTINGS.telegram.customEmojis;
		}

		if (!data.telegram.folderConfigs) {
			data.telegram.folderConfigs = [];
		}

		if (!data.uiPlugins) {
			data.uiPlugins = DEFAULT_UI_PLUGIN_SETTINGS;
		}

		if (!data.archiveSettings) {
			data.archiveSettings = DEFAULT_SETTINGS.archiveSettings;
		}

		this.settings = Object.assign({}, DEFAULT_SETTINGS, data, {
			telegram: Object.assign({}, DEFAULT_SETTINGS.telegram, data.telegram),
			gramjs: Object.assign({}, DEFAULT_SETTINGS.gramjs, data.gramjs),
			archiveSettings: Object.assign(
				{},
				DEFAULT_SETTINGS.archiveSettings,
				data.archiveSettings
			),
			vectorSettings: Object.assign(
				{},
				DEFAULT_SETTINGS.vectorSettings,
				data.vectorSettings
			),
			uiPlugins: Object.assign({}, DEFAULT_SETTINGS.uiPlugins, data.uiPlugins),
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.archiveBridge?.updateConfig({
			host: this.settings.archiveSettings.serverHost,
			port: this.settings.archiveSettings.serverPort,
		});
		await this.syncGramJSConfig();
	}

	/**
	 * @description Синхронизирует конфигурацию GramJS и archive runtime с настройками плагина.
	 */
	private async syncGramJSConfig() {
		if (!this.settings.gramjs) {
			return;
		}

		const configPayload = {
			mode: this.settings.gramjs.mode || 'userbot',
			botToken: this.settings.gramjs.botToken,
			apiId: this.settings.gramjs.apiId,
			apiHash: this.settings.gramjs.apiHash,
			stringSession: this.settings.gramjs.stringSession,
			archiveDatabasePath: this.settings.archiveSettings.databasePath,
			semanticBackend: 'sqlite' as const,
			semanticDatabasePath: this.settings.vectorSettings.semanticDatabasePath,
			openaiApiKey: this.settings.vectorSettings.openaiApiKey,
			embeddingModel: this.settings.vectorSettings.embeddingModel,
			embeddingBaseUrl: this.settings.vectorSettings.embeddingBaseUrl,
		};

		try {
			const isRunning = await this.gramjsBridge.isServerRunning();
			if (!isRunning) {
				console.log(
					'[syncGramJSConfig] GramJS server not running, skipping sync'
				);
				return;
			}

			await this.gramjsBridge.updateGramJSConfig(configPayload);

			console.log('[syncGramJSConfig] Configuration synced with GramJS server');
		} catch (error) {
			console.error(
				'[syncGramJSConfig] Failed to sync with GramJS server:',
				error
			);
		}

		try {
			const archiveServerConfig = this.archiveBridge?.getConfig();
			const gramJsServerConfig = this.gramjsBridge?.getConfig();
			const archiveServerIsPrimary =
				archiveServerConfig?.host === gramJsServerConfig?.host &&
				archiveServerConfig?.port === gramJsServerConfig?.port;

			if (archiveServerIsPrimary) {
				return;
			}

			const isArchiveServerRunning =
				await this.archiveBridge.isServerReachable();
			if (!isArchiveServerRunning) {
				console.log(
					'[syncGramJSConfig] Archive server not running, skipping archive sync'
				);
				return;
			}

			await this.archiveBridge.updateArchiveServerConfig({
				archiveDatabasePath: this.settings.archiveSettings.databasePath,
				semanticBackend: 'sqlite',
				semanticDatabasePath: this.settings.vectorSettings.semanticDatabasePath,
				openaiApiKey: this.settings.vectorSettings.openaiApiKey,
				embeddingModel: this.settings.vectorSettings.embeddingModel,
				embeddingBaseUrl: this.settings.vectorSettings.embeddingBaseUrl,
			});
			console.log(
				'[syncGramJSConfig] Configuration synced with archive server'
			);
		} catch (error) {
			console.error(
				'[syncGramJSConfig] Failed to sync with archive server:',
				error
			);
		}
	}

	getGramJSBridge() {
		return this.gramjsBridge;
	}

	getArchiveBridge() {
		return this.archiveBridge;
	}

	async activateArchiveView() {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: ARCHIVE_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}
}
