import { App, PluginSettingTab, Setting } from 'obsidian';
import type KoraMcpPlugin from './main';

/**
 * Класс для настроек плагина MCP
 */
export class McpSettingTab extends PluginSettingTab {
	plugin: KoraMcpPlugin;

	constructor(app: App, plugin: KoraMcpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Отобразить настройки плагина
	 */
	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'MCP Server Settings' });

		new Setting(containerEl)
			.setName('Server Port')
			.setDesc(
				'The port for the MCP server to listen on. The server needs to be restarted for changes to take effect.'
			)
			.addText((text) =>
				text
					.setPlaceholder('Enter port')
					.setValue(this.plugin.settings.port.toString())
					.onChange(async (value) => {
						const port = parseInt(value, 10);
						if (!isNaN(port) && port > 0 && port < 65536) {
							this.plugin.settings.port = port;
							await this.plugin.saveSettings();
						}
					})
			);

		containerEl.createEl('h2', { text: 'Telegram Bot Settings' });

		new Setting(containerEl)
			.setName('Enable Telegram Bot')
			.setDesc('Enable sending notes to Telegram channel')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.telegram.enabled)
					.onChange(async (value) => {
						this.plugin.settings.telegram.enabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Bot Token')
			.setDesc('Telegram bot token (получить у @BotFather)')
			.addText((text) =>
				text
					.setPlaceholder('Enter bot token')
					.setValue(this.plugin.settings.telegram.botToken)
					.onChange(async (value) => {
						this.plugin.settings.telegram.botToken = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Chat ID')
			.setDesc('ID канала или чата для отправки сообщений (например: @mychannel или -1001234567890)')
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
			.setName('Custom Icon URL')
			.setDesc('URL изображения для кастомной иконки заметки (PNG/JPG, рекомендуется 512x512px)')
			.addText((text) =>
				text
					.setPlaceholder('https://example.com/icon.png')
					.setValue(this.plugin.settings.telegram.customIconUrl || '')
					.onChange(async (value) => {
						this.plugin.settings.telegram.customIconUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Sticker File ID')
			.setDesc('File ID стикера для отправки вместе с заметкой (получить через @userinfobot)')
			.addText((text) =>
				text
					.setPlaceholder('CAACAgIAAxkBAAIC...')
					.setValue(this.plugin.settings.telegram.stickerFileId || '')
					.onChange(async (value) => {
						this.plugin.settings.telegram.stickerFileId = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Send as Photo')
			.setDesc('Отправлять кастомную иконку как изображение вместе с текстом')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.telegram.sendAsPhoto || false)
					.onChange(async (value) => {
						this.plugin.settings.telegram.sendAsPhoto = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Test Connection')
			.setDesc('Test Telegram bot connection')
			.addButton((button) =>
				button
					.setButtonText('Test Bot')
					.setCta()
					.onClick(async () => {
						await this.plugin.testTelegramConnection();
					})
			);

		new Setting(containerEl)
			.setName('Test Custom Icon')
			.setDesc('Отправить тестовое сообщение с кастомной иконкой')
			.addButton((button) =>
				button
					.setButtonText('Test Icon')
					.onClick(async () => {
						await this.plugin.testCustomIcon();
					})
			);

		containerEl.createEl('h3', { text: 'Custom Emojis' });

		new Setting(containerEl)
			.setName('Enable Custom Emojis')
			.setDesc('Заменять стандартные эмодзи на кастомные из ваших паков')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.telegram.useCustomEmojis || false)
					.onChange(async (value) => {
						this.plugin.settings.telegram.useCustomEmojis = value;
						await this.plugin.saveSettings();
						this.display(); // Перерисовываем настройки
					})
			);

		if (this.plugin.settings.telegram.useCustomEmojis) {
			this.displayCustomEmojiSettings(containerEl);
		}

		new Setting(containerEl)
			.setName('Test Custom Emojis')
			.setDesc('Отправить тестовое сообщение с кастомными эмодзи')
			.addButton((button) =>
				button
					.setButtonText('Test Emojis')
					.onClick(async () => {
						await this.plugin.testCustomEmojis();
					})
			);
	}

	/**
	 * Отобразить настройки кастомных эмодзи
	 */
	private displayCustomEmojiSettings(containerEl: HTMLElement): void {
		const telegramBot = this.plugin.getTelegramBot();
		const mappings = telegramBot.getCustomEmojiMappings();

		// Описание как получить custom_emoji_id
		const descEl = containerEl.createEl('div', { 
			cls: 'setting-item-description',
			text: 'Чтобы получить custom_emoji_id: отправьте кастомный эмодзи боту @userinfobot, он пришлет JSON с полем custom_emoji_id'
		});
		descEl.style.marginBottom = '15px';
		descEl.style.fontStyle = 'italic';

		// Показываем существующие маппинги
		mappings.forEach((mapping, index) => {
			const setting = new Setting(containerEl)
				.setName(`${mapping.standard} → Custom`)
				.setDesc(mapping.description || `Маппинг для эмодзи ${mapping.standard}`)
				.addButton((button) =>
					button
						.setButtonText('Remove')
						.setWarning()
						.onClick(async () => {
							telegramBot.removeCustomEmojiMapping(mapping.standard);
							await this.plugin.saveSettings();
							this.display();
						})
				);

			// Показываем custom_emoji_id
			const customIdEl = setting.settingEl.createEl('div', {
				text: `ID: ${mapping.customId}`,
				cls: 'setting-item-description'
			});
			customIdEl.style.marginTop = '5px';
			customIdEl.style.fontFamily = 'monospace';
			customIdEl.style.fontSize = '12px';
		});

		// Форма для добавления нового маппинга
		const addContainer = containerEl.createEl('div', { cls: 'setting-item' });
		addContainer.createEl('h4', { text: 'Добавить новый маппинг' });

		let newStandardEmoji = '';
		let newCustomId = '';
		let newDescription = '';

		new Setting(addContainer)
			.setName('Standard Emoji')
			.setDesc('Обычный эмодзи для замены (например: 📝)')
			.addText((text) =>
				text
					.setPlaceholder('📝')
					.onChange((value) => {
						newStandardEmoji = value;
					})
			);

		new Setting(addContainer)
			.setName('Custom Emoji ID')
			.setDesc('ID кастомного эмодзи из Telegram')
			.addText((text) =>
				text
					.setPlaceholder('5789574674987654321')
					.onChange((value) => {
						newCustomId = value;
					})
			);

		new Setting(addContainer)
			.setName('Description (optional)')
			.setDesc('Описание для удобства')
			.addText((text) =>
				text
					.setPlaceholder('Красивая записка')
					.onChange((value) => {
						newDescription = value;
					})
			);

		new Setting(addContainer)
			.setName('Add Mapping')
			.addButton((button) =>
				button
					.setButtonText('Add')
					.setCta()
					.onClick(async () => {
						if (newStandardEmoji && newCustomId) {
							telegramBot.addCustomEmojiMapping(
								newStandardEmoji,
								newCustomId,
								newDescription || undefined
							);
							await this.plugin.saveSettings();
							this.display();
						} else {
							// TODO: Показать ошибку
						}
					})
			);
	}
} 