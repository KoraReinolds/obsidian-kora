/**
 * @module obsidian-plugin/views/related-chunks-view
 *
 * @description Obsidian host adapter для Vue-экрана related chunks.
 */
import { App as ObsidianApp, ItemView, WorkspaceLeaf } from 'obsidian';
import type { App as VueApp } from 'vue';
import type {
	VectorBridge,
	VectorSearchOptionsProvider,
} from '../../../../modules/vector';
import {
	mountVueInObsidian,
	unmountVueInObsidian,
} from '../../../../modules/hosts/obsidian';
import ObsidianLucideIcon from '../../../../modules/hosts/obsidian/ui-vue/ObsidianLucideIcon.vue';
import type KoraPlugin from '../main';
import { ObsidianChunkTransportAdapter } from '../../../../modules/chunking/adapters/obsidian-chunk-transport-adapter';
import RelatedChunksScreen from '../../../../modules/chunking/ui/RelatedChunksScreen.vue';

export const RELATED_CHUNKS_VIEW_TYPE = 'kora-related-chunks';

export class RelatedChunksView extends ItemView {
	private vueApp: VueApp | null = null;
	private readonly transport: ObsidianChunkTransportAdapter;

	constructor(
		leaf: WorkspaceLeaf,
		app: ObsidianApp,
		vectorBridge: VectorBridge,
		getVectorSearchOptions: VectorSearchOptionsProvider | undefined,
		private readonly plugin: KoraPlugin
	) {
		super(leaf);
		this.transport = new ObsidianChunkTransportAdapter(
			app,
			vectorBridge,
			getVectorSearchOptions
		);
	}

	getViewType(): string {
		return RELATED_CHUNKS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Related Chunks';
	}

	getIcon(): string {
		return 'git-branch';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.style.height = '100%';
		this.vueApp = mountVueInObsidian(
			container,
			RelatedChunksScreen,
			{ transport: this.transport, plugin: this.plugin },
			{ hostLucideIcon: ObsidianLucideIcon }
		);
	}

	async onClose(): Promise<void> {
		unmountVueInObsidian(this.vueApp);
		this.vueApp = null;
	}
}
