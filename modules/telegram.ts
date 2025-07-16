import { App, TFile, Notice } from 'obsidian';
import { ImageUtils } from './image-utils';

/**
 * Интерфейс настроек для Telegram бота
 */
export interface TelegramSettings {
	botToken: string;
	chatId: string;
	enabled: boolean;
	customIconUrl?: string;
	stickerFileId?: string;
	sendAsPhoto?: boolean;
	customEmojis?: EmojiMapping[];  // Маппинг кастомных эмодзи
	useCustomEmojis?: boolean;      // Включить кастомные эмодзи
}

/**
 * Интерфейс ответа от Telegram API
 */
interface TelegramResponse {
	ok: boolean;
	result?: any;
	description?: string;
}

/**
 * MessageEntity для кастомных эмодзи
 */
interface MessageEntity {
	type: string;
	offset: number;
	length: number;
	custom_emoji_id?: string;
}

/**
 * Маппинг обычных эмодзи на кастомные
 */
export interface EmojiMapping {
	standard: string;      // Обычный эмодзи (например: "📝")
	customId: string;      // ID кастомного эмодзи
	description?: string;  // Описание для UI
}

/**
 * Класс для работы с Telegram ботом
 */
export class TelegramBot {
	private app: App;
	private settings: TelegramSettings;

	constructor(app: App, settings: TelegramSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Обновить настройки бота
	 */
	updateSettings(settings: TelegramSettings) {
		this.settings = settings;
	}

	/**
	 * Проверить валидность настроек
	 */
	isConfigured(): boolean {
		return this.settings.enabled && 
			   this.settings.botToken.length > 0 && 
			   this.settings.chatId.length > 0;
	}

	/**
	 * Отправить сообщение в Telegram канал
	 */
	async sendMessage(text: string): Promise<boolean> {
		if (!this.isConfigured()) {
			new Notice('Telegram бот не настроен. Проверьте настройки.');
			return false;
		}

		const url = `https://api.telegram.org/bot${this.settings.botToken}/sendMessage`;
		
		// Подготавливаем текст и entities для кастомных эмодзи
		const { processedText, entities } = this.processCustomEmojis(text);
		
		const payload: any = {
			chat_id: this.settings.chatId,
			// text: processedText,
      text: '\ud83d\uddff'
		};

		// Добавляем entities если есть кастомные эмодзи
		if (entities && entities.length > 0) {
			payload.entities = entities;
		}

    console.log(payload);
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});

			const result: TelegramResponse = await response.json();

