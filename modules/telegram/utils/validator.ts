/**
 * Universal validator for Telegram content
 * Centralizes all validation logic
 */

import { TELEGRAM_CONSTANTS } from '../core/constants';

export interface ValidationResult {
	valid: boolean;
	issues: string[];
}

export interface ValidationOptions {
	maxLength?: number;
	allowEmpty?: boolean;
	checkImageConstraints?: boolean;
}

export class TelegramValidator {
	/**
	 * Validate text content for Telegram
	 */
	static validateText(
		text: string,
		options: ValidationOptions = {}
	): ValidationResult {
		const {
			maxLength = TELEGRAM_CONSTANTS.MAX_MESSAGE_LENGTH,
			allowEmpty = false,
		} = options;

		const issues: string[] = [];

		if (text.length > maxLength) {
			issues.push(
				`Text too long: ${text.length} characters (max ${maxLength})`
			);
		}

		if (!allowEmpty && text.trim().length === 0) {
			issues.push('Text is empty after conversion');
		}

		return {
			valid: issues.length === 0,
			issues,
		};
	}

	/**
	 * Validate image for Telegram
	 */
	static validateImage(imageInfo: {
		size?: number;
		format?: string;
		url: string;
	}): ValidationResult {
		const issues: string[] = [];

		// Check if image is accessible
		if (!imageInfo.url) {
			issues.push('Image URL is required');
			return { valid: false, issues };
		}

		// Check format
		if (imageInfo.format && !this.isSupportedImageFormat(imageInfo.format)) {
			issues.push(
				`Format ${imageInfo.format} not supported. Use: ${TELEGRAM_CONSTANTS.SUPPORTED_IMAGE_FORMATS.join(', ')}`
			);
		}

		// Check size
		if (imageInfo.size && imageInfo.size > TELEGRAM_CONSTANTS.MAX_IMAGE_SIZE) {
			const maxSizeMB = TELEGRAM_CONSTANTS.MAX_IMAGE_SIZE / (1024 * 1024);
			const actualSizeMB = (imageInfo.size / (1024 * 1024)).toFixed(1);
			issues.push(
				`Image size ${actualSizeMB}MB exceeds limit of ${maxSizeMB}MB`
			);
		}

		return {
			valid: issues.length === 0,
			issues,
		};
	}

	/**
	 * Validate caption for Telegram
	 */
	static validateCaption(caption: string): ValidationResult {
		return this.validateText(caption, {
			maxLength: TELEGRAM_CONSTANTS.MAX_CAPTION_LENGTH,
			allowEmpty: true,
		});
	}

	/**
	 * Check if image format is supported
	 */
	static isSupportedImageFormat(format: string): boolean {
		return TELEGRAM_CONSTANTS.SUPPORTED_IMAGE_FORMATS.includes(
			format.toLowerCase() as any
		);
	}

	/**
	 * Get supported image formats
	 */
	static getSupportedImageFormats(): readonly string[] {
		return TELEGRAM_CONSTANTS.SUPPORTED_IMAGE_FORMATS;
	}

	/**
	 * Validate multiple items at once
	 */
	static validateBatch(
		validators: Array<() => ValidationResult>
	): ValidationResult {
		const allIssues: string[] = [];
		let hasErrors = false;

		for (const validator of validators) {
			const result = validator();
			if (!result.valid) {
				hasErrors = true;
				allIssues.push(...result.issues);
			}
		}

		return {
			valid: !hasErrors,
			issues: allIssues,
		};
	}
}
