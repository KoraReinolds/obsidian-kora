/**
 * @module obsidian-plugin/views/semantic-inspector-view
 *
 * @description Хост-адаптер Obsidian: монтирует Vue-экран semantic inspector
 * в правую панель (`ItemView`).
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { App as VueApp } from 'vue';
import type { App as ObsidianApp } from 'obsidian';
import {
	ObsidianLucideIcon,
	mountVueInObsidian,
	unmountVueInObsidian,
} from '../../../../modules/hosts/obsidian';
import type { VectorSearchOptionsProvider } from '../vector';
import { VectorBridge } from '../vector';
import { ObsidianSemanticInspectorTransportAdapter } from '../../../../modules/semantic-inspector/adapters/obsidian-semantic-inspector-transport-adapter';
import SemanticInspectorScreen from '../../../../modules/semantic-inspector/ui/SemanticInspectorScreen.vue';

export const SEMANTIC_INSPECTOR_VIEW_TYPE = 'kora-semantic-inspector';

/**
 * @description Монтирует UI semantic inspector во view правой панели Obsidian.
 */
export class SemanticInspectorView extends ItemView {
	private vueApp: VueApp | null = null;
	private readonly transport: ObsidianSemanticInspectorTransportAdapter;

	constructor(
		leaf: WorkspaceLeaf,
		app: ObsidianApp,
		vectorBridge: VectorBridge,
		getVectorSearchOptions?: VectorSearchOptionsProvider
	) {
		super(leaf);
		this.transport = new ObsidianSemanticInspectorTransportAdapter(
			app,
			vectorBridge,
			getVectorSearchOptions
		);
	}

	getViewType(): string {
		return SEMANTIC_INSPECTOR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Semantic Inspector';
	}

	getIcon(): string {
		return 'search';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.style.height = '100%';
		this.vueApp = mountVueInObsidian(
			container,
			SemanticInspectorScreen,
			{ transport: this.transport },
			{ hostLucideIcon: ObsidianLucideIcon }
		);
	}

	async onClose(): Promise<void> {
		unmountVueInObsidian(this.vueApp);
		this.vueApp = null;
	}
}
