/**
 * Position-Based Sync - synchronizes Telegram posts with note list order
 */

import { App, TFile } from 'obsidian';
import { NoteListParser } from './note-list-parser';
import { GramJSBridge } from '../transport/gramjs-bridge';
import { FrontmatterUtils } from '../../obsidian';
import { ObsidianTelegramFormatter } from '../formatting';
import type { ChannelConfig } from './channel-config-service';
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
	private noteListParser: NoteListParser;
	private frontmatterUtils: FrontmatterUtils;
	private messageFormatter: ObsidianTelegramFormatter;

	constructor(
		app: App,
		settings: KoraMcpPluginSettings,
		gramjsBridge: GramJSBridge
	) {
		this.app = app;
		this.settings = settings;
		this.gramjsBridge = gramjsBridge;
		this.noteListParser = new NoteListParser(app);
		this.frontmatterUtils = new FrontmatterUtils(app);
		this.messageFormatter = new ObsidianTelegramFormatter(
			app,
			settings.telegram.customEmojis,
			settings.telegram.useCustomEmojis,
			undefined // channelConfigService not needed for formatting
		);
	}

	/**
	 * Sync note list with Telegram posts in positional order
	 */
	async syncNoteListWithTelegram(
		listFile: TFile,
		channelConfig: ChannelConfig
	): Promise<SyncResult> {
		const result: SyncResult = {
			success: true,
			updated: 0,
			created: 0,
			errors: [],
			newPostIds: [],
		};

		try {
			// Parse note list from file
			const noteItems =
				await this.noteListParser.parseNoteListFromFile(listFile);

			if (noteItems.length === 0) {
				result.errors.push('No note links found in the list');
				result.success = false;
				return result;
			}

			// Resolve note files
			const resolvedItems =
				await this.noteListParser.resolveNoteFiles(noteItems);

			// Get current post IDs array from frontmatter
			const postIds = (await this.getCurrentPostIds(listFile)) || [];

			// Process each position
			for (let i = 0; i < resolvedItems.length; i++) {
				const { noteItem, file } = resolvedItems[i];

				if (!file) {
					result.errors.push(`Note file not found: ${noteItem.fileName}`);
					continue;
				}

				try {
					const existingPostId = postIds[i];
					const syncResult = await this.syncNoteAtPosition(
						file,
						channelConfig,
						i,
						existingPostId
					);

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
	private async syncNoteAtPosition(
		file: TFile,
		channelConfig: ChannelConfig,
		position: number,
		existingPostId?: number
	): Promise<{
		success: boolean;
		messageId?: number;
		wasUpdated: boolean;
		error?: string;
	}> {
		try {
			// Get note content
			const content = await this.app.vault.read(file);

			// Format message for Telegram
			const conversionResult = await this.messageFormatter.formatMarkdownNote(
				file.basename,
				content
			);

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
					peer: channelConfig.channelId,
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
					peer: channelConfig.channelId,
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
			const noteItems =
				await this.noteListParser.parseNoteListFromFile(listFile);
			const resolvedItems =
				await this.noteListParser.resolveNoteFiles(noteItems);
			const postIds = (await this.getCurrentPostIds(listFile)) || [];

			for (const position of positions) {
				if (position >= resolvedItems.length) {
					result.errors.push(`Position ${position} is out of range`);
					continue;
				}

				const { noteItem, file } = resolvedItems[position];
				if (!file) {
					result.errors.push(
						`Note file not found at position ${position}: ${noteItem.fileName}`
					);
					continue;
				}

				const existingPostId = postIds[position];
				const syncResult = await this.syncNoteAtPosition(
					file,
					channelConfig,
					position,
					existingPostId
				);

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
	 * Preview sync changes without executing
	 */
	async previewSyncChanges(listFile: TFile): Promise<{
		noteItems: Array<{
			position: number;
			fileName: string;
			displayText: string;
			fileExists: boolean;
			hasExistingPost: boolean;
			action: 'create' | 'update' | 'skip';
		}>;
		postIds: number[];
	}> {
		const noteItems = await this.noteListParser.parseNoteListFromFile(listFile);
		const resolvedItems = await this.noteListParser.resolveNoteFiles(noteItems);
		const postIds = (await this.getCurrentPostIds(listFile)) || [];

		const preview = resolvedItems.map(({ noteItem, file }, index) => ({
			position: index,
			fileName: noteItem.fileName,
			displayText: noteItem.displayText,
			fileExists: !!file,
			hasExistingPost: !!postIds[index],
			action: (!file ? 'skip' : postIds[index] ? 'update' : 'create') as
				| 'create'
				| 'update'
				| 'skip',
		}));

		return { noteItems: preview, postIds };
	}
}
