/**
 * Utilities for formatting messages for different platforms
 */

import {
	MarkdownToTelegramConverter,
	type ConversionOptions,
	type ConversionResult,
	type InlineButton,
} from './markdown-to-telegram-converter';
import { App } from 'obsidian';
import {
	FrontmatterUtils,
	VaultOperations,
	getMarkdownFiles,
} from '../obsidian';
import { ChannelConfigService } from './channel-config-service';

export interface EmojiMapping {
	standard: string; // Обычный эмодзи (например: "📝")
	customId: string; // ID кастомного эмодзи
	description?: string; // Описание для UI
}

export interface MessageEntity {
	type: string;
	offset: number;
	length: number;
	custom_emoji_id?: string;
}

/**
 * Generate Telegram post URL from channel ID and message ID.
 * @param channelId The channel ID (numeric or username).
 * @param messageId The message ID.
 * @returns The Telegram post URL.
 */
export function generateTelegramPostUrl(
	channelId: string,
	messageId: number
): string {
	if (/^-?\d+$/.test(channelId)) {
		let numericId = `${channelId}`;
		if (numericId.startsWith('-100')) {
			numericId = numericId.slice(4); // Remove '-100' prefix
		} else if (numericId.startsWith('-')) {
			numericId = numericId.slice(1); // Remove just '-' prefix
		}
		return `https://t.me/c/${numericId}/${messageId}`;
	} else {
		throw new Error('Unknown channel format');
	}
}

export class MessageFormatter {
	private customEmojis: EmojiMapping[];
	private useCustomEmojis: boolean;
	private markdownConverter: MarkdownToTelegramConverter;
	private app?: App;
	private frontmatterUtils?: FrontmatterUtils;
	private vaultOperations?: VaultOperations;
	private channelConfigService?: ChannelConfigService;

	constructor(
		customEmojis: EmojiMapping[] = [],
		useCustomEmojis = false,
		app?: App,
		channelConfigService?: ChannelConfigService
	) {
		this.customEmojis = customEmojis;
		this.useCustomEmojis = useCustomEmojis;
		this.markdownConverter = new MarkdownToTelegramConverter();
		this.app = app;
		this.channelConfigService = channelConfigService;
		if (app) {
			this.frontmatterUtils = new FrontmatterUtils(app);
			this.vaultOperations = new VaultOperations(app);
		}
	}

	/**
	 * Форматировать сообщение для Telegram
	 */
	formatMessage(fileName: string, content: string): string {
		// Экранируем специальные символы для MarkdownV2
		const escapedFileName = this.escapeMarkdownV2(fileName);
		const escapedContent = this.escapeMarkdownV2(content);

		return `📝 *${escapedFileName}*\n\n${escapedContent}`;
	}

	/**
	 * Экранировать специальные символы для MarkdownV2
	 */
	escapeMarkdownV2(text: string): string {
		// Символы, которые нужно экранировать в MarkdownV2
		const specialChars = [
			'_',
			'*',
			'[',
			']',
			'(',
			')',
			'~',
			'`',
			'>',
			'#',
			'+',
			'-',
			'=',
			'|',
			'{',
			'}',
			'.',
			'!',
		];

		let escaped = text;
		specialChars.forEach(char => {
			escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
		});

		return escaped;
	}

