/**
 * @module chunking/ui/chunk-view
 *
 * @description Obsidian host adapter для Vue-экрана chunk list.
 */
import { App as ObsidianApp, ItemView, WorkspaceLeaf } from 'obsidian';
import type { App as VueApp } from 'vue';
import { mountVueInObsidian, unmountVueInObsidian } from '../../hosts/obsidian';
import type { VectorBridge } from '../../vector';
import ObsidianLucideIcon from '../../hosts/obsidian/ui-vue/ObsidianLucideIcon.vue';
import { ObsidianChunkTransportAdapter } from '../adapters/obsidian-chunk-transport-adapter';
import ChunkScreen from './ChunkScreen.vue';

export const CHUNK_VIEW_TYPE = 'kora-chunks';

export class ChunkView extends ItemView {
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
		return CHUNK_VIEW_TYPE;
	}
	getDisplayText(): string {
		return 'Kora Chunks';
	}
	getIcon(): string {
		return 'blocks';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.style.height = '100%';
		this.vueApp = mountVueInObsidian(
			container,
			ChunkScreen,
			{ transport: this.transport },
			{ hostLucideIcon: ObsidianLucideIcon }
		);
	}

	async onClose(): Promise<void> {
		unmountVueInObsidian(this.vueApp);
		this.vueApp = null;
	}
}
