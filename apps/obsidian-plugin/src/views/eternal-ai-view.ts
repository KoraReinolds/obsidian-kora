/**
 * @module obsidian-plugin/views/eternal-ai-view
 * @description Host adapter для экрана Eternal AI. View монтирует Vue feature в
 * отдельный Obsidian pane и передаёт ему transport, работающий через Kora server.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { App as VueApp } from 'vue';
import type KoraPlugin from '../main';
import { EternalAiScreen } from '../features/eternal-ai';
import {
	createEternalAiBridgeAdapter,
	EternalAiBridge,
} from '../features/eternal-ai';
import {
	createHostChatMessageContextMenuHandler,
	createHostImageContextMenuHandler,
	mountVueInObsidian,
	ObsidianLucideIcon,
	unmountVueInObsidian,
} from '../obsidian';

export const ETERNAL_AI_VIEW_TYPE = 'kora-eternal-ai';

export class EternalAiView extends ItemView {
	private vueApp: VueApp | null = null;
	private readonly bridge: EternalAiBridge;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: KoraPlugin
	) {
		super(leaf);
		this.bridge = new EternalAiBridge(
			this.plugin.getGramJSBridge().getConfig()
		);
	}

	getViewType(): string {
		return ETERNAL_AI_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Eternal AI';
	}

	getIcon(): string {
		return 'sparkles';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.style.height = '100%';
		this.vueApp = mountVueInObsidian(
			container,
			EternalAiScreen,
			{
				transport: createEternalAiBridgeAdapter(this.bridge),
				defaultSystemPrompt:
					this.plugin.settings.eternalAiSettings.defaultSystemPrompt || '',
				getPersistedChatModelId: () =>
					this.plugin.settings.eternalAiSettings.model,
				persistChatModelId: async (modelRef: string) => {
					this.plugin.settings.eternalAiSettings.model = modelRef;
					await this.plugin.saveSettings();
				},
			},
			{
				hostLucideIcon: ObsidianLucideIcon,
				hostImageContextMenu: createHostImageContextMenuHandler(this.app),
				hostChatMessageContextMenu: createHostChatMessageContextMenuHandler(
					this.app
				),
			}
		);
	}

	async onClose(): Promise<void> {
		unmountVueInObsidian(this.vueApp);
		this.vueApp = null;
	}
}
