import KoraPlugin, {
	TelegramChannelConfig,
	TelegramFolderConfig,
} from '../../../main';
import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { FolderSuggest } from '../../obsidian/suggester-modal';

export class TelegramSettingTab extends PluginSettingTab {
	private plugin: KoraPlugin;
	private id: string;
	private name: string;

	constructor(app: App, plugin: KoraPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.id = 'kora-telegram-settings';
		this.name = '- Kora: Telegram';
	}

	display(): void {
		console.log('TelegramSettingTab display() called');
		const { containerEl } = this;
		containerEl.empty();

		console.log('Current telegram settings:', this.plugin.settings.telegram);
		this.renderTelegramBasics(containerEl);
		this.renderFolderConfigs(containerEl);
		this.renderGramJs(containerEl);
	}

	private renderTelegramBasics(containerEl: HTMLElement) {
		containerEl.createEl('h2', { text: 'Telegram Settings' });

		new Setting(containerEl)
			.setName('Disable Link Preview')
			.setDesc('Disable web page preview for links in messages')
			.addToggle(toggle =>
				toggle
					.setValue(
						this.plugin.settings.telegram.disableWebPagePreview || false
					)
					.onChange(async value => {
						this.plugin.settings.telegram.disableWebPagePreview = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private renderFolderConfigs(containerEl: HTMLElement) {
		containerEl.createEl('h3', { text: 'Folder-based Posting Configuration' });
		containerEl.createEl('p', {
			text: 'Configure folders and their associated Telegram channels for automatic posting.',
			cls: 'setting-item-description',
		});

		// Убеждаемся что folderConfigs инициализирован
		if (!this.plugin.settings.telegram.folderConfigs) {
			this.plugin.settings.telegram.folderConfigs = [];
		}

		new Setting(containerEl)
			.setName('Add Folder Configuration')
			.setDesc('Add a new folder with Telegram bot configuration')
			.addButton(button =>
				button
					.setIcon('plus')
					.setTooltip('Add folder configuration')
					.onClick(async () => {
						console.log('Add Configuration button clicked');
						try {
							const newConfig: TelegramFolderConfig = {
								folder: '',
								channels: [],
							};
							console.log('Creating new config:', newConfig);

							this.plugin.settings.telegram.folderConfigs.push(newConfig);
							console.log(
								'Config added, current folderConfigs:',
								this.plugin.settings.telegram.folderConfigs
							);

							await this.plugin.saveSettings();
							console.log('Settings saved');

							this.display();
							console.log('Display refreshed');
						} catch (error) {
							console.error('Error adding folder configuration:', error);
							new Notice(
								'Ошибка при добавлении конфигурации: ' + error.message
							);
						}
					})
			);

		const folderConfigs = this.plugin.settings.telegram.folderConfigs;

		folderConfigs.forEach(
			(config: TelegramFolderConfig, configIndex: number) => {
				// Линия 1: Папка + удаление + добавить канал
				new Setting(containerEl)
					.setName(`Folder ${configIndex + 1}`)
					.setDesc('Select folder and manage channels')
					.addText(text => {
						text
							.setPlaceholder('Type folder path...')
							.setValue(config.folder)
							.onChange(async value => {
								config.folder = value;
								await this.plugin.saveSettings();
							});

						new FolderSuggest(text.inputEl, this.app);
					})
					.addButton(button =>
						button
							.setIcon('trash')
							.setTooltip('Remove folder')
							.onClick(async () => {
								this.plugin.settings.telegram.folderConfigs.splice(
									configIndex,
									1
								);
								await this.plugin.saveSettings();
								this.display();
							})
					)
					.addButton(button =>
						button
							.setIcon('plus')
							.setTooltip('Add channel')
							.onClick(async () => {
								const newChannel: TelegramChannelConfig = {
									name: '',
									channelId: '',
								};
								config.channels.push(newChannel);
								await this.plugin.saveSettings();
								this.display();
							})
					);

				// Линии для каналов: имя канала + ID канала + удаление
				config.channels.forEach(
					(channel: TelegramChannelConfig, channelIndex: number) => {
						new Setting(containerEl)
							.setName(
								`${String.fromCharCode(8194)}${String.fromCharCode(8194)}Channel ${channelIndex + 1}`
							)
							.setDesc('Channel name and ID')
							.addText(text =>
								text
									.setPlaceholder('Channel name')
									.setValue(channel.name)
									.onChange(async value => {
										channel.name = value;
										await this.plugin.saveSettings();
									})
							)
							.addText(text =>
								text
									.setPlaceholder('@channel or -1001234567890')
									.setValue(channel.channelId)
									.onChange(async value => {
										channel.channelId = value;
										await this.plugin.saveSettings();
									})
							)
							.addButton(button =>
								button
									.setIcon('trash')
									.setTooltip('Remove channel')
									.onClick(async () => {
										config.channels.splice(channelIndex, 1);
										await this.plugin.saveSettings();
										this.display();
									})
							);
					}
				);
			}
		);
	}

	private renderGramJs(containerEl: HTMLElement) {
		containerEl.createEl('h2', { text: 'GramJS Settings' });

		const gram = this.plugin.settings.gramjs || {};
		this.plugin.settings.gramjs = gram; // ensure object exists, do not reset later

		new Setting(containerEl)
			.setName('GramJS Mode')
			.setDesc(
				'Choose between bot mode (BotFather bot) or userbot mode (personal account)'
			)
			.addDropdown(dropdown =>
				dropdown
					.addOption('bot', 'Bot Mode (BotFather)')
					.addOption('userbot', 'Userbot Mode (Personal Account)')
					.setValue(gram.mode || 'userbot')
					.onChange(async value => {
						this.plugin.settings.gramjs = {
							...this.plugin.settings.gramjs,
							mode: value as 'bot' | 'userbot',
						};
						await this.plugin.saveSettings();
						this.display();
					})
			);

		const currentMode = this.plugin.settings.gramjs?.mode || 'userbot';

		if (currentMode === 'bot') {
			new Setting(containerEl)
				.setName('Bot Token')
				.setDesc('Bot token from @BotFather')
				.addText(text =>
					text
						.setPlaceholder('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11')
						.setValue(this.plugin.settings.gramjs?.botToken || '')
						.onChange(async value => {
							this.plugin.settings.gramjs = {
								...this.plugin.settings.gramjs,
								botToken: value,
							};
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName('Telegram API ID')
			.setDesc('Your Telegram API ID from https://my.telegram.org/apps')
			.addText(text =>
				text
					.setPlaceholder('123456')
					.setValue(this.plugin.settings.gramjs?.apiId?.toString() || '')
					.onChange(async value => {
						const apiId = parseInt(value) || 0;
						this.plugin.settings.gramjs = {
							...this.plugin.settings.gramjs,
							apiId,
						};
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Telegram API Hash')
			.setDesc('Your Telegram API Hash from https://my.telegram.org/apps')
			.addText(text =>
				text
					.setPlaceholder('your_api_hash')
					.setValue(this.plugin.settings.gramjs?.apiHash || '')
					.onChange(async value => {
						this.plugin.settings.gramjs = {
							...this.plugin.settings.gramjs,
							apiHash: value,
						};
						await this.plugin.saveSettings();
					})
			);

		if (currentMode === 'userbot') {
			new Setting(containerEl)
				.setName('Session String')
				.setDesc('GramJS session string (generated after first login)')
				.addTextArea(text =>
					text
						.setPlaceholder('1BVtsOLABu...')
						.setValue(this.plugin.settings.gramjs?.stringSession || '')
						.onChange(async value => {
							this.plugin.settings.gramjs = {
								...this.plugin.settings.gramjs,
								stringSession: value,
							};
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName(`Chat ID for ${currentMode === 'bot' ? 'Bot' : 'Userbot'}`)
			.setDesc(
				currentMode === 'bot'
					? 'Chat ID where bot can send messages (add bot to chat first)'
					: 'Telegram chat ID or username (e.g., @username or -100123456789)'
			)
			.addText(text =>
				text
					.setPlaceholder(
						currentMode === 'bot'
							? '-100123456789'
							: '@username or -100123456789'
					)
					.setValue(this.plugin.settings.gramjs?.chatId || '')
					.onChange(async value => {
						this.plugin.settings.gramjs = {
							...this.plugin.settings.gramjs,
							chatId: value,
						};
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Test GramJS Connection')
			.setDesc('Test connection to GramJS server')
			.addButton(button =>
				button
					.setButtonText('Test Connection')
					.setTooltip('Test GramJS server connection')
					.onClick(async () => {
						const bridge =
							this.plugin.getGramJSBridge?.() ||
							(this.plugin as any).gramjsBridge;
						if (bridge) {
							await bridge.testConnection();
						} else {
							new Notice('GramJS bridge not initialized');
						}
					})
			);

		containerEl.createEl('div', {
			text: `To use GramJS in ${currentMode} mode, you need to:`,
			cls: 'setting-item-description',
		});
		const infoList = containerEl.createEl('ol');
		infoList.createEl('li', {
			text: 'Get API ID and Hash from https://my.telegram.org/apps',
		});
		if (currentMode === 'bot') {
			infoList.createEl('li', {
				text: 'Create a bot with @BotFather and get the bot token',
			});
			infoList.createEl('li', {
				text: 'Add your bot to the target chat/group',
			});
		} else {
			infoList.createEl('li', {
				text: 'Generate session string on first login (userbot mode)',
			});
		}
		infoList.createEl('li', { text: 'Install dependencies: npm install' });
		infoList.createEl('li', {
			text: 'Start GramJS server: npm run gramjs-server',
		});
		infoList.createEl('li', {
			text: 'Configure settings above and test connection',
		});

		if (currentMode === 'bot') {
			containerEl.createEl('div', {
				text: '⚠️ Bot mode limitations: Bots cannot send messages to users directly and have limited access to chat history.',
				cls: 'setting-item-description',
			});
		} else {
			containerEl.createEl('div', {
				text: "⚠️ Userbot mode: Uses your personal Telegram account. Use responsibly and respect Telegram's terms.",
				cls: 'setting-item-description',
			});
		}
	}
}