			if (result.ok) {
				new Notice('Заметка отправлена в Telegram!');
				return true;
			} else {
				new Notice(`Ошибка отправки: ${result.description}`);
				return false;
			}
		} catch (error) {
			new Notice(`Ошибка сети: ${error.message}`);
			return false;
		}
	}

	/**
	 * Отправить файл как заметку в Telegram канал
	 */
	async sendFile(file: TFile): Promise<boolean> {
		if (!file) {
			new Notice('Файл не найден');
			return false;
		}

		try {
			const content = await this.app.vault.read(file);
			const fileName = file.name;
			
			// Если есть стикер, отправляем его перед сообщением
			if (this.settings.stickerFileId) {
				await this.sendSticker(this.settings.stickerFileId);
			}
			
			// Если включена отправка как фото и есть URL иконки
			if (this.settings.sendAsPhoto && this.settings.customIconUrl) {
				// const caption = this.formatMessage(fileName, content);
				return await this.sendPhoto(this.settings.customIconUrl, content);
			} else {
				// Обычное текстовое сообщение
				// const message = this.formatMessage('', content);
				return await this.sendMessage(content);
			}
		} catch (error) {
			new Notice(`Ошибка чтения файла: ${error.message}`);
			return false;
		}
	}

	/**
	 * Форматировать сообщение для Telegram
	 */
	private formatMessage(fileName: string, content: string): string {
		// Экранируем специальные символы для MarkdownV2
		const escapedFileName = this.escapeMarkdownV2(fileName);
		const escapedContent = this.escapeMarkdownV2(content);
		
		return `📝 *${escapedFileName}*\n\n${escapedContent}`;
	}

	/**
	 * Экранировать специальные символы для MarkdownV2
	 */
	private escapeMarkdownV2(text: string): string {
		// Символы, которые нужно экранировать в MarkdownV2
		const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
		
		let escaped = text;
		specialChars.forEach(char => {
			escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
		});
		
		return escaped;
	}

	/**
	 * Обработать кастомные эмодзи в тексте
	 */
	private processCustomEmojis(text: string): { processedText: string; entities: MessageEntity[] } {
		if (!this.settings.useCustomEmojis || !this.settings.customEmojis || this.settings.customEmojis.length === 0) {
			return { processedText: text, entities: [] };
		}

		const processedText = text;
		const entities: MessageEntity[] = [];

		// Проходим по всем настроенным маппингам
		this.settings.customEmojis.forEach(mapping => {
			const regex = new RegExp(this.escapeRegExp(mapping.standard), 'g');
			let match;

			// Находим все вхождения стандартного эмодзи
			while ((match = regex.exec(text)) !== null) {
				entities.push({
					type: 'custom_emoji',
					offset: match.index,
					length: mapping.standard.length,
					custom_emoji_id: mapping.customId
				});
			}
		});

		// Сортируем entities по offset для корректной обработки
		entities.sort((a, b) => a.offset - b.offset);

		return { processedText, entities };
	}

	/**
	 * Экранировать символы для RegExp
	 */
	private escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/**
	 * Отправить изображение с подписью в Telegram
	 */
	async sendPhoto(photoUrl: string, caption?: string): Promise<boolean> {
		if (!this.isConfigured()) {
			new Notice('Telegram бот не настроен. Проверьте настройки.');
			return false;
		}

		// Валидируем изображение перед отправкой
		const validation = await ImageUtils.validateForTelegram(photoUrl);
		if (!validation.valid) {
			new Notice(`Ошибка валидации изображения: ${validation.errors.join(', ')}`);
			return false;
		}

		const url = `https://api.telegram.org/bot${this.settings.botToken}/sendPhoto`;
		
		// Обрабатываем кастомные эмодзи в подписи
		const { processedText, entities } = this.processCustomEmojis(caption || '');
		
		const payload: any = {
			chat_id: this.settings.chatId,
			photo: photoUrl,
			caption: processedText,
			parse_mode: 'MarkdownV2'
		};

		// Добавляем entities если есть кастомные эмодзи
		if (entities && entities.length > 0) {
			payload.caption_entities = entities;
		}

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});

			const result: TelegramResponse = await response.json();

			if (result.ok) {
				new Notice('Изображение отправлено в Telegram!');
				return true;
			} else {
				new Notice(`Ошибка отправки изображения: ${result.description}`);
				return false;
			}
		} catch (error) {
			new Notice(`Ошибка сети: ${error.message}`);
			return false;
		}
	}

	/**
	 * Отправить стикер в Telegram
	 */
	async sendSticker(stickerFileId: string): Promise<boolean> {
		if (!this.isConfigured()) {
			new Notice('Telegram бот не настроен. Проверьте настройки.');
			return false;
		}

		const url = `https://api.telegram.org/bot${this.settings.botToken}/sendSticker`;
		
		const payload = {
			chat_id: this.settings.chatId,
			sticker: stickerFileId
		};

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});

			const result: TelegramResponse = await response.json();

			if (result.ok) {
				return true;
			} else {
				new Notice(`Ошибка отправки стикера: ${result.description}`);
				return false;
			}
		} catch (error) {
			new Notice(`Ошибка сети: ${error.message}`);
			return false;
		}
	}

	/**
	 * Проверить подключение к боту
	 */
	async testConnection(): Promise<boolean> {
		if (!this.settings.botToken) {
			new Notice('Токен бота не указан');
			return false;
		}

		const url = `https://api.telegram.org/bot${this.settings.botToken}/getMe`;

		try {
			const response = await fetch(url);
			const result: TelegramResponse = await response.json();

			if (result.ok) {
				new Notice(`Бот подключен: ${result.result.username}`);
				return true;
			} else {
				new Notice(`Ошибка подключения: ${result.description}`);
				return false;
			}
		} catch (error) {
			new Notice(`Ошибка сети: ${error.message}`);
			return false;
		}
	}

	/**
	 * Отправить тестовое сообщение с кастомной иконкой
	 */
	async sendTestWithIcon(): Promise<boolean> {
		const testMessage = "🧪 Тестовое сообщение с кастомной иконкой 📝 🎉";
		
		// Если есть стикер, отправляем его
		if (this.settings.stickerFileId) {
			await this.sendSticker(this.settings.stickerFileId);
		}
		
		// Если включена отправка как фото и есть URL иконки
		if (this.settings.sendAsPhoto && this.settings.customIconUrl) {
			return await this.sendPhoto(this.settings.customIconUrl, testMessage);
		} else {
			return await this.sendMessage(testMessage);
		}
	}

	/**
	 * Добавить маппинг кастомного эмодзи
	 */
	addCustomEmojiMapping(standard: string, customId: string, description?: string): void {
		if (!this.settings.customEmojis) {
			this.settings.customEmojis = [];
		}

		// Проверяем, не существует ли уже такой маппинг
		const existingIndex = this.settings.customEmojis.findIndex(m => m.standard === standard);
		
		if (existingIndex !== -1) {
			// Обновляем существующий
			this.settings.customEmojis[existingIndex] = { standard, customId, description };
		} else {
			// Добавляем новый
			this.settings.customEmojis.push({ standard, customId, description });
		}
	}

	/**
	 * Удалить маппинг кастомного эмодзи
	 */
	removeCustomEmojiMapping(standard: string): void {
		if (!this.settings.customEmojis) return;

		this.settings.customEmojis = this.settings.customEmojis.filter(m => m.standard !== standard);
	}

	/**
	 * Получить все маппинги кастомных эмодзи
	 */
	getCustomEmojiMappings(): EmojiMapping[] {
		return this.settings.customEmojis || [];
	}

	/**
	 * Тест кастомных эмодзи
	 */
	async testCustomEmojis(): Promise<boolean> {
		if (!this.settings.useCustomEmojis || !this.settings.customEmojis || this.settings.customEmojis.length === 0) {
			new Notice('Кастомные эмодзи не настроены');
			return false;
		}

		// Создаем тестовое сообщение с настроенными эмодзи
		const emojiList = this.settings.customEmojis.map(m => m.standard).join(' ');
		const testMessage = `🧪 Тест кастомных эмодзи: ${emojiList}`;
		
		return await this.sendMessage(testMessage);
	}
} 