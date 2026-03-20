/**
 * @module chunking/ui/related-chunks-view
 *
 * @description Obsidian host adapter для Vue-экрана related chunks.
 */
import { App as ObsidianApp, ItemView, WorkspaceLeaf } from 'obsidian';
import type { App as VueApp } from 'vue';
import type { VectorBridge } from '../../vector';
import { mountVueInObsidian, unmountVueInObsidian } from '../../hosts/obsidian';
import ObsidianLucideIcon from '../../hosts/obsidian/ui-vue/ObsidianLucideIcon.vue';
import { ObsidianChunkTransportAdapter } from '../adapters/obsidian-chunk-transport-adapter';
import RelatedChunksScreen from './RelatedChunksScreen.vue';

export const RELATED_CHUNKS_VIEW_TYPE = 'kora-related-chunks';

export class RelatedChunksView extends ItemView {
	private vueApp: VueApp | null = null;
	private readonly transport: ObsidianChunkTransportAdapter;

	constructor(
		leaf: WorkspaceLeaf,
		app: ObsidianApp,
		vectorBridge: VectorBridge
	) {
		super(leaf);
		this.transport = new ObsidianChunkTransportAdapter(app, vectorBridge);
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
			{ transport: this.transport },
			{ hostLucideIcon: ObsidianLucideIcon }
		);
	}

	async onClose(): Promise<void> {
		unmountVueInObsidian(this.vueApp);
		this.vueApp = null;
	}
}
