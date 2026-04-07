import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	type DropdownComponent,
} from 'obsidian';
import type { IntegrationAccount } from '../../../../packages/contracts/src/telegram';
import type KoraPlugin from '../main';

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
		const { containerEl } = this;
		containerEl.empty();

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

		const integrationHostEl = containerEl.createDiv();
		void this.renderDefaultPublishIntegrationSetting(integrationHostEl);
	}

	private async renderDefaultPublishIntegrationSetting(
		containerEl: HTMLElement
	): Promise<void> {
		containerEl.empty();
		const bridge =
			this.plugin.getGramJSBridge?.() ||
			((this.plugin as unknown as { gramjsBridge?: any }).gramjsBridge ?? null);
		const accounts = await this.loadAccountsSafe(bridge);
		const description = bridge
			? 'Какой Telegram account использовать по умолчанию для publish. Пусто = legacy current mode.'
			: 'Bridge Kora server недоступен, поэтому доступен только legacy mode.';

		new Setting(containerEl)
			.setName('Default Publish Integration')
			.setDesc(description)
			.addDropdown(dropdown => {
				this.populateIntegrationDropdown(
					dropdown,
					accounts,
					this.plugin.settings.telegram.defaultPublishIntegrationId || ''
				);
				dropdown.onChange(async value => {
					this.plugin.settings.telegram.defaultPublishIntegrationId = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private renderGramJs(containerEl: HTMLElement) {
		containerEl.createEl('h2', { text: 'Kora Server Settings' });

		const gram = this.plugin.settings.gramjs || {};
		this.plugin.settings.gramjs = gram;

		new Setting(containerEl)
			.setName('Runtime Mode')
			.setDesc(
				'Choose between bot mode (BotFather bot) or userbot mode (personal account) for Kora server'
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
				.setDesc('Telegram session string (generated after first login)')
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
			.setName('Test Kora Server Connection')
			.setDesc('Test connection to Kora server')
			.addButton(button =>
				button
					.setButtonText('Test Connection')
					.setTooltip('Test Kora server connection')
					.onClick(async () => {
						const bridge =
							this.plugin.getGramJSBridge?.() ||
							((this.plugin as unknown as { gramjsBridge?: any })
								.gramjsBridge ??
								null);
						if (bridge) {
							await bridge.testConnection(
								this.normalizeIntegrationId(
									this.plugin.settings.telegram.defaultPublishIntegrationId
								)
							);
						} else {
							new Notice('Kora server bridge not initialized');
						}
					})
			);

		containerEl.createEl('div', {
			text: `To use Kora server in ${currentMode} mode, you need to:`,
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
			text: 'Start Kora server: npm run kora-server',
		});
		infoList.createEl('li', {
			text: 'Configure settings above and test connection',
		});

		if (currentMode === 'bot') {
			containerEl.createEl('div', {
				text: 'Important: Bot mode limitations. Bots cannot send messages to users directly and have limited access to chat history.',
				cls: 'setting-item-description',
			});
		} else {
			containerEl.createEl('div', {
				text: "Important: Userbot mode uses your personal Telegram account. Use responsibly and respect Telegram's terms.",
				cls: 'setting-item-description',
			});
		}
	}

	private async loadAccountsSafe(
		bridge: {
			isServerRunning(): Promise<boolean>;
			getIntegrationAccounts(
				forceReload?: boolean
			): Promise<IntegrationAccount[]>;
		} | null
	): Promise<IntegrationAccount[]> {
		if (!bridge) {
			return [];
		}
		try {
			const isRunning = await bridge.isServerRunning();
			if (!isRunning) {
				return [];
			}
			const accounts = await bridge.getIntegrationAccounts();
			return accounts.filter(account => account.provider === 'telegram');
		} catch (error) {
			console.error(
				'[TelegramSettingTab] Failed to load integration accounts',
				error
			);
			return [];
		}
	}

	private populateIntegrationDropdown(
		dropdown: DropdownComponent,
		accounts: IntegrationAccount[],
		selectedValue: string
	): void {
		dropdown.addOption('', 'Legacy / current mode');
		for (const account of accounts) {
			dropdown.addOption(account.id, this.formatIntegrationLabel(account));
		}
		dropdown.setValue(selectedValue || '');
	}

	private formatIntegrationLabel(account: IntegrationAccount): string {
		const flags = [account.transport, account.source];
		if (account.isDefault) {
			flags.push('default');
		}
		return `${account.title} [${flags.join(' / ')}]`;
	}

	private normalizeIntegrationId(value: unknown): string | undefined {
		if (typeof value !== 'string') {
			return undefined;
		}
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
}
