/**
 * Утилиты для работы с изображениями в Telegram
 */

import { TelegramValidator } from './validator';

/**
 * Интерфейс информации об изображении
 */
export interface ImageInfo {
	url: string;
	width?: number;
	height?: number;
	size?: number;
	format?: string;
}

/**
 * Класс для работы с изображениями
 */
export class ImageUtils {
	/**
	 * Проверить, является ли URL валидным изображением
	 */
	static async validateImageUrl(url: string): Promise<boolean> {
		try {
			const response = await fetch(url, { method: 'HEAD' });
			const contentType = response.headers.get('content-type');

			return (
				response.ok && contentType !== null && contentType.startsWith('image/')
			);
		} catch (error) {
			return false;
		}
	}

	/**
	 * Получить информацию об изображении по URL
	 */
	static async getImageInfo(url: string): Promise<ImageInfo | null> {
		try {
			const response = await fetch(url, { method: 'HEAD' });

			if (!response.ok) {
				return null;
			}

			const contentType = response.headers.get('content-type');
			const contentLength = response.headers.get('content-length');

			if (!contentType || !contentType.startsWith('image/')) {
				return null;
			}

			return {
				url,
				size: contentLength ? parseInt(contentLength, 10) : undefined,
				format: contentType.split('/')[1],
			};
		} catch (error) {
			return null;
		}
	}

	/**
	 * Проверить размер изображения (должно быть меньше 10MB для Telegram)
	 * @deprecated Use TelegramValidator.validateImage instead
	 */
	static isValidTelegramImageSize(sizeInBytes?: number): boolean {
		if (!sizeInBytes) return true;
		const result = TelegramValidator.validateImage({
			url: '',
			size: sizeInBytes,
		});
		return result.valid;
	}

	/**
	 * Получить рекомендуемые форматы изображений для Telegram
	 * @deprecated Use TelegramValidator.getSupportedImageFormats instead
	 */
	static getSupportedFormats(): string[] {
		return [...TelegramValidator.getSupportedImageFormats()];
	}

	/**
	 * Проверить, поддерживается ли формат изображения в Telegram
	 * @deprecated Use TelegramValidator.isSupportedImageFormat instead
	 */
	static isSupportedFormat(format?: string): boolean {
		if (!format) return false;
		return TelegramValidator.isSupportedImageFormat(format);
	}

	/**
	 * Валидировать изображение для отправки в Telegram
	 */
	static async validateForTelegram(url: string): Promise<{
		valid: boolean;
		errors: string[];
		info?: ImageInfo;
	}> {
		// Get image info
		const info = await this.getImageInfo(url);
		if (!info) {
			return {
				valid: false,
				errors: ['Изображение недоступно или не является валидным'],
			};
		}

		// Use new validator
		const result = TelegramValidator.validateImage({
			url: info.url,
			size: info.size,
			format: info.format,
		});

		return {
			valid: result.valid,
			errors: result.issues,
			info,
		};
	}
}
