/**
 * Obsidian-specific Telegram formatter
 * Handles vault operations, frontmatter, and file-based operations
 */

import { App, TFile } from 'obsidian';
import {
	FrontmatterUtils,
	VaultOperations,
	getMarkdownFiles,
} from '../../obsidian';
import { ChannelConfigService } from '../utils/channel-config-service';
import { ChannelFileParser, PostFileParser } from '../parsing';
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
	private linkParser: LinkParser;
	private channelFileParser: ChannelFileParser;
	private postFileParser: PostFileParser;

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
			app,
			customEmojis,
			useCustomEmojis
		);
		this.linkParser = new LinkParser(app);
	}

	/**
	 * Format markdown note for Telegram with Obsidian integration
	 */
	async formatMarkdownNote(params: {
		fileName: string;
		markdownContent: string;
		options?: ConversionOptions;
	}): Promise<ConversionResult> {
		const { fileName, markdownContent, options } = params;

		// Process Obsidian links with context
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
		const parsedLinks = this.linkParser.parseObsidianLinks(content);
		const results: ProcessedLink[] = [];

		for (const link of parsedLinks) {
			try {
				const processedLink = await this.processSingleObsidianLink(
					link.file,
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
		file: TFile | null,
		displayText: string
	): Promise<ProcessedLink> {
		if (!file) {
			throw new Error(`File not found`);
		}
		const fileName = file.name;

		// Try YAML-based configuration first with context
		const telegramUrl = await this.getTgLinkForFile(file);

		if (telegramUrl) {
			return { fileName, displayText, telegramUrl };
		}

		throw new Error(`Telegram URL not found for "${file.basename}"`);
	}

	/**
	 * Process link using YAML-based configuration with context awareness
	 */
	private async getTgLinkForFile(file: TFile): Promise<string | null> {
		try {
			// Check if target file has Telegram association and get channels
			const post = new PostFileParser(this.app, file);
			const postData = await post.parse();

			if (!postData) return null;

			const channels = postData.channels;

			const channelId = Object.values(channels)[0];

			// const channelNames = await this.postFileParser.getChannelsForPost(file);
			// // Get channels this post belongs to using parser
			// if (channelNames.length === 0) {
			// 	return null; // No channels found
			// }

			// // Determine which channel to use based on context
			// const targetChannelName = await this.selectChannelFromContext(
			// 	channelNames,
			// 	sourceFile
			// );

			// // Find channel file
			// const channelFiles = getMarkdownFiles(this.app, {
			// 	include: [targetChannelName],
			// });
			// const channelFile = channelFiles[0];

			// if (!channelFile) {
			// 	throw new Error(`Channel file "${targetChannelName}" not found`);
			// }

			// // Get channel configuration using parser
			// const channelData = await this.channelFileParser.parse(channelFile);
			// const channelId = channelData.channelId;
			// const postIds = channelData.postIds;

			if (!channelId) {
				throw new Error(`Channel ID not found"`);
			}

			// // Find message ID for this file
			// const messageId = await this.findMessageIdInChannel(
			// 	file,
			// 	channelFile,
			// 	postIds
			// );
			// if (!messageId) {
			// 	throw new Error(
			// 		`Message ID not found for "${file.basename}" in channel "${targetChannelName}"`
			// 	);
			// }
			//
			const channel = ChannelFileParser.channelMap[channelId];

			const messageId = channel.links.find(
				link => link.file?.name === file.name
			)?.postId;

			if (!messageId) {
				throw new Error(
					`Message ID not found for "${file.basename}" in channel "${channelId}"`
				);
			}

			// Generate Telegram URL
			return LinkParser.generateTelegramPostUrl(
				channelId.toString(),
				messageId
			);
		} catch (error) {
			console.warn(
				`YAML config processing failed for ${file.basename}: ${error.message}`
			);
			return null; // Fallback to settings-based config
		}
	}

	// /**
	//  * Select appropriate channel based on context
	//  */
	// private async selectChannelFromContext(
	// 	availableChannels: string[],
	// 	sourceFile?: TFile
	// ): Promise<string> {
	// 	if (availableChannels.length === 1) {
	// 		return availableChannels[0]; // Only one option
	// 	}

	// 	if (!sourceFile) {
	// 		return availableChannels[0]; // Default to first
	// 	}

	// 	// Check if source file is a channel file
	// 	const isSourceChannel =
	// 		await this.channelFileParser.isValidFile(sourceFile);

	// 	if (isSourceChannel) {
	// 		// Source is a channel - prefer the same channel if available
	// 		const sourceChannelName = sourceFile.basename;
	// 		if (availableChannels.includes(sourceChannelName)) {
	// 			return sourceChannelName;
	// 		}
	// 	} else {
	// 		// Source is a regular post - check its channels using parser
	// 		if (await this.postFileParser.hasTelegramAssociation(sourceFile)) {
	// 			const sourceChannels =
	// 				await this.postFileParser.getChannelsForPost(sourceFile);

	// 			// Find intersection - prefer channels that both files share
	// 			for (const sourceChannel of sourceChannels) {
	// 				if (availableChannels.includes(sourceChannel)) {
	// 					return sourceChannel;
	// 				}
	// 			}
	// 		}
	// 	}

	// 	// Fallback to first available channel
	// 	return availableChannels[0];
	// }

	// /**
	//  * Find message ID for a file in channel's post_ids
	//  */
	// private async findMessageIdInChannel(
	// 	targetFile: TFile,
	// 	channelFile: TFile,
	// 	postIds: number[]
	// ): Promise<number | null> {
	// 	// Parse channel file to get links
	// 	const channelData = await this.channelFileParser.parse(channelFile);

	// 	// Find position of target file in the list
	// 	const position = channelData.links.findIndex(
	// 		link => link.file?.name === targetFile.name
	// 	);

	// 	if (position === -1 || position >= postIds.length) {
	// 		return null;
	// 	}

	// 	return postIds[position];
	// }

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
				this.linkParser.parseButtonsFromFrontmatter(buttonsField);
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
		const buttonLineData = this.linkParser.parseButtonLines(lines);

		for (const rowData of buttonLineData) {
			try {
				const rowButtons: InlineButton[] = [];

				for (const buttonData of rowData) {
					const processedLink = await this.processSingleObsidianLink(
						buttonData.file,
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
