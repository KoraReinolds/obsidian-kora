/**
 * Position-Based Sync - synchronizes Telegram posts with note list order
 */

import { App, Notice, TFile } from 'obsidian';
import { GramJSBridge } from '../transport/gramjs-bridge';
import {
	FrontmatterUtils,
	getMarkdownFiles,
	VaultOperations,
} from '../../obsidian';
import { ObsidianTelegramFormatter, LinkParser } from '../formatting';
import { ChannelFileParser } from '../parsing';
import {
	ChannelConfigService,
	type ChannelConfig,
} from './channel-config-service';
import type { KoraMcpPluginSettings } from '../../../main';

export interface SyncResult {
	success: boolean;
	updated: number;
	created: number;
	errors: string[];
	newPostIds: number[];
}

export class PositionBasedSync {
	private app: App;
	private settings: KoraMcpPluginSettings;
	private gramjsBridge: GramJSBridge;
	private frontmatterUtils: FrontmatterUtils;
	private channelConfigService: ChannelConfigService;
	private messageFormatter: ObsidianTelegramFormatter;
	private vaultOps: VaultOperations;
	private linkParser: LinkParser;
	private channelFileParser: ChannelFileParser;

	constructor(
		app: App,
		settings: KoraMcpPluginSettings,
		gramjsBridge: GramJSBridge
	) {
		this.app = app;
		this.settings = settings;
		this.gramjsBridge = gramjsBridge;
		this.frontmatterUtils = new FrontmatterUtils(app);
		this.channelConfigService = new ChannelConfigService(app, settings);
		this.messageFormatter = new ObsidianTelegramFormatter(
			app,
			settings.telegram.customEmojis,
			settings.telegram.useCustomEmojis,
			this.channelConfigService
		);
		this.vaultOps = new VaultOperations(app);
		this.linkParser = new LinkParser(app);
		this.channelFileParser = new ChannelFileParser(app);
	}

	/**
	 * Sync note list with Telegram posts in positional order
	 */
	async syncNoteListWithTelegram(listFile: TFile): Promise<SyncResult> {
		const result: SyncResult = {
			success: true,
			updated: 0,
			created: 0,
			errors: [],
			newPostIds: [],
		};

		// Parse channel file data using the new parser
		const channelData = await this.channelFileParser.parseChannelFile(listFile);

		if (!channelData.channelId) {
			new Notice(
				'Не найдена конфигурация канала в frontmatter. Добавьте channel_id.'
			);
			return result;
		}

		const { channelId, postIds, links } = channelData;

		try {
			// Process each position
			for (let i = 0; i < links.length; i++) {
				const { file } = links[i];

				if (!file) {
					result.errors.push(`Note file not found`);
					continue;
				}

				try {
					const existingPostId = postIds[i];
					const syncResult = await this.syncNoteAtPosition({
						file,
						channelId,
						existingPostId,
						sourceChannelFile: listFile,
					});

					if (syncResult.success && syncResult.messageId) {
						// Update post ID at this position
						postIds[i] = syncResult.messageId;

						if (syncResult.wasUpdated) {
							result.updated++;
						} else {
							result.created++;
						}

						// Add to newPostIds if it's new
						if (!syncResult.wasUpdated) {
							result.newPostIds.push(syncResult.messageId);
						}
					} else {
						result.errors.push(
							`Failed to sync ${file.basename}: ${syncResult.error}`
						);
					}

					// Small delay between operations
					await new Promise(resolve => setTimeout(resolve, 500));
				} catch (error) {
					result.errors.push(`Error syncing ${file.basename}: ${error}`);
				}
			}

			// Update the post_ids array in frontmatter
			await this.updatePostIdsArray(listFile, postIds);
		} catch (error) {
			result.success = false;
			result.errors.push(`Sync failed: ${error}`);
		}

		return result;
	}

	/**
	 * Sync a single note at a specific position
	 */
	private async syncNoteAtPosition(params: {
		file: TFile;
		channelId: string;
		existingPostId?: number;
		sourceChannelFile?: TFile;
	}): Promise<{
		success: boolean;
		messageId?: number;
		wasUpdated: boolean;
		error?: string;
	}> {
		const { file, channelId, existingPostId, sourceChannelFile } = params;

		try {
			// Auto-set 'in' property for YAML-based channel configuration
			await this.autoSetInProperty(file);
			// Get note content
			const content =
				(await this.vaultOps.getFileContent(file)) + Math.random();

			// Format message for Telegram with source context
			const conversionResult = await this.messageFormatter.formatMarkdownNote({
				fileName: file.basename,
				markdownContent: content,
				sourceFile: sourceChannelFile,
			});

			const telegramFormatter = this.messageFormatter.getTelegramFormatter();
			const { processedText, entities: customEmojiEntities } =
				telegramFormatter.processCustomEmojis(conversionResult.text);

			// Combine all entities
			const combinedEntities = [
				...(conversionResult.entities || []),
				...customEmojiEntities,
			].sort((a, b) => a.offset - b.offset);

			const buttons = conversionResult.buttons;

			if (existingPostId) {
				// Update existing post
				const success = await this.gramjsBridge.editMessage({
					peer: channelId,
					messageId: existingPostId,
					message: processedText,
					entities: combinedEntities,
					buttons,
					disableWebPagePreview:
						this.settings.telegram.disableWebPagePreview || true,
				});

				return {
					success,
					messageId: existingPostId,
					wasUpdated: true,
					error: success ? undefined : 'Failed to update message',
				};
			} else {
				// Create new post
				const result = await this.gramjsBridge.sendMessage({
					peer: channelId,
					message: processedText,
					entities: combinedEntities,
					buttons,
					disableWebPagePreview:
						this.settings.telegram.disableWebPagePreview || true,
				});

				return {
					success: result.success,
					messageId: result.messageId,
					wasUpdated: false,
					error: result.success ? undefined : 'Failed to send message',
				};
			}
		} catch (error) {
			return {
				success: false,
				wasUpdated: false,
				error: `Exception during sync: ${error}`,
			};
		}
	}

