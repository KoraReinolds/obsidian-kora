/**
 * GramJsSettings.ts
 *
 * Settings UI for GramJS userbot configuration.
 */
import { Setting, Notice } from "obsidian";
import KoraMcpPlugin from "../main";

export function renderGramJsSettings(containerEl: HTMLElement, plugin: KoraMcpPlugin): void {
	// Clear the container to avoid duplication when refreshing
	containerEl.empty();
	
	containerEl.createEl("h2", { text: "GramJS Settings" });

	// Enable GramJS userbot
	new Setting(containerEl)
		.setName("Use GramJS")
		.setDesc("Enable GramJS integration for Telegram functionality")
		.addToggle((toggle) =>
			toggle
				.setValue(plugin.settings.useGramJsUserbot || false)
				.onChange(async (value) => {
					plugin.settings.useGramJsUserbot = value;
					await plugin.saveSettings();
				})
		);

	// GramJS Mode Selection
	new Setting(containerEl)
		.setName("GramJS Mode")
		.setDesc("Choose between bot mode (BotFather bot) or userbot mode (personal account)")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("bot", "Bot Mode (BotFather)")
				.addOption("userbot", "Userbot Mode (Personal Account)")
				.setValue(plugin.settings.gramjs?.mode || "userbot")
				.onChange(async (value) => {
					if (!plugin.settings.gramjs) {
						plugin.settings.gramjs = {};
					}
					plugin.settings.gramjs.mode = value;
					await plugin.saveSettings();
					// Refresh the settings UI to show/hide relevant fields
					renderGramJsSettings(containerEl, plugin);
				})
		);

	const currentMode = plugin.settings.gramjs?.mode || "userbot";

	// Bot Token (only for bot mode)
	if (currentMode === "bot") {
		new Setting(containerEl)
			.setName("Bot Token")
			.setDesc("Bot token from @BotFather")
			.addText((text) =>
				text
					.setPlaceholder("123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11")
					.setValue(plugin.settings.gramjs?.botToken || "")
					.onChange(async (value) => {
						if (!plugin.settings.gramjs) {
							plugin.settings.gramjs = {};
						}
						plugin.settings.gramjs.botToken = value;
						await plugin.saveSettings();
					})
			);
	}

	// API ID and Hash (required for both modes)
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

	// Session String (only for userbot mode)
	if (currentMode === "userbot") {
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
	}

	// Chat ID (for both modes, but description differs)
	new Setting(containerEl)
		.setName(`Chat ID for ${currentMode === "bot" ? "Bot" : "Userbot"}`)
		.setDesc(currentMode === "bot" 
			? "Chat ID where bot can send messages (bot must be added to chat first)"
			: "Telegram chat ID or username for userbot (e.g., @username or -100123456789)"
		)
		.addText((text) =>
			text
				.setPlaceholder(currentMode === "bot" ? "-100123456789" : "@username or -100123456789")
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
		text: `To use GramJS in ${currentMode} mode, you need to:`,
		cls: "setting-item-description",
	});
	
	const infoList = containerEl.createEl("ol");
	infoList.createEl("li", { text: "Get API ID and Hash from https://my.telegram.org/apps" });
	
	if (currentMode === "bot") {
		infoList.createEl("li", { text: "Create a bot with @BotFather and get the bot token" });
		infoList.createEl("li", { text: "Add your bot to the target chat/group" });
	} else {
		infoList.createEl("li", { text: "Generate session string on first login (userbot mode)" });
	}
	
	infoList.createEl("li", { text: "Install dependencies: npm install" });
	infoList.createEl("li", { text: "Start GramJS server: npm run gramjs-server" });
	infoList.createEl("li", { text: "Configure settings above and test connection" });
	
	// Mode-specific warnings
	if (currentMode === "bot") {
		containerEl.createEl("div", {
			text: "⚠️ Bot mode limitations: Bots cannot send messages to users directly and have limited access to chat history.",
			cls: "setting-item-description",
		});
	} else {
		containerEl.createEl("div", {
			text: "⚠️ Userbot mode: Uses your personal Telegram account. Use responsibly and respect Telegram's terms.",
			cls: "setting-item-description",
		});
	}
}