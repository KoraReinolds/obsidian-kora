/**
 * @module obsidian-plugin/views/archive-view
 *
 * @description Obsidian host adapter для archive feature.
 * Класс отвечает только за lifecycle mount/unmount Vue-экрана.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { App } from 'vue';
import type KoraPlugin from '../main';
import { ArchiveBridge } from '../telegram';
import { ArchiveScreen, createArchiveBridgeAdapter } from '../telegram/archive';
import { createPipelineRuntimeBridgeAdapter } from '../telegram/pipeline';
import { VectorBridge } from '../vector';
import {
	mountVueInObsidian,
	ObsidianLucideIcon,
	unmountVueInObsidian,
} from '../obsidian';

export const ARCHIVE_VIEW_TYPE = 'kora-telegram-archive';

/**
 * @description Host adapter для монтирования archive Vue feature в Obsidian ItemView.
 */
export class ArchiveView extends ItemView {
	private vueApp: App | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: KoraPlugin,
		private readonly archiveBridge: ArchiveBridge,
		private readonly vectorBridge: VectorBridge
	) {
		super(leaf);
	}

	getViewType(): string {
		return ARCHIVE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Архив Telegram';
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
			ArchiveScreen,
			{
				transport: createArchiveBridgeAdapter(this.archiveBridge),
				pipelineTransport: createPipelineRuntimeBridgeAdapter(
					this.archiveBridge,
					this.vectorBridge
				),
				defaultPeer:
					this.plugin.settings.archiveSettings.defaultDesktopExportPath || '',
				defaultSyncLimit: this.plugin.settings.archiveSettings.defaultSyncLimit,
				recentMessagesLimit:
					this.plugin.settings.archiveSettings.recentMessagesLimit,
				defaultChunkSize: 6,
				defaultGapMinutes: 30,
			},
			{ hostLucideIcon: ObsidianLucideIcon }
		);
	}

	/**
	 * @description Размонтирует Vue приложение при закрытии view.
	 * @returns {Promise<void>}
	 */
	async onClose(): Promise<void> {
		unmountVueInObsidian(this.vueApp);
		this.vueApp = null;
	}
}
