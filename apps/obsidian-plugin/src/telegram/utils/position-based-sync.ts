/**
 * Position-Based Sync - synchronizes Telegram posts with note list order
 */

import { App, Notice, TFile } from 'obsidian';
import { GramJSBridge } from '../transport';
import { FrontmatterUtils, VaultOperations } from '../../obsidian';
import {
	ObsidianTelegramFormatter,
	LinkParser,
	ParsedObsidianLink,
} from '../formatting';
import { ChannelFileParser } from '../parsing';
import { ChannelConfigService } from './channel-config-service';
import type { KoraMcpPluginSettings } from '../../plugin-settings';

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

		const { channelId, links, postIds, frontmatter } = channelData;

		try {
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
						channelFrontmatter: frontmatter,
					});

					if (syncResult.success && syncResult.messageId) {
						postIds[i] = syncResult.messageId;
						link.postId = syncResult.messageId;

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
							`Failed to sync ${link.file.basename}: ${syncResult.error}`
						);
					}

					await new Promise(resolve => setTimeout(resolve, 500));
				} catch (error) {
					result.errors.push(`Error syncing ${link.file.basename}: ${error}`);
				}
			}

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
		channelFrontmatter?: Record<string, unknown>;
	}): Promise<{
		success: boolean;
		messageId?: number;
		wasUpdated: boolean;
		error?: string;
	}> {
		const { link, channelId, channelFrontmatter } = params;
		const file = link.file;
		const existingPostId = link.postId;

		try {
			if (!file) throw new Error('File not found');

			const content = await this.vaultOps.getFileContent(file);
			const integrationId = await this.resolvePublishIntegrationId(
				file,
				channelFrontmatter
			);

			const conversionResult = await this.messageFormatter.formatMarkdownNote({
				fileName: file.basename,
				markdownContent: content,
			});

			const telegramFormatter = this.messageFormatter.getTelegramFormatter();
			const { processedText, entities: customEmojiEntities } =
				telegramFormatter.processCustomEmojis(conversionResult.text);

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
				integrationId,
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

	private async resolvePublishIntegrationId(
		file: TFile,
		channelFrontmatter?: Record<string, unknown>
	): Promise<string | undefined> {
		const noteFrontmatter = await this.frontmatterUtils.getFrontmatter(file);
		const noteIntegrationId =
			this.readIntegrationIdFromFrontmatter(noteFrontmatter);
		if (noteIntegrationId) {
			return noteIntegrationId;
		}

		const channelIntegrationId =
			this.readIntegrationIdFromFrontmatter(channelFrontmatter);
		if (channelIntegrationId) {
			return channelIntegrationId;
		}

		return this.normalizeIntegrationId(
			this.settings.telegram.defaultPublishIntegrationId
		);
	}

	private readIntegrationIdFromFrontmatter(
		frontmatter?: Record<string, unknown>
	): string | undefined {
		if (!frontmatter) {
			return undefined;
		}
		return this.normalizeIntegrationId(frontmatter.integration_id);
	}

	private normalizeIntegrationId(value: unknown): string | undefined {
		if (typeof value !== 'string') {
			return undefined;
		}
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
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
