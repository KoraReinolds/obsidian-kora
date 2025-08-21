import { App, PluginSettingTab, Setting, TFolder, Notice } from "obsidian";
import type KoraMcpPlugin, { TelegramFolderConfig, TelegramChannelConfig } from "../../main";

export class TelegramSettingTab extends PluginSettingTab {
	private plugin: KoraMcpPlugin;

	constructor(app: App, plugin: KoraMcpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.id = "kora-telegram-settings";
		this.name = "Kora: Telegram";
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderTelegramBasics(containerEl);
		this.renderCustomEmojis(containerEl);
		this.renderFolderConfigs(containerEl);
		this.renderGramJs(containerEl);
	}

	private renderTelegramBasics(containerEl: HTMLElement) {
		containerEl.createEl('h2', { text: 'Telegram Settings' });

		new Setting(containerEl)
			.setName('Chat ID')
			.setDesc('Channel or chat ID (e.g., @mychannel or -1001234567890)')
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
			.setName('Disable Link Preview')
			.setDesc('Disable web page preview for links in messages')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.telegram.disableWebPagePreview || false)
					.onChange(async (value) => {
						this.plugin.settings.telegram.disableWebPagePreview = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private renderCustomEmojis(containerEl: HTMLElement) {
		containerEl.createEl('h3', { text: 'Custom Emojis' });

		new Setting(containerEl)
			.setName('Enable Custom Emojis')
			.setDesc('Replace standard emojis with custom ones from your packs')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.telegram.useCustomEmojis || false)
					.onChange(async (value) => {
						this.plugin.settings.telegram.useCustomEmojis = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (!this.plugin.settings.telegram.useCustomEmojis) return;

		const mappings = this.plugin.settings.telegram.customEmojis || [];

		const descEl = containerEl.createEl('div', {
			cls: 'setting-item-description',
			text: 'To get custom_emoji_id: send a custom emoji to @userinfobot, it will reply with JSON containing custom_emoji_id.'
		});
		descEl.style.marginBottom = '15px';
		descEl.style.fontStyle = 'italic';

		mappings.forEach((mapping: any) => {
			const setting = new Setting(containerEl)
				.setName(`${mapping.standard} → Custom`)
				.setDesc(mapping.description || `Mapping for emoji ${mapping.standard}`)
				.addButton((button) =>
					button
						.setButtonText('Remove')
						.setWarning()
						.onClick(async () => {
							if (this.plugin.settings.telegram.customEmojis) {
								this.plugin.settings.telegram.customEmojis = this.plugin.settings.telegram.customEmojis.filter(
									(m: any) => m.standard !== mapping.standard
								);
							}
							await this.plugin.saveSettings();
							this.display();
						})
				);

			const customIdEl = setting.settingEl.createEl('div', {
				text: `ID: ${mapping.customId}`,
				cls: 'setting-item-description'
			});
			customIdEl.style.marginTop = '5px';
			customIdEl.style.fontFamily = 'monospace';
			customIdEl.style.fontSize = '12px';
		});

		const addContainer = containerEl.createEl('div', { cls: 'setting-item' });
		addContainer.createEl('h4', { text: 'Add New Mapping' });

		let newStandardEmoji = '';
		let newCustomId = '';
		let newDescription = '';

		new Setting(addContainer)
			.setName('Standard Emoji')
			.setDesc('Standard emoji to replace (e.g., 📝)')
			.addText((text) => text.setPlaceholder('📝').onChange((value) => { newStandardEmoji = value; }));

		new Setting(addContainer)
			.setName('Custom Emoji ID')
			.setDesc('ID of the custom emoji from Telegram')
			.addText((text) => text.setPlaceholder('5789574674987654321').onChange((value) => { newCustomId = value; }));

		new Setting(addContainer)
			.setName('Description (optional)')
			.setDesc('Description for convenience')
			.addText((text) => text.setPlaceholder('Beautiful note').onChange((value) => { newDescription = value; }));

		new Setting(addContainer)
			.setName('Add Mapping')
			.addButton((button) =>
				button
					.setButtonText('Add')
					.setCta()
					.onClick(async () => {
						if (newStandardEmoji && newCustomId) {
							if (!this.plugin.settings.telegram.customEmojis) {
								this.plugin.settings.telegram.customEmojis = [];
							}
							const existingIndex = this.plugin.settings.telegram.customEmojis.findIndex((m: any) => m.standard === newStandardEmoji);
							if (existingIndex !== -1) {
								this.plugin.settings.telegram.customEmojis[existingIndex] = {
									standard: newStandardEmoji,
									customId: newCustomId,
									description: newDescription || undefined
								};
							} else {
								this.plugin.settings.telegram.customEmojis.push({ standard: newStandardEmoji, customId: newCustomId, description: newDescription || undefined });
							}
							await this.plugin.saveSettings();
							this.display();
						} else {
							new Notice('Please provide both Standard emoji and Custom Emoji ID');
						}
					})
			);
	}

	private renderFolderConfigs(containerEl: HTMLElement) {
		containerEl.createEl('h3', { text: 'Folder-based Posting Configuration' });
		containerEl.createEl('p', { text: 'Configure folders and their associated Telegram channels for automatic posting.', cls: 'setting-item-description' });

		const folderConfigs = this.plugin.settings.telegram.folderConfigs || [];

		folderConfigs.forEach((config: TelegramFolderConfig, configIndex: number) => {
			const configContainer = containerEl.createDiv('telegram-folder-config');
			configContainer.style.border = '1px solid var(--background-modifier-border)';
			configContainer.style.borderRadius = '8px';
			configContainer.style.padding = '16px';
			configContainer.style.marginBottom = '16px';

			new Setting(configContainer)
				.setName(`Folder ${configIndex + 1}`)
				.setDesc('Select the folder for this configuration')
				.addSearch((search) => {
					search
						.setPlaceholder('Type folder path...')
						.setValue(config.folder)
						.onChange(async (value) => {
							config.folder = value;
							await this.plugin.saveSettings();
						});

					const folders = this.plugin.app.vault.getAllLoadedFiles().filter((file: any) => file instanceof TFolder).map((folder: TFolder) => folder.path);
					search.containerEl.addEventListener('input', () => {
						const query = search.getValue().toLowerCase();
						const suggestions = folders.filter((path: string) => path.toLowerCase().includes(query));
						if (suggestions.length > 0 && query.length > 0) {
							search.containerEl.title = `Suggestions: ${suggestions.slice(0, 3).join(', ')}`;
						}
					});
				})
				.addButton((button) =>
					button
						.setButtonText('Remove')
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.telegram.folderConfigs.splice(configIndex, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);

			new Setting(configContainer)
				.setName('Bot Token')
				.setDesc('Telegram bot token for this folder')
				.addText((text) =>
					text
						.setPlaceholder('Enter bot token')
						.setValue(config.botToken)
						.onChange(async (value) => {
							config.botToken = value;
							await this.plugin.saveSettings();
						})
				);

			const channelsContainer = configContainer.createDiv();
			channelsContainer.createEl('h4', { text: 'Channels' });
			this.renderChannels(channelsContainer, config, configIndex);

			new Setting(configContainer)
				.setName('Add Channel')
				.setDesc('Add a new channel for this folder')
				.addButton((button) =>
					button
						.setButtonText('Add Channel')
						.onClick(async () => {
							const newChannel: TelegramChannelConfig = { name: '', channelId: '' };
							config.channels.push(newChannel);
							await this.plugin.saveSettings();
							this.display();
						})
				);
		});

		new Setting(containerEl)
			.setName('Add Folder Configuration')
			.setDesc('Add a new folder with Telegram bot configuration')
			.addButton((button) =>
				button
					.setButtonText('Add Configuration')
					.setCta()
					.onClick(async () => {
						const newConfig: TelegramFolderConfig = { folder: '', botToken: '', channels: [] };
						this.plugin.settings.telegram.folderConfigs.push(newConfig);
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}

	private renderChannels(containerEl: HTMLElement, config: TelegramFolderConfig, configIndex: number) {
		config.channels.forEach((channel: TelegramChannelConfig, channelIndex: number) => {
			const channelContainer = containerEl.createDiv('telegram-channel-config');
			channelContainer.style.marginLeft = '20px';
			channelContainer.style.padding = '8px';
			channelContainer.style.border = '1px solid var(--background-modifier-border-hover)';
			channelContainer.style.borderRadius = '4px';
			channelContainer.style.marginBottom = '8px';

			new Setting(channelContainer)
				.setName(`Channel ${channelIndex + 1} Name`)
				.setDesc('Display name for the channel (shown on button)')
				.addText((text) => text.setPlaceholder('Channel name').setValue(channel.name).onChange(async (value) => { channel.name = value; await this.plugin.saveSettings(); }));

			new Setting(channelContainer)
				.setName('Channel ID')
				.setDesc('Telegram channel ID (e.g., @mychannel or -1001234567890)')
				.addText((text) => text.setPlaceholder('Channel ID').setValue(channel.channelId).onChange(async (value) => { channel.channelId = value; await this.plugin.saveSettings(); }))
				.addButton((button) =>
					button
						.setButtonText('Remove')
						.setWarning()
						.onClick(async () => {
							config.channels.splice(channelIndex, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);
		});
	}

	private renderGramJs(containerEl: HTMLElement) {
		containerEl.createEl('h2', { text: 'GramJS Settings' });

		new Setting(containerEl)
			.setName('Use GramJS')
			.setDesc('Enable GramJS integration for Telegram functionality')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useGramJsUserbot || false)
					.onChange(async (value) => {
						this.plugin.settings.useGramJsUserbot = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (!this.plugin.settings.useGramJsUserbot) return;

		const gram = this.plugin.settings.gramjs || {};
		this.plugin.settings.gramjs = gram; // ensure object exists, do not reset later

		new Setting(containerEl)
			.setName('GramJS Mode')
			.setDesc('Choose between bot mode (BotFather bot) or userbot mode (personal account)')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('bot', 'Bot Mode (BotFather)')
					.addOption('userbot', 'Userbot Mode (Personal Account)')
					.setValue(gram.mode || 'userbot')
					.onChange(async (value) => {
						this.plugin.settings.gramjs = { ...this.plugin.settings.gramjs, mode: value as 'bot' | 'userbot' };
						await this.plugin.saveSettings();
						this.display();
					})
			);

		const currentMode = this.plugin.settings.gramjs?.mode || 'userbot';

		if (currentMode === 'bot') {
			new Setting(containerEl)
				.setName('Bot Token')
				.setDesc('Bot token from @BotFather')
				.addText((text) =>
					text
						.setPlaceholder('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11')
						.setValue(this.plugin.settings.gramjs?.botToken || '')
						.onChange(async (value) => {
							this.plugin.settings.gramjs = { ...this.plugin.settings.gramjs, botToken: value };
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName('Telegram API ID')
			.setDesc('Your Telegram API ID from https://my.telegram.org/apps')
			.addText((text) =>
				text
					.setPlaceholder('123456')
					.setValue(this.plugin.settings.gramjs?.apiId?.toString() || '')
					.onChange(async (value) => {
						const apiId = parseInt(value) || 0;
						this.plugin.settings.gramjs = { ...this.plugin.settings.gramjs, apiId };
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Telegram API Hash')
			.setDesc('Your Telegram API Hash from https://my.telegram.org/apps')
			.addText((text) =>
				text
					.setPlaceholder('your_api_hash')
					.setValue(this.plugin.settings.gramjs?.apiHash || '')
					.onChange(async (value) => {
						this.plugin.settings.gramjs = { ...this.plugin.settings.gramjs, apiHash: value };
						await this.plugin.saveSettings();
					})
			);

		if (currentMode === 'userbot') {
			new Setting(containerEl)
				.setName('Session String')
				.setDesc('GramJS session string (generated after first login)')
				.addTextArea((text) =>
					text
						.setPlaceholder('1BVtsOLABu...')
						.setValue(this.plugin.settings.gramjs?.stringSession || '')
						.onChange(async (value) => {
							this.plugin.settings.gramjs = { ...this.plugin.settings.gramjs, stringSession: value };
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName(`Chat ID for ${currentMode === 'bot' ? 'Bot' : 'Userbot'}`)
			.setDesc(currentMode === 'bot' ? 'Chat ID where bot can send messages (add bot to chat first)' : 'Telegram chat ID or username (e.g., @username or -100123456789)')
			.addText((text) =>
				text
					.setPlaceholder(currentMode === 'bot' ? '-100123456789' : '@username or -100123456789')
					.setValue(this.plugin.settings.gramjs?.chatId || '')
					.onChange(async (value) => {
						this.plugin.settings.gramjs = { ...this.plugin.settings.gramjs, chatId: value };
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Test GramJS Connection')
			.setDesc('Test connection to GramJS server')
			.addButton((button) =>
				button
					.setButtonText('Test Connection')
					.setTooltip('Test GramJS server connection')
					.onClick(async () => {
						const bridge = this.plugin.getGramJSBridge?.() || (this.plugin as any).gramjsBridge;
						if (bridge) {
							await bridge.testConnection();
						} else {
							new Notice('GramJS bridge not initialized');
						}
					})
			);

		containerEl.createEl('div', { text: `To use GramJS in ${currentMode} mode, you need to:`, cls: 'setting-item-description' });
		const infoList = containerEl.createEl('ol');
		infoList.createEl('li', { text: 'Get API ID and Hash from https://my.telegram.org/apps' });
		if (currentMode === 'bot') {
			infoList.createEl('li', { text: 'Create a bot with @BotFather and get the bot token' });
			infoList.createEl('li', { text: 'Add your bot to the target chat/group' });
		} else {
			infoList.createEl('li', { text: 'Generate session string on first login (userbot mode)' });
		}
		infoList.createEl('li', { text: 'Install dependencies: npm install' });
		infoList.createEl('li', { text: 'Start GramJS server: npm run gramjs-server' });
		infoList.createEl('li', { text: 'Configure settings above and test connection' });

		if (currentMode === 'bot') {
			containerEl.createEl('div', { text: '⚠️ Bot mode limitations: Bots cannot send messages to users directly and have limited access to chat history.', cls: 'setting-item-description' });
		} else {
			containerEl.createEl('div', { text: '⚠️ Userbot mode: Uses your personal Telegram account. Use responsibly and respect Telegram\'s terms.', cls: 'setting-item-description' });
		}
	}
}


