import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type KoraPlugin from '../main';

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
		this.name = '- Kora: РђСЂС…РёРІ';
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'РђСЂС…РёРІ Telegram' });
		containerEl.createEl('p', {
			text: 'SQLite-Р°СЂС…РёРІ РѕР±СЃР»СѓР¶РёРІР°РµС‚ gramjs-server; РґР»СЏ С‡С‚РµРЅРёСЏ РёСЃС‚РѕСЂРёРё РѕР±С‹С‡РЅРѕ РЅСѓР¶РµРЅ userbot-РїСЂРѕС†РµСЃСЃ.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Р’РєР»СЋС‡РёС‚СЊ UI Р°СЂС…РёРІР°')
			.setDesc(
				'РџРѕРєР°Р·С‹РІР°С‚СЊ РєРѕРјР°РЅРґС‹ Р°СЂС…РёРІР° Рё СЂР°Р·СЂРµС€РёС‚СЊ РІС‹Р·РѕРІС‹ РјРѕСЃС‚Р° РёР· Obsidian'
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
			.setName('РҐРѕСЃС‚ СЃРµСЂРІРµСЂР° Р°СЂС…РёРІР°')
			.setDesc(
				'РҐРѕСЃС‚ gramjs-server, РєРѕС‚РѕСЂС‹Р№ РѕР±СЃР»СѓР¶РёРІР°РµС‚ Р°СЂС…РёРІ. РћР±С‹С‡РЅРѕ СЌС‚Рѕ userbot-РїСЂРѕС†РµСЃСЃ.'
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
			.setName('РџРѕСЂС‚ СЃРµСЂРІРµСЂР° Р°СЂС…РёРІР°')
			.setDesc(
				'РџРѕСЂС‚ gramjs-server РґР»СЏ Р°СЂС…РёРІР°. Р”Р»СЏ userbot РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ 8125.'
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
			.setName('РџСѓС‚СЊ Рє С„Р°Р№Р»Сѓ Р‘Р” Р°СЂС…РёРІР°')
			.setDesc(
				'РџСѓС‚СЊ Рє SQLite РЅР° РјР°С€РёРЅРµ, РіРґРµ Р·Р°РїСѓС‰РµРЅ gramjs-server. РћС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Рµ РїСѓС‚Рё вЂ” РѕС‚ РїР°РїРєРё gramjs-server.'
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
			.setName('РџРµРµСЂ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ')
			.setDesc(
				'РџСЂРµРґР·Р°РїРѕР»РЅРµРЅРЅС‹Р№ peer РґР»СЏ РєРѕРјР°РЅРґ СЃРёРЅРєР° Рё РґР»СЏ РІРёРґР° В«РђСЂС…РёРІВ»'
			)
			.addText(text =>
				text
					.setPlaceholder('@channel РёР»Рё -100123456789')
					.setValue(this.plugin.settings.archiveSettings.defaultPeer)
					.onChange(async value => {
						this.plugin.settings.archiveSettings.defaultPeer = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Р›РёРјРёС‚ СЃРёРЅРєР° РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ')
			.setDesc(
				'РЎРєРѕР»СЊРєРѕ СЃРѕРѕР±С‰РµРЅРёР№ Р·Р° РѕРґРёРЅ РїСЂРѕРіРѕРЅ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё Р·Р°Р±РёСЂР°С‚СЊ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ'
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
			.setName('РќРµРґР°РІРЅРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ РІРѕ view')
			.setDesc(
				'РЎРєРѕР»СЊРєРѕ РїРѕСЃР»РµРґРЅРёС… Р°СЂС…РёРІРЅС‹С… СЃРѕРѕР±С‰РµРЅРёР№ РїРѕРґРіСЂСѓР¶Р°С‚СЊ Р·Р° РѕРґРёРЅ Р·Р°РїСЂРѕСЃ РІРѕ view'
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
			.setName('РџСЂРѕРІРµСЂРёС‚СЊ РїРѕРґРєР»СЋС‡РµРЅРёРµ Рє Р°СЂС…РёРІСѓ')
			.setDesc(
				'РџСЂРѕРІРµСЂСЏРµС‚, РѕС‚РІРµС‡Р°РµС‚ Р»Рё userbot-СЃРµСЂРІРµСЂ Р°СЂС…РёРІР° РїРѕ РЅР°СЃС‚СЂРѕРµРЅРЅРѕРјСѓ С…РѕСЃС‚Сѓ Рё РїРѕСЂС‚Сѓ.'
			)
			.addButton(button =>
				button
					.setButtonText('РџСЂРѕРІРµСЂРёС‚СЊ')
					.setCta()
					.onClick(async () => {
						const bridge =
							this.plugin.getArchiveBridge?.() ||
							(this.plugin as any).archiveBridge;

						if (!bridge) {
							new Notice(
								'РњРѕСЃС‚ Р°СЂС…РёРІР° РЅРµ РёРЅРёС†РёР°Р»РёР·РёСЂРѕРІР°РЅ'
							);
							return;
						}

						await bridge.testConnection();
					})
			);
	}
}
