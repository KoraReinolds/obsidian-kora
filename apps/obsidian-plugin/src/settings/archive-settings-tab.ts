import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	type DropdownComponent,
} from 'obsidian';
import type { IntegrationAccount } from '../../../../packages/contracts/src/telegram';
import type KoraPlugin from '../main';

/**
 * @description Вкладка настроек архива Telegram: archive API, SQLite и путь по умолчанию
 * к Telegram Desktop export.
 */
export class ArchiveSettingTab extends PluginSettingTab {
	private plugin: KoraPlugin;
	private id: string;
	private name: string;

	constructor(app: App, plugin: KoraPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.id = 'kora-archive-settings';
		this.name = '- Kora: Архив';
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Архив Telegram' });
		containerEl.createEl('p', {
			text: 'SQLite-архив обслуживает kora-server. Экран архива теперь ориентирован на импорт Telegram Desktop export и хранение сырых сообщений для последующей AI-обработки.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Включить UI архива')
			.setDesc(
				'Показывать команды архива и разрешить вызовы archive API из Obsidian'
			)
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.archiveSettings.enableArchive)
					.onChange(async value => {
						this.plugin.settings.archiveSettings.enableArchive = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Хост сервера архива')
			.setDesc(
				'Хост kora-server, который обслуживает архив и импорт export-каталогов.'
			)
			.addText(text =>
				text
					.setPlaceholder('127.0.0.1')
					.setValue(this.plugin.settings.archiveSettings.serverHost)
					.onChange(async value => {
						this.plugin.settings.archiveSettings.serverHost =
							value.trim() || '127.0.0.1';
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName('Порт сервера архива')
			.setDesc('Порт archive API на стороне kora-server.')
			.addText(text =>
				text
					.setPlaceholder('8125')
					.setValue(String(this.plugin.settings.archiveSettings.serverPort))
					.onChange(async value => {
						this.plugin.settings.archiveSettings.serverPort = Math.max(
							1,
							Number(value) || 8125
						);
						await this.plugin.saveSettings();
						this.display();
					})
			);

		const integrationHostEl = containerEl.createDiv();
		void this.renderDefaultArchiveIntegrationSetting(integrationHostEl);

		new Setting(containerEl)
			.setName('Путь к файлу БД архива')
			.setDesc(
				'Путь к SQLite на машине, где запущен kora-server. Относительные пути считаются от папки kora-server.'
			)
			.addText(text =>
				text
					.setPlaceholder('data/telegram-archive.sqlite')
					.setValue(this.plugin.settings.archiveSettings.databasePath)
					.onChange(async value => {
						this.plugin.settings.archiveSettings.databasePath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Папка Telegram export по умолчанию')
			.setDesc(
				'Предзаполненный путь к каталогу Telegram Desktop export для страницы "Архив Telegram".'
			)
			.addText(text =>
				text
					.setPlaceholder(
						'C:\\Users\\...\\Telegram Desktop\\ChatExport_2026-03-25'
					)
					.setValue(
						this.plugin.settings.archiveSettings.defaultDesktopExportPath
					)
					.onChange(async value => {
						this.plugin.settings.archiveSettings.defaultDesktopExportPath =
							value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Лимит импорта по умолчанию')
			.setDesc(
				'Служебный лимит для архивного экрана: сколько сообщений брать за один проход и показывать как рабочее окно.'
			)
			.addText(text =>
				text
					.setPlaceholder('200')
					.setValue(
						String(this.plugin.settings.archiveSettings.defaultSyncLimit)
					)
					.onChange(async value => {
						this.plugin.settings.archiveSettings.defaultSyncLimit = Math.max(
							1,
							Number(value) || 200
						);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Сообщений в одном view')
			.setDesc(
				'Сколько архивных сообщений подгружать за один запрос в деталях выбранного чата.'
			)
			.addText(text =>
				text
					.setPlaceholder('50')
					.setValue(
						String(this.plugin.settings.archiveSettings.recentMessagesLimit)
					)
					.onChange(async value => {
						this.plugin.settings.archiveSettings.recentMessagesLimit = Math.max(
							10,
							Number(value) || 50
						);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Проверить подключение к архиву')
			.setDesc(
				'Проверяет, отвечает ли archive API по настроенному хосту и порту.'
			)
			.addButton(button =>
				button
					.setButtonText('Проверить')
					.setCta()
					.onClick(async () => {
						const bridge =
							this.plugin.getArchiveBridge?.() ||
							((this.plugin as unknown as { archiveBridge?: any })
								.archiveBridge ??
								null);

						if (!bridge) {
							new Notice('Мост архива не инициализирован');
							return;
						}

						await bridge.testConnection();
					})
			);
	}

	private async renderDefaultArchiveIntegrationSetting(
		containerEl: HTMLElement
	): Promise<void> {
		containerEl.empty();
		const bridge =
			this.plugin.getArchiveBridge?.() ||
			((this.plugin as unknown as { archiveBridge?: any }).archiveBridge ??
				null);
		const accounts = await this.loadAccountsSafe(bridge);
		const description = bridge
			? 'Какой Telegram account использовать по умолчанию для archive sync/backfill. Пусто = legacy current mode.'
			: 'Archive bridge недоступен, поэтому доступен только legacy mode.';

		new Setting(containerEl)
			.setName('Default Archive Integration')
			.setDesc(description)
			.addDropdown(dropdown => {
				this.populateIntegrationDropdown(
					dropdown,
					accounts,
					this.plugin.settings.archiveSettings.defaultArchiveIntegrationId || ''
				);
				dropdown.onChange(async value => {
					this.plugin.settings.archiveSettings.defaultArchiveIntegrationId =
						value;
					await this.plugin.saveSettings();
				});
			});
	}

	private async loadAccountsSafe(
		bridge: {
			isServerReachable(): Promise<boolean>;
			getIntegrationAccounts(
				forceReload?: boolean
			): Promise<IntegrationAccount[]>;
		} | null
	): Promise<IntegrationAccount[]> {
		if (!bridge) {
			return [];
		}
		try {
			const isRunning = await bridge.isServerReachable();
			if (!isRunning) {
				return [];
			}
			const accounts = await bridge.getIntegrationAccounts();
			return accounts.filter(account => account.provider === 'telegram');
		} catch (error) {
			console.error(
				'[ArchiveSettingTab] Failed to load integration accounts',
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
}
