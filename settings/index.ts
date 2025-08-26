/**
 * index.ts
 *
 * Main entry point for MCP plugin settings tab.
 * Assembles modular settings sections: server, telegram, GramJS, custom emojis.
 */
import { App, PluginSettingTab } from 'obsidian';
import KoraPlugin from '../main';

/**
 * Settings tab for the MCP plugin, assembling all modular sections.
 */
export class McpSettingTab extends PluginSettingTab {
	plugin: KoraPlugin;

	constructor(app: App, plugin: KoraPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		(this.plugin as any).settingsTab = this;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Kora Settings' });
		containerEl.createEl('p', {
			text: 'Settings are now split into separate tabs: MCP Server, Telegram, Vector.',
		});
	}
}
