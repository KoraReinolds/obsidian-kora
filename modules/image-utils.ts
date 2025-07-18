/**
 * Утилиты для работы с изображениями в Telegram
 */

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
			
			return response.ok && 
			contentType !== null && 
			contentType.startsWith('image/');
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
				format: contentType.split('/')[1]
			};
		} catch (error) {
			return null;
		}
	}

	/**
	 * Проверить размер изображения (должно быть меньше 10MB для Telegram)
	 */
	static isValidTelegramImageSize(sizeInBytes?: number): boolean {
		if (!sizeInBytes) return true; // Если размер неизвестен, пропускаем проверку
		const maxSize = 10 * 1024 * 1024; // 10MB
		return sizeInBytes <= maxSize;
	}

	/**
	 * Получить рекомендуемые форматы изображений для Telegram
	 */
	static getSupportedFormats(): string[] {
		return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
	}

	/**
	 * Проверить, поддерживается ли формат изображения в Telegram
	 */
	static isSupportedFormat(format?: string): boolean {
		if (!format) return false;
		return this.getSupportedFormats().includes(format.toLowerCase());
	}

	/**
	 * Валидировать изображение для отправки в Telegram
	 */
	static async validateForTelegram(url: string): Promise<{
		valid: boolean;
		errors: string[];
		info?: ImageInfo;
	}> {
		const errors: string[] = [];
		
		// Проверяем доступность URL
		const info = await this.getImageInfo(url);
		if (!info) {
			errors.push('Изображение недоступно или не является валидным');
			return { valid: false, errors };
		}

		// Проверяем формат
		if (!this.isSupportedFormat(info.format)) {
			errors.push(`Формат ${info.format} не поддерживается. Используйте: ${this.getSupportedFormats().join(', ')}`);
		}

		// Проверяем размер
		if (!this.isValidTelegramImageSize(info.size)) {
			errors.push('Размер изображения превышает 10MB');
		}

		return {
			valid: errors.length === 0,
			errors,
			info
		};
	}
} 