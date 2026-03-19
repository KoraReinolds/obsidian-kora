/**
 * @module telegram/ui/archive-view
 *
 * @description Obsidian host adapter для archive feature.
 * Класс отвечает только за lifecycle mount/unmount Vue экрана.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { App } from 'vue';
import type KoraPlugin from '../../../main';
import { ArchiveBridge } from '../transport/archive-bridge';
import {
	ArchiveScreen,
	createArchiveBridgeAdapter,
} from '../../features/telegram/archive';
import { mountVueInObsidian, unmountVueInObsidian } from '../../hosts/obsidian';

export const ARCHIVE_VIEW_TYPE = 'kora-telegram-archive';

/**
 * @description Host adapter для монтирования archive Vue feature в Obsidian ItemView.
 */
export class ArchiveView extends ItemView {
	private vueApp: App | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: KoraPlugin,
		private readonly archiveBridge: ArchiveBridge
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

		this.vueApp = mountVueInObsidian(container, ArchiveScreen, {
			transport: createArchiveBridgeAdapter(this.archiveBridge),
			defaultPeer: this.plugin.settings.archiveSettings.defaultPeer || '',
			defaultSyncLimit: this.plugin.settings.archiveSettings.defaultSyncLimit,
			recentMessagesLimit:
				this.plugin.settings.archiveSettings.recentMessagesLimit,
		});
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
