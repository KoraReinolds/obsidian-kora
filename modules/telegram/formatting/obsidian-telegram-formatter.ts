/**
 * Obsidian-specific Telegram formatter
 * Handles vault operations, frontmatter, and file-based operations
 */

import { App } from 'obsidian';
import {
	FrontmatterUtils,
	VaultOperations,
	getMarkdownFiles,
} from '../../obsidian';
import { ChannelConfigService } from '../utils/channel-config-service';
import {
	TelegramMessageFormatter,
	type EmojiMapping,
	type InlineButton,
} from './telegram-message-formatter';
import { LinkParser, type ProcessedLink } from './link-parser';
import {
	type ConversionOptions,
	type ConversionResult,
} from './markdown-to-telegram-converter';

/**
 * Obsidian-specific Telegram formatter
 * Extends pure formatter with Obsidian vault integration
 */
export class ObsidianTelegramFormatter {
	private app: App;
	private frontmatterUtils: FrontmatterUtils;
	private vaultOperations: VaultOperations;
	private channelConfigService?: ChannelConfigService;
	private telegramFormatter: TelegramMessageFormatter;

	constructor(
		app: App,
		customEmojis: EmojiMapping[] = [],
		useCustomEmojis = false,
		channelConfigService?: ChannelConfigService
	) {
		this.app = app;
		this.frontmatterUtils = new FrontmatterUtils(app);
		this.vaultOperations = new VaultOperations(app);
		this.channelConfigService = channelConfigService;
		this.telegramFormatter = new TelegramMessageFormatter(
			customEmojis,
			useCustomEmojis
		);
	}

	/**
	 * Format markdown note for Telegram with Obsidian integration
	 */
	async formatMarkdownNote(
		fileName: string,
		markdownContent: string,
		options?: ConversionOptions
	): Promise<ConversionResult> {
		// Process Obsidian links
		const processedLinks = await this.processObsidianLinks(markdownContent);

		// Convert with processed links
		const conversionResult =
			this.telegramFormatter.convertMarkdownNoteWithLinks(
				markdownContent,
				processedLinks,
				options
			);

		// Get buttons from frontmatter
		const buttons = await this.getButtonsFromFrontmatter(fileName);

		return {
			...conversionResult,
			buttons,
		};
	}

	/**
	 * Process all Obsidian links in content
	 */
	private async processObsidianLinks(
		content: string
	): Promise<ProcessedLink[]> {
		if (!LinkParser.hasObsidianLinks(content) || !this.channelConfigService) {
			return [];
		}

		const parsedLinks = LinkParser.parseObsidianLinks(content);
		const results: ProcessedLink[] = [];

		for (const link of parsedLinks) {
			try {
				const processedLink = await this.processSingleObsidianLink(
					link.fileName,
					link.displayText
				);
				results.push(processedLink);
			} catch (error) {
				console.warn(
					`Failed to process link ${link.fullMatch}: ${error.message}`
				);
				// Skip failed links but continue processing others
			}
		}

		return results;
	}

	/**
	 * Process single Obsidian link
	 */
	private async processSingleObsidianLink(
		fileName: string,
		displayText: string
	): Promise<ProcessedLink> {
		if (!this.channelConfigService) {
			throw new Error('ChannelConfigService required for link processing');
		}

		// Find file by name
		const files = getMarkdownFiles(this.app, {
			include: [fileName],
		});
		const file = files[0];

		if (!file) {
			throw new Error(`File "${fileName}" not found`);
		}

		// Get published channel config
		const channelConfigs =
			await this.channelConfigService.getChannelConfigsForFile(file);
		const publishedConfig = channelConfigs.find(config => config.messageId);

		if (!publishedConfig?.messageId) {
			throw new Error(`File "${fileName}" is not published`);
		}

		// Generate Telegram URL
		const telegramUrl = LinkParser.generateTelegramPostUrl(
			publishedConfig.channelId,
			publishedConfig.messageId
		);

		return { fileName, displayText, telegramUrl };
	}

	/**
	 * Get buttons from frontmatter
	 */
	private async getButtonsFromFrontmatter(
		fileName: string
	): Promise<InlineButton[][] | undefined> {
		try {
			// Find main file
			const foundFiles = getMarkdownFiles(this.app, {
				include: [fileName],
			});
			const file = foundFiles[0];

			if (!file) {
				console.warn(`File "${fileName}" not found`);
				return undefined;
			}

			// Get buttons field from frontmatter
			const buttonsField = await this.frontmatterUtils.getFrontmatterField(
				file,
				'buttons'
			);
			if (!buttonsField) {
				return undefined;
			}

			// Parse buttons filename from field
			const buttonsFileName =
				LinkParser.parseButtonsFromFrontmatter(buttonsField);
			if (!buttonsFileName) {
				return undefined;
			}

			// Find buttons file
			const buttonFiles = getMarkdownFiles(this.app, {
				include: [buttonsFileName],
			});
			const buttonsFile = buttonFiles[0];

			if (!buttonsFile) {
				console.warn(`Buttons file "${buttonsFileName}" not found`);
				return undefined;
			}

			// Read buttons file content
			const buttonsContent =
				await this.vaultOperations.getFileContent(buttonsFile);

			// Parse buttons
			return await this.parseButtonsFile(buttonsContent);
		} catch (error) {
			console.warn(`Failed to get buttons from frontmatter: ${error.message}`);
			return undefined;
		}
	}

	/**
	 * Parse buttons file into inline buttons
	 */
	private async parseButtonsFile(
		buttonsContent: string
	): Promise<InlineButton[][]> {
		const lines = buttonsContent
			.trim()
			.split('\n')
			.filter(line => line.trim());

		const buttonRows: InlineButton[][] = [];
		const buttonLineData = LinkParser.parseButtonLines(lines);

		for (const rowData of buttonLineData) {
			try {
				const rowButtons: InlineButton[] = [];

				for (const buttonData of rowData) {
					const processedLink = await this.processSingleObsidianLink(
						buttonData.fileName,
						buttonData.text
					);

					rowButtons.push({
						text: processedLink.displayText,
						url: processedLink.telegramUrl,
					});
				}

				if (rowButtons.length > 0) {
					buttonRows.push(rowButtons);
				}
			} catch (error) {
				console.warn(`Failed to process button row: ${error.message}`);
				// Skip failed rows but continue with others
			}
		}

		return buttonRows;
	}

	/**
	 * Update emoji settings
	 */
	updateEmojiSettings(
		customEmojis: EmojiMapping[],
		useCustomEmojis: boolean
	): void {
		this.telegramFormatter.updateEmojiSettings(customEmojis, useCustomEmojis);
	}

	/**
	 * Get pure telegram formatter for direct access
	 */
	getTelegramFormatter(): TelegramMessageFormatter {
		return this.telegramFormatter;
	}

	/**
	 * Format simple message without Obsidian integration
	 */
	formatMessage(fileName: string, content: string): string {
		return this.telegramFormatter.formatMessage(fileName, content);
	}

	/**
	 * Convert markdown without Obsidian links processing
	 */
	convertMarkdownToTelegram(
		markdownContent: string,
		options?: ConversionOptions
	): ConversionResult {
		return this.telegramFormatter.convertMarkdownToTelegram(
			markdownContent,
			options
		);
	}
}
