/**
 * @module obsidian-plugin/views/workspace-status-view
 * @description Host-view для панели управления managed git-репозиториями
 * из `workspace-meta`, включая bulk actions и commit drafts.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { App as VueApp } from 'vue';
import type { App as ObsidianApp } from 'obsidian';
import type KoraPlugin from '../main';
import {
	ObsidianLucideIcon,
	mountVueInObsidian,
	unmountVueInObsidian,
} from '../obsidian';
import { WorkspaceStatusBridge } from '../features/workspace-status/transport/workspace-status-bridge';
import WorkspaceStatusScreen from '../features/workspace-status/ui/WorkspaceStatusScreen.vue';

export const WORKSPACE_STATUS_VIEW_TYPE = 'kora-workspace-status';

export class WorkspaceStatusView extends ItemView {
	private vueApp: VueApp | null = null;
	private readonly transport: WorkspaceStatusBridge;

	constructor(leaf: WorkspaceLeaf, app: ObsidianApp, plugin: KoraPlugin) {
		super(leaf);
		const serverConfig = plugin.getGramJSBridge().getConfig();
		this.transport = new WorkspaceStatusBridge(app, {
			serverHost: serverConfig.host,
			serverPort: serverConfig.port,
		});
	}

	getViewType(): string {
		return WORKSPACE_STATUS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Workspace Git Status';
	}

	getIcon(): string {
		return 'folder-git-2';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.style.height = '100%';
		this.vueApp = mountVueInObsidian(
			container,
			WorkspaceStatusScreen,
			{
				transport: this.transport,
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