	/**
	 * Обработать кастомные эмодзи в тексте
	 */
	processCustomEmojis(text: string): {
		processedText: string;
		entities: MessageEntity[];
	} {
		if (
			!this.useCustomEmojis ||
			!this.customEmojis ||
			this.customEmojis.length === 0
		) {
			return { processedText: text, entities: [] };
		}

		const processedText = text;
		const entities: MessageEntity[] = [];

		// Проходим по всем настроенным маппингам
		this.customEmojis.forEach(mapping => {
			const regex = new RegExp(this.escapeRegExp(mapping.standard), 'g');
			let match;

			// Находим все вхождения стандартного эмодзи
			while ((match = regex.exec(text)) !== null) {
				entities.push({
					type: 'custom_emoji',
					offset: match.index,
					length: mapping.standard.length,
					custom_emoji_id: mapping.customId,
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
	 * Обновить настройки эмодзи
	 */
	updateEmojiSettings(customEmojis: EmojiMapping[], useCustomEmojis: boolean) {
		this.customEmojis = customEmojis;
		this.useCustomEmojis = useCustomEmojis;
	}

	/**
	 * Получить все маппинги кастомных эмодзи
	 */
	getCustomEmojiMappings(): EmojiMapping[] {
		return this.customEmojis || [];
	}

	/**
	 * Добавить маппинг кастомного эмодзи
	 */
	addCustomEmojiMapping(
		standard: string,
		customId: string,
		description?: string
	): void {
		if (!this.customEmojis) {
			this.customEmojis = [];
		}

		// Проверяем, не существует ли уже такой маппинг
		const existingIndex = this.customEmojis.findIndex(
			m => m.standard === standard
		);

		if (existingIndex !== -1) {
			// Обновляем существующий
			this.customEmojis[existingIndex] = { standard, customId, description };
		} else {
			// Добавляем новый
			this.customEmojis.push({ standard, customId, description });
		}
	}

	/**
	 * Удалить маппинг кастомного эмодзи
	 */
	removeCustomEmojiMapping(standard: string): void {
		if (!this.customEmojis) return;

		this.customEmojis = this.customEmojis.filter(m => m.standard !== standard);
	}

	/**
	 * Форматировать markdown заметку для Telegram
	 */
	async formatMarkdownNote(
		fileName: string,
		markdownContent: string,
		options?: ConversionOptions
	): Promise<ConversionResult> {
		// Убираем frontmatter перед обработкой ссылок
		const contentWithoutFrontmatter =
			this.markdownConverter.removeFrontmatter(markdownContent);

		// Конвертируем Obsidian ссылки в telegram URL перед обработкой
		const processedContent = await this.convertObsidianLinksToTelegramUrls(
			contentWithoutFrontmatter
		);

		// Конвертируем markdown в telegram формат
		const conversionResult = this.markdownConverter.convert(
			processedContent,
			options
		);

		// Парсим кнопки из frontmatter
		const buttons = await this.getButtonsFromFrontmatter(fileName);

		// Объединяем заголовок с контентом
		const finalText = conversionResult.text;

		// Корректируем offset'ы entities с учетом добавленного заголовка
		const adjustedEntities =
			conversionResult.entities?.map(entity => ({
				...entity,
				offset: entity.offset,
			})) || [];

		return {
			...conversionResult,
			text: finalText,
			entities: adjustedEntities,
			buttons: buttons,
		};
	}

	/**
	 * Конвертировать markdown в telegram формат без заголовка
	 */
	convertMarkdownToTelegram(
		markdownContent: string,
		options?: ConversionOptions
	): ConversionResult {
		return this.markdownConverter.convert(markdownContent, options);
	}

	/**
	 * Получить экземпляр markdown конвертера для прямого доступа
	 */
	getMarkdownConverter(): MarkdownToTelegramConverter {
		return this.markdownConverter;
	}

	/**
	 * Универсальный парсер Obsidian ссылок [[file|text]]
	 */
	private async parseObsidianLinks(
		content: string
	): Promise<
		Array<{ fileName: string; displayText: string; telegramUrl: string }>
	> {
		const obsidianLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
		const matches = Array.from(content.matchAll(obsidianLinkRegex));

		const results = await Promise.all(
			matches.map(async match => {
				const fileName = match[1];
				const displayText = match[2] || fileName;

				try {
					if (!this.app || !this.channelConfigService) {
						throw new Error('App and ChannelConfigService required');
					}

					// Find file by name using getMarkdownFiles with include pattern
					const files = getMarkdownFiles(this.app, {
						include: [fileName],
					});
					const file = files[0]; // Get first matching file
					if (!file) {
						throw new Error(`File "${fileName}" not found`);
					}

					const channelConfigs =
						await this.channelConfigService.getChannelConfigsForFile(file);
					const publishedConfig = channelConfigs.find(
						config => config.messageId
					);

					if (!publishedConfig?.messageId) {
						throw new Error(`File "${fileName}" is not published`);
					}

					const telegramUrl = generateTelegramPostUrl(
						publishedConfig.channelId,
						publishedConfig.messageId
					);

					return { fileName, displayText, telegramUrl };
				} catch (error) {
					throw new Error(
						`Failed to process link ${match[0]}: ${error.message}`
					);
				}
			})
		);

		return results;
	}

	/**
	 * Конвертировать Obsidian ссылки [[file|text]] в Telegram URL [text](https://t.me/...)
	 */
	private async convertObsidianLinksToTelegramUrls(
		content: string
	): Promise<string> {
		const parsedLinks = await this.parseObsidianLinks(content);
		let result = content;

		// Заменяем ссылки в обратном порядке чтобы не сбить индексы
		const obsidianLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
		const matches = Array.from(content.matchAll(obsidianLinkRegex)).reverse();

		matches.forEach((match, index) => {
			const linkInfo = parsedLinks[parsedLinks.length - 1 - index];
			const markdownLink = `[${linkInfo.displayText}](${linkInfo.telegramUrl})`;
			result =
				result.substring(0, match.index) +
				markdownLink +
				result.substring(match.index + match[0].length);
		});

		return result;
	}

	/**
	 * Парсить файл кнопок в массив кнопок для Telegram
	 */
	private async parseButtonsFile(
		buttonsContent: string
	): Promise<InlineButton[][]> {
		const lines = buttonsContent
			.trim()
			.split('\n')
			.filter(line => line.trim());
		const buttonRows: InlineButton[][] = [];

		for (const line of lines) {
			try {
				// Переиспользуем универсальный парсер ссылок
				const parsedLinks = await this.parseObsidianLinks(line);

				const rowButtons: InlineButton[] = parsedLinks.map(link => ({
					text: link.displayText,
					url: link.telegramUrl,
				}));

				if (rowButtons.length > 0) {
					buttonRows.push(rowButtons);
				}
			} catch (error) {
				console.warn(
					`Failed to parse buttons from line "${line}": ${error.message}`
				);
				// Пропускаем неработающие строки, но продолжаем парсить остальные
			}
		}

		return buttonRows;
	}

	/**
	 * Получить файл кнопок из frontmatter основной заметки
	 */
	private async getButtonsFromFrontmatter(
		fileName: string
	): Promise<InlineButton[][] | undefined> {
		if (!this.app || !this.frontmatterUtils || !this.vaultOperations) {
			return undefined;
		}

		try {
			// Получаем файл по имени используя getMarkdownFiles с include паттерном
			const foundFiles = getMarkdownFiles(this.app, {
				include: [fileName],
			});
			const file = foundFiles[0]; // Получаем первый найденный файл
			if (!file) {
				console.warn(`File "${fileName}" not found`);
				return undefined;
			}

			// Используем FrontmatterUtils для получения поля buttons
			const buttonsField = await this.frontmatterUtils.getFrontmatterField(
				file,
				'buttons'
			);

			if (!buttonsField) {
				return undefined;
			}

			// Парсим значение [[filename]] из поля
			const buttonsMatch = buttonsField.match(/\[\[([^\]]+)\]\]/);
			if (!buttonsMatch) {
				return undefined;
			}

			const buttonsFileName = buttonsMatch[1];

			// Получаем файл кнопок используя getMarkdownFiles с include паттерном
			const buttonFiles = getMarkdownFiles(this.app, {
				include: [buttonsFileName],
			});
			const buttonsFile = buttonFiles[0]; // Получаем первый найденный файл
			if (!buttonsFile) {
				console.warn(`Buttons file "${buttonsFileName}" not found`);
				return undefined;
			}

			// Читаем содержимое файла кнопок используя VaultOperations
			const buttonsContent =
				await this.vaultOperations.getFileContent(buttonsFile);

			// Парсим кнопки
			return await this.parseButtonsFile(buttonsContent);
		} catch (error) {
			console.warn(`Failed to get buttons from frontmatter: ${error.message}`);
			return undefined;
		}
	}
}
