/**
 * @module obsidian-plugin/views/sqlite-viewer-view
 * @description Отдельный host-view для универсального SQLite viewer. Держит
 * low-level debug отдельно от Eternal AI UI и других feature-экранов.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { App as VueApp } from 'vue';
import type KoraPlugin from '../main';
import {
	ObsidianLucideIcon,
	mountVueInObsidian,
	unmountVueInObsidian,
} from '../obsidian';
import { SqliteViewerBridge } from '../features/sqlite-viewer/transport/sqlite-viewer-bridge';
import SqliteViewerScreen from '../features/sqlite-viewer/ui/SqliteViewerScreen.vue';

export const SQLITE_VIEWER_VIEW_TYPE = 'kora-sqlite-viewer';

export class SqliteViewerView extends ItemView {
	private vueApp: VueApp | null = null;
	private readonly bridge: SqliteViewerBridge;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: KoraPlugin
	) {
		super(leaf);
		this.bridge = new SqliteViewerBridge(
			this.plugin.getGramJSBridge().getConfig()
		);
	}

	getViewType(): string {
		return SQLITE_VIEWER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'SQLite Viewer';
	}

	getIcon(): string {
		return 'database';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.style.height = '100%';
		this.vueApp = mountVueInObsidian(
			container,
			SqliteViewerScreen,
			{
				transport: this.bridge,
			},
			{
				hostLucideIcon: ObsidianLucideIcon,
			}
		);
	}

	async onClose(): Promise<void> {
		unmountVueInObsidian(this.vueApp);
		this.vueApp = null;
	}
}
