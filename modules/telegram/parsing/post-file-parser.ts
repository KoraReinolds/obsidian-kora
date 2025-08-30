/**
 * Post File Parser - extracts post-specific configuration and metadata from files
 * Simplified to match actual usage patterns in codebase
 */

import { App, TFile } from 'obsidian';
import { FileParser, BaseFileData, ValidationResult } from './base-file-parser';

export interface PostFileData extends BaseFileData {
	// Core post identification (what actually exists in codebase)
	telegramMessageId: number | null;

	// Channel association
	channelId: string | null;
	chatId: string | null;

	// Relationship metadata
	inChannels: string[]; // List of channels this post appears in (from 'in' field)
}

export class PostFileParser extends FileParser<PostFileData> {
	constructor(app: App) {
		super(app);
	}

	protected async parseSpecific(baseData: BaseFileData): Promise<PostFileData> {
		const { frontmatter } = baseData;

		// Extract only the fields that are actually used in the codebase
		const telegramMessageId = this.extractFrontmatterValue(
			frontmatter,
			'telegram_message_id',
			null
		);

		const channelId = this.extractFrontmatterValue(
			frontmatter,
			'channel_id',
			null
		);

		const chatId = this.extractFrontmatterValue(frontmatter, 'chat_id', null);

		// 'in' field contains list of channels this post appears in
		const inChannels = this.extractFrontmatterValue(frontmatter, 'in', []);

		return {
			...baseData,
			telegramMessageId,
			channelId,
			chatId,
			inChannels,
		};
	}

	protected validateSpecific(baseData: BaseFileData): ValidationResult {
		const { frontmatter } = baseData;
		const errors: string[] = [];
		const warnings: string[] = [];

		// Validate basic structure - only validate fields that exist
		const validationResult = this.validateFrontmatterFields(frontmatter, [
			{ field: 'telegram_message_id', required: false, expectedType: 'number' },
			{ field: 'channel_id', required: false, expectedType: 'string' },
			{ field: 'chat_id', required: false, expectedType: 'string' },
			{ field: 'in', required: false, expectedType: 'array' },
		]);

		errors.push(...validationResult.errors);
		warnings.push(...validationResult.warnings);

		// Post-specific validation
		const telegramMessageId = frontmatter.telegram_message_id;

		// If has telegram_message_id, should have channel_id or chat_id
		if (telegramMessageId && !frontmatter.channel_id && !frontmatter.chat_id) {
			warnings.push(
				'Post with telegram_message_id should specify channel_id or chat_id'
			);
		}

		// At minimum, a post file should have some identifying characteristic
		const hasPostIdentifier = Boolean(
			frontmatter.telegram_message_id ||
				frontmatter.channel_id ||
				frontmatter.chat_id ||
				frontmatter.in?.length > 0
		);

		if (!hasPostIdentifier) {
			warnings.push('File may not be a post - no post-specific metadata found');
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		};
	}

	protected getFileType(): string {
		return 'post';
	}

	/**
	 * Check if the post is published to Telegram
	 */
	async isPublishedToTelegram(file: TFile): Promise<boolean> {
		const postData = await this.parse(file);
		return Boolean(postData.telegramMessageId);
	}

	/**
	 * Get all posts published to a specific channel
	 */
	async getPostsInChannel(files: TFile[], channelId: string): Promise<TFile[]> {
		const channelPosts: TFile[] = [];

		for (const file of files) {
			if (await this.isValidFile(file)) {
				const postData = await this.parse(file);
				if (
					postData.channelId === channelId ||
					postData.inChannels.includes(channelId)
				) {
					channelPosts.push(file);
				}
			}
		}

		return channelPosts;
	}

	/**
	 * Find posts that need to be published (no telegram_message_id but have channel association)
	 */
	async getPostsNeedingPublication(files: TFile[]): Promise<TFile[]> {
		const needsPublication: TFile[] = [];

		for (const file of files) {
			if (await this.isValidFile(file)) {
				const postData = await this.parse(file);

				// Has channel association but no telegram message ID
				if (
					(postData.channelId || postData.chatId) &&
					!postData.telegramMessageId
				) {
					needsPublication.push(file);
				}
			}
		}

		return needsPublication;
	}
}
