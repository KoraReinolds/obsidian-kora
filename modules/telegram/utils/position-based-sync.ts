/**
 * Position-Based Sync - synchronizes Telegram posts with note list order
 */

import { App, Notice, TFile } from 'obsidian';
import { GramJSBridge } from '../transport/gramjs-bridge';
import { FrontmatterUtils, VaultOperations } from '../../obsidian';
import {
	ObsidianTelegramFormatter,
	LinkParser,
	ParsedObsidianLink,
} from '../formatting';
import { ChannelFileParser, PostFileParser } from '../parsing';
import { ChannelConfigService } from './channel-config-service';
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
	private postFileParser: PostFileParser;

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

		const channel = new ChannelFileParser(this.app, listFile);
		const channelData = await channel.parse();

		if (!channelData) {
			new Notice(
				'Не найдена конфигурация канала в frontmatter. Добавьте channel_id.'
			);
			return result;
		}

		const { channelId, links, postIds } = channelData;

		try {
			// Process each position
			for (let i = 0; i < links.length; i++) {
				const link = links[i];

				if (!link.file) {
					result.errors.push(`File not found at position ${i}`);
					continue;
				}

				try {
					const syncResult = await this.syncNoteAtPosition({
						channelId,
						link,
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
							`Failed to sync ${link.file.basename}: ${syncResult.error}`
						);
					}

					// Small delay between operations
					await new Promise(resolve => setTimeout(resolve, 500));
				} catch (error) {
					result.errors.push(`Error syncing ${link.file.basename}: ${error}`);
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
		channelId: string;
		link: ParsedObsidianLink;
	}): Promise<{
		success: boolean;
		messageId?: number;
		wasUpdated: boolean;
		error?: string;
	}> {
		const { link, channelId } = params;
		const file = link.file;
		const existingPostId = link.postId;

		try {
			if (!file) throw new Error('File not found');

			// Get note content
			const content =
				(await this.vaultOps.getFileContent(file)) + Math.random();

			// Format message for Telegram with source context
			const conversionResult = await this.messageFormatter.formatMarkdownNote({
				fileName: file.basename,
				markdownContent: content,
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
			const messageOptions = {
				peer: channelId,
				message: processedText,
				entities: combinedEntities,
				buttons,
				disableWebPagePreview:
					this.settings.telegram.disableWebPagePreview || true,
			};

			const isUpdate = !!existingPostId;

			if (isUpdate) {
				const success = await this.gramjsBridge.editMessage({
					...messageOptions,
					messageId: existingPostId,
				});

				return {
					success,
					messageId: existingPostId,
					wasUpdated: true,
					error: success ? undefined : 'Failed to update message',
				};
			}

			const result = await this.gramjsBridge.sendMessage(messageOptions);

			return {
				success: result.success,
				messageId: result.messageId,
				wasUpdated: false,
				error: result.success ? undefined : 'Failed to send message',
			};
		} catch (error) {
			return {
				success: false,
				wasUpdated: false,
				error: `Exception during sync: ${error}`,
			};
		}
	}

	/**
	 * Update post IDs array in frontmatter
	 */
	private async updatePostIdsArray(
		file: TFile,
		postIds: number[]
	): Promise<void> {
		await this.frontmatterUtils.updateFrontmatterForFiles([file.path], {
			post_ids: postIds,
		});
	}
}
