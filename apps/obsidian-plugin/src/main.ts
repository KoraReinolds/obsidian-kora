import { Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import {
	RELATED_CHUNKS_VIEW_TYPE,
	RelatedChunksView,
	SEMANTIC_INSPECTOR_VIEW_TYPE,
	SemanticInspectorView,
	ARCHIVE_VIEW_TYPE,
	ArchiveView,
} from './views';
import { ArchiveBridge, GramJSBridge } from './telegram';
import { VectorBridge } from './vector';
import { McpServerManager } from './mcp';
import { PluginCommands, VaultOperations } from './obsidian';
import { DailyContentInjector } from './daily-notes';
import {
	DEFAULT_SETTINGS,
	type KoraMcpPluginSettings,
} from './plugin-settings';
import {
	ArchiveSettingTab,
	McpServerSettingTab,
	TelegramSettingTab,
	UIPluginSettingsTab,
	VectorSettingTab,
} from './settings';
import { UIManager, UIPluginManager } from './ui-plugins';

export * from './plugin-settings';

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
		this.addRibbonIcon('database', 'Открыть архив Telegram', () => {
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
			data.uiPlugins = DEFAULT_SETTINGS.uiPlugins;
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
