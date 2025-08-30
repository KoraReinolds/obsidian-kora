import KoraPlugin from '../../../main';
import { App, PluginSettingTab, Setting, Notice } from 'obsidian';

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
