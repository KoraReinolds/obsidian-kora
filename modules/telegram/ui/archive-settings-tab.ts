import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type KoraPlugin from '../../../main';

/**
 * @description Вкладка настроек MVP архива Telegram: адрес userbot-сервера,
 * путь к SQLite на стороне сервера, peer и лимиты по умолчанию для команд
 * и представления архива в Obsidian.
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
			text: 'SQLite-архив обслуживает gramjs-server; для чтения истории обычно нужен userbot-процесс.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Включить UI архива')
			.setDesc('Показывать команды архива и разрешить вызовы моста из Obsidian')
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
				'Хост gramjs-server, который обслуживает архив. Обычно это userbot-процесс.'
			)
			.addText(text =>
				text
					.setPlaceholder('127.0.0.1')
					.setValue(this.plugin.settings.archiveSettings.serverHost)
					.onChange(async value => {
						this.plugin.settings.archiveSettings.serverHost =
							value.trim() || '127.0.0.1';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Порт сервера архива')
			.setDesc(
				'Порт gramjs-server для архива. Для userbot по умолчанию используется 8125.'
			)
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
					})
			);

		new Setting(containerEl)
			.setName('Путь к файлу БД архива')
			.setDesc(
				'Путь к SQLite на машине, где запущен gramjs-server. Относительные пути — от папки gramjs-server.'
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
			.setName('Peer по умолчанию')
			.setDesc('Предзаполненный peer для команд синка и для вида «Архив»')
			.addText(text =>
				text
					.setPlaceholder('@channel или -100123456789')
					.setValue(this.plugin.settings.archiveSettings.defaultPeer)
					.onChange(async value => {
						this.plugin.settings.archiveSettings.defaultPeer = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Лимит синка по умолчанию')
			.setDesc(
				'Сколько сообщений за один прогон синхронизации забирать по умолчанию'
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
			.setName('Недавние сообщения во view')
			.setDesc(
				'Сколько последних архивных сообщений подгружать за один запрос во view'
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
				'Проверяет, отвечает ли userbot-сервер архива по настроенному хосту и порту.'
			)
			.addButton(button =>
				button
					.setButtonText('Проверить')
					.setCta()
					.onClick(async () => {
						const bridge =
							this.plugin.getArchiveBridge?.() ||
							(this.plugin as any).archiveBridge;

						if (!bridge) {
							new Notice('Мост архива не инициализирован');
							return;
						}

						await bridge.testConnection();
					})
			);
	}
}
