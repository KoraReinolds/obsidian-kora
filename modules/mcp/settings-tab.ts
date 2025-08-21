import { App, PluginSettingTab, Setting } from "obsidian";
import type KoraMcpPlugin from "../../main";

export class McpServerSettingTab extends PluginSettingTab {
	private plugin: KoraMcpPlugin;

	constructor(app: App, plugin: KoraMcpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		// @ts-ignore
		this.id = "kora-mcp-server-settings";
		// @ts-ignore
		this.name = "- Kora: MCP Server";
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'MCP Server Settings' });

		new Setting(containerEl)
			.setName('Server Port')
			.setDesc('The port for the MCP server to listen on. Restart server after changes.')
			.addText((text) =>
				text
					.setPlaceholder('8123')
					.setValue(this.plugin.settings.port.toString())
					.onChange(async (value) => {
						const port = parseInt(value, 10);
						if (!isNaN(port) && port > 0 && port < 65536) {
							this.plugin.settings.port = port;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}


