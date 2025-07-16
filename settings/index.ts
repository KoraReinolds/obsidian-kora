import { App, PluginSettingTab, Setting } from "obsidian";
import KoraMcpPlugin from "../main";

export class McpSettingTab extends PluginSettingTab {
	plugin: KoraMcpPlugin;

	constructor(app: App, plugin: KoraMcpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'MCP Server Settings' });

		new Setting(containerEl)
			.setName('Server Port')
			.setDesc(
				'The port for the MCP server to listen on. The server needs to be restarted for changes to take effect.'
			)
			.addText((text) =>
				text
					.setPlaceholder('Enter port')
					.setValue(this.plugin.settings.port.toString())
					.onChange(async (value) => {
						const port = parseInt(value, 10);
						if (!isNaN(port) && port > 0 && port < 65536) {
							this.plugin.settings.port = port;
							await this.plugin.saveSettings();
						}
					})
			);

		containerEl.createEl('h2', { text: 'Telegram Bot Settings' });

		new Setting(containerEl)
			.setName('Enable Telegram Bot')
			.setDesc('Enable sending notes to Telegram channel')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.telegram.enabled)
					.onChange(async (value) => {
						this.plugin.settings.telegram.enabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Bot Token')
			.setDesc('Telegram bot token (получить у @BotFather)')
			.addText((text) =>
				text
					.setPlaceholder('Enter bot token')
					.setValue(this.plugin.settings.telegram.botToken)
					.onChange(async (value) => {
						this.plugin.settings.telegram.botToken = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Chat ID')
			.setDesc('ID канала или чата для отправки сообщений (например: @mychannel или -1001234567890)')
			.addText((text) =>
				text
					.setPlaceholder('Enter chat ID')
					.setValue(this.plugin.settings.telegram.chatId)
					.onChange(async (value) => {
						this.plugin.settings.telegram.chatId = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Test Connection')
			.setDesc('Test Telegram bot connection')
			.addButton((button) =>
				button
					.setButtonText('Test Bot')
					.setCta()
					.onClick(async () => {
						await this.plugin.testTelegramConnection();
					})
			);
	}
}
