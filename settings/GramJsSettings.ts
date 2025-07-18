/**
 * GramJsSettings.ts
 *
 * Settings UI for GramJS userbot configuration.
 */
import { Setting, Notice } from "obsidian";
import KoraMcpPlugin from "../main";

export function renderGramJsSettings(containerEl: HTMLElement, plugin: KoraMcpPlugin): void {
	containerEl.createEl("h2", { text: "GramJS Userbot Settings" });

	// Enable GramJS userbot
	new Setting(containerEl)
		.setName("Use GramJS userbot")
		.setDesc("Enable GramJS userbot instead of regular Telegram bot for custom emojis support")
		.addToggle((toggle) =>
			toggle
				.setValue(plugin.settings.useGramJsUserbot || false)
				.onChange(async (value) => {
					plugin.settings.useGramJsUserbot = value;
					await plugin.saveSettings();
				})
		);

	// GramJS API ID
	new Setting(containerEl)
		.setName("Telegram API ID")
		.setDesc("Your Telegram API ID from https://my.telegram.org/apps")
		.addText((text) =>
			text
				.setPlaceholder("123456")
				.setValue(plugin.settings.gramjs?.apiId?.toString() || "")
				.onChange(async (value) => {
					if (!plugin.settings.gramjs) {
						plugin.settings.gramjs = {};
					}
					plugin.settings.gramjs.apiId = parseInt(value) || 0;
					await plugin.saveSettings();
				})
		);

	// GramJS API Hash
	new Setting(containerEl)
		.setName("Telegram API Hash")
		.setDesc("Your Telegram API Hash from https://my.telegram.org/apps")
		.addText((text) =>
			text
				.setPlaceholder("your_api_hash")
				.setValue(plugin.settings.gramjs?.apiHash || "")
				.onChange(async (value) => {
					if (!plugin.settings.gramjs) {
						plugin.settings.gramjs = {};
					}
					plugin.settings.gramjs.apiHash = value;
					await plugin.saveSettings();
				})
		);

	// GramJS Session String
	new Setting(containerEl)
		.setName("Session String")
		.setDesc("GramJS session string (generated after first login)")
		.addTextArea((text) =>
			text
				.setPlaceholder("1BVtsOLABu...")
				.setValue(plugin.settings.gramjs?.stringSession || "")
				.onChange(async (value) => {
					if (!plugin.settings.gramjs) {
						plugin.settings.gramjs = {};
					}
					plugin.settings.gramjs.stringSession = value;
					await plugin.saveSettings();
				})
		);

	// GramJS Chat ID
	new Setting(containerEl)
		.setName("Chat ID for GramJS")
		.setDesc("Telegram chat ID or username for GramJS userbot (e.g., @username or -100123456789)")
		.addText((text) =>
			text
				.setPlaceholder("@username or -100123456789")
				.setValue(plugin.settings.gramjs?.chatId || "")
				.onChange(async (value) => {
					if (!plugin.settings.gramjs) {
						plugin.settings.gramjs = {};
					}
					plugin.settings.gramjs.chatId = value;
					await plugin.saveSettings();
				})
		);

	// Test GramJS connection
	new Setting(containerEl)
		.setName("Test GramJS Connection")
		.setDesc("Test connection to GramJS server")
		.addButton((button) =>
			button
				.setButtonText("Test Connection")
				.setTooltip("Test GramJS server connection")
				.onClick(async () => {
					const bridge = (plugin as any).gramjsBridge;
					if (bridge) {
						await bridge.testConnection();
					} else {
						new Notice("GramJS bridge not initialized");
					}
				})
		);

	// Info about GramJS server
	containerEl.createEl("div", {
		text: "To use GramJS userbot, you need to:",
		cls: "setting-item-description",
	});
	
	const infoList = containerEl.createEl("ol");
	infoList.createEl("li", { text: "Get API ID and Hash from https://my.telegram.org/apps" });
	infoList.createEl("li", { text: "Install dependencies: npm install" });
	infoList.createEl("li", { text: "Start GramJS server: npm run gramjs-server" });
	infoList.createEl("li", { text: "Generate session string on first login" });
	infoList.createEl("li", { text: "Configure settings above and test connection" });
}