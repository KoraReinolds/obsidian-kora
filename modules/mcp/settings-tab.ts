import { App, PluginSettingTab, Setting } from 'obsidian';
import type KoraPlugin from '../../main';

export class McpServerSettingTab extends PluginSettingTab {
	private plugin: KoraPlugin;
	private id: string;
	private name: string;

	constructor(app: App, plugin: KoraPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.id = 'kora-mcp-server-settings';
		this.name = '- Kora: MCP Server';
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'MCP Server Settings' });

		new Setting(containerEl)
			.setName('Server Port')
			.setDesc(
				'The port for the MCP server to listen on. Restart server after changes.'
			)
			.addText(text =>
				text
					.setPlaceholder('8123')
					.setValue(this.plugin.settings.port.toString())
					.onChange(async value => {
						const port = parseInt(value, 10);
						if (!isNaN(port) && port > 0 && port < 65536) {
							this.plugin.settings.port = port;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}