	/**
	 * Get current post IDs array from frontmatter
	 */
	private async getCurrentPostIds(file: TFile): Promise<number[] | null> {
		const frontmatter = await this.frontmatterUtils.getFrontmatter(file);
		return frontmatter.post_ids || null;
	}

	/**
	 * Update post IDs array in frontmatter
	 */
	private async updatePostIdsArray(
		file: TFile,
		postIds: number[]
	): Promise<void> {
		await this.frontmatterUtils.setFrontmatterField(file, 'post_ids', postIds);
	}

	/**
	 * Sync only specific positions in the list
	 */
	async syncSpecificPositions(
		listFile: TFile,
		channelConfig: ChannelConfig,
		positions: number[]
	): Promise<SyncResult> {
		const result: SyncResult = {
			success: true,
			updated: 0,
			created: 0,
			errors: [],
			newPostIds: [],
		};

		try {
			const content = await this.app.vault.read(listFile);
			const links = this.linkParser.parseObsidianLinks(content);
			const postIds = (await this.getCurrentPostIds(listFile)) || [];

			for (const position of positions) {
				if (position >= links.length) {
					result.errors.push(`Position ${position} is out of range`);
					continue;
				}

				const { file } = links[position];
				if (!file) {
					result.errors.push(
						`Note file not found at position ${position} for ${listFile.name}`
					);
					continue;
				}

				const existingPostId = postIds[position];
				const syncResult = await this.syncNoteAtPosition({
					file,
					channelId: channelConfig.channelId,
					existingPostId,
					sourceChannelFile: listFile,
				});

				if (syncResult.success && syncResult.messageId) {
					postIds[position] = syncResult.messageId;

					if (syncResult.wasUpdated) {
						result.updated++;
					} else {
						result.created++;
					}

					if (!syncResult.wasUpdated) {
						result.newPostIds.push(syncResult.messageId);
					}
				} else {
					result.errors.push(
						`Failed to sync position ${position}: ${syncResult.error}`
					);
				}

				await new Promise(resolve => setTimeout(resolve, 500));
			}

			// Update frontmatter
			await this.updatePostIdsArray(listFile, postIds);
		} catch (error) {
			result.success = false;
			result.errors.push(`Sync failed: ${error}`);
		}

		return result;
	}

	/**
	 * Automatically set 'in' property for YAML-based channel configuration
	 */
	private async autoSetInProperty(file: TFile): Promise<void> {
		try {
			// Check if file already has 'in' property
			const frontmatter = await this.frontmatterUtils.getFrontmatter(file);
			if (frontmatter.in) {
				return; // Already has 'in' property
			}

			// Try to find the channel file that references this post
			const channelFile = await this.findChannelFileForPost(file);
			if (channelFile) {
				// Set 'in' property to the channel file name (without extension)
				const channelFileName = channelFile.basename;
				await this.frontmatterUtils.setFrontmatterField(
					file,
					'in',
					channelFileName
				);
				console.log(`Auto-set 'in: ${channelFileName}' for ${file.basename}`);
			}
		} catch (error) {
			console.warn(
				`Failed to auto-set 'in' property for ${file.basename}: ${error.message}`
			);
			// Don't throw - this is optional functionality
		}
	}

	/**
	 * Find channel file that contains a link to the given post
	 */
	private async findChannelFileForPost(
		targetFile: TFile
	): Promise<TFile | null> {
		// Get all markdown files that could be channel files
		const allFiles = getMarkdownFiles(this.app, {});

		for (const file of allFiles) {
			try {
				// Check if file has channel-like frontmatter
				const frontmatter = await this.frontmatterUtils.getFrontmatter(file);
				if (!frontmatter.channel_id && !frontmatter.post_ids) {
					continue; // Not a channel file
				}

				// Check if file content contains a link to our target file
				const content = await this.app.vault.read(file);
				const links = this.linkParser.parseObsidianLinks(content);

				const hasTargetLink = links.some(
					link => link.file?.name === targetFile.name
				);

				if (hasTargetLink) {
					return file; // Found channel file that references this post
				}
			} catch (error) {
				// Skip files that can't be processed
				continue;
			}
		}

		return null; // No channel file found
	}
}
