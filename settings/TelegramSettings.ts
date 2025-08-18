/**
 * TelegramSettings.ts
 *
 * Provides UI for Telegram settings used by GramJS userbot.
 * Contains chat ID and custom emoji settings.
 */
import { Setting } from "obsidian";

/**
 * Render the Telegram bot settings section in the settings tab.
 * @param {HTMLElement} containerEl - The container element to render into.
 * @param {any} plugin - The plugin instance containing settings and saveSettings().
 */
export function renderTelegramSettings(containerEl: HTMLElement, plugin: any): void {
	containerEl.createEl('h2', { text: 'Telegram Settings' });



	new Setting(containerEl)
		.setName('Chat ID')
		.setDesc('Channel or chat ID for sending messages (e.g., @mychannel or -1001234567890)')
		.addText((text) =>
			text
				.setPlaceholder('Enter chat ID')
				.setValue(plugin.settings.telegram.chatId)
				.onChange(async (value) => {
					plugin.settings.telegram.chatId = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName('Enable Custom Emojis')
		.setDesc('Replace standard emojis with custom ones from your packs')
		.addToggle((toggle) =>
			toggle
				.setValue(plugin.settings.telegram.useCustomEmojis || false)
				.onChange(async (value) => {
					plugin.settings.telegram.useCustomEmojis = value;
					await plugin.saveSettings();
					plugin.settingsTab.display(); // Re-render settings
				})
		);

	new Setting(containerEl)
		.setName('Disable Link Preview')
		.setDesc('Disable web page preview for links in messages')
		.addToggle((toggle) =>
			toggle
				.setValue(plugin.settings.telegram.disableWebPagePreview || false)
				.onChange(async (value) => {
					plugin.settings.telegram.disableWebPagePreview = value;
					await plugin.saveSettings();
				})
		);





} 