/**
 * index.ts
 *
 * Main entry point for MCP plugin settings tab.
 * Assembles modular settings sections: server, telegram, GramJS, custom emojis.
 */
import { App, PluginSettingTab } from "obsidian";
import KoraMcpPlugin from "../main";
import { renderServerSettings } from "./ServerSettings";
import { renderTelegramSettings } from "./TelegramSettings";
import { renderCustomEmojiSettings } from "./CustomEmojiSettings";
import { renderGramJsSettings } from "./GramJsSettings";

/**
 * Settings tab for the MCP plugin, assembling all modular sections.
 */
export class McpSettingTab extends PluginSettingTab {
	plugin: KoraMcpPlugin;

	constructor(app: App, plugin: KoraMcpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		// Allow submodules to trigger re-render
		(this.plugin as any).settingsTab = this;
	}

	/**
	 * Render all settings sections in order.
	 */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		renderServerSettings(containerEl, this.plugin);
		renderTelegramSettings(containerEl, this.plugin);
		renderCustomEmojiSettings(containerEl, this.plugin);
		renderGramJsSettings(containerEl, this.plugin);
	}
}
