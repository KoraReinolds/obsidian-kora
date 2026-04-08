import { Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import {
	RELATED_CHUNKS_VIEW_TYPE,
	RelatedChunksView,
	SEMANTIC_INSPECTOR_VIEW_TYPE,
	SemanticInspectorView,
	ARCHIVE_VIEW_TYPE,
	ArchiveView,
	ETERNAL_AI_VIEW_TYPE,
	EternalAiView,
	SQLITE_VIEWER_VIEW_TYPE,
	SqliteViewerView,
	WORKSPACE_STATUS_VIEW_TYPE,
	WorkspaceStatusView,
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
	EternalAiSettingTab,
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
		this.addSettingTab(new EternalAiSettingTab(this.app, this));

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

		await this.syncKoraServerConfig();

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
			leaf => new ArchiveView(leaf, this, this.archiveBridge, this.vectorBridge)
		);
		this.registerView(
			ETERNAL_AI_VIEW_TYPE,
			leaf => new EternalAiView(leaf, this)
		);
		this.registerView(
			SQLITE_VIEWER_VIEW_TYPE,
			leaf => new SqliteViewerView(leaf, this)
		);
		this.registerView(
			WORKSPACE_STATUS_VIEW_TYPE,
			leaf => new WorkspaceStatusView(leaf, this.app, this)
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
		if (this.settings.eternalAiSettings.enableEternalAi) {
			this.addRibbonIcon('sparkles', 'Открыть Eternal AI', () => {
				this.activateEternalAiView();
			});
		}
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
		this.addCommand({
			id: 'open-sqlite-viewer',
			name: 'Open SQLite Viewer',
			callback: () => {
				void this.activateSqliteViewerView();
			},
		});
		this.addCommand({
			id: 'open-workspace-git-status',
			name: 'Open Workspace Git Status',
			callback: () => {
				void this.activateWorkspaceStatusView();
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

		if (!data.eternalAiSettings) {
			data.eternalAiSettings = DEFAULT_SETTINGS.eternalAiSettings;
		}

		if (
			data.archiveSettings.defaultDesktopExportPath === undefined &&
			typeof data.archiveSettings.defaultPeer === 'string'
		) {
			data.archiveSettings.defaultDesktopExportPath =
				data.archiveSettings.defaultPeer;
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
			eternalAiSettings: Object.assign(
				{},
				DEFAULT_SETTINGS.eternalAiSettings,
				data.eternalAiSettings
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
		await this.syncKoraServerConfig();
	}

	/**
	 * @description Синхронизирует конфигурацию Kora server и archive runtime с настройками плагина.
	 */
	private async syncKoraServerConfig() {
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
			eternalAiApiKey: this.settings.eternalAiSettings.apiKey,
			eternalAiBaseUrl: this.settings.eternalAiSettings.baseUrl,
			eternalAiModel: this.settings.eternalAiSettings.model,
			eternalAiDatabasePath: this.settings.eternalAiSettings.databasePath,
		};

		try {
			const isRunning = await this.gramjsBridge.isServerRunning();
			if (!isRunning) {
				console.log(
					'[syncKoraServerConfig] Kora server not running, skipping sync'
				);
				return;
			}

			await this.gramjsBridge.updateGramJSConfig(configPayload);

			console.log(
				'[syncKoraServerConfig] Configuration synced with Kora server'
			);
		} catch (error) {
			console.error(
				'[syncKoraServerConfig] Failed to sync with Kora server:',
				error
			);
		}

		try {
			const archiveServerConfig = this.archiveBridge?.getConfig();
			const koraServerConfig = this.gramjsBridge?.getConfig();
			const archiveServerIsPrimary =
				archiveServerConfig?.host === koraServerConfig?.host &&
				archiveServerConfig?.port === koraServerConfig?.port;

			if (archiveServerIsPrimary) {
				return;
			}

			const isArchiveServerRunning =
				await this.archiveBridge.isServerReachable();
			if (!isArchiveServerRunning) {
				console.log(
					'[syncKoraServerConfig] Archive server not running, skipping archive sync'
				);
				return;
			}

			await this.archiveBridge.updateArchiveServerConfig({
				mode: this.settings.gramjs.mode || 'userbot',
				botToken: this.settings.gramjs.botToken,
				apiId: this.settings.gramjs.apiId,
				apiHash: this.settings.gramjs.apiHash,
				stringSession: this.settings.gramjs.stringSession,
				archiveDatabasePath: this.settings.archiveSettings.databasePath,
				semanticBackend: 'sqlite',
				semanticDatabasePath: this.settings.vectorSettings.semanticDatabasePath,
				openaiApiKey: this.settings.vectorSettings.openaiApiKey,
				embeddingModel: this.settings.vectorSettings.embeddingModel,
				embeddingBaseUrl: this.settings.vectorSettings.embeddingBaseUrl,
			});
			console.log(
				'[syncKoraServerConfig] Configuration synced with archive server'
			);
		} catch (error) {
			console.error(
				'[syncKoraServerConfig] Failed to sync with archive server:',
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

	getVectorBridge() {
		return this.vectorBridge;
	}

	async activateArchiveView() {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: ARCHIVE_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	async activateEternalAiView() {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: ETERNAL_AI_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	async activateSqliteViewerView() {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: SQLITE_VIEWER_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	async activateWorkspaceStatusView() {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: WORKSPACE_STATUS_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}
}
