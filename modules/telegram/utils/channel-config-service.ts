/**
 * Channel Configuration Service - manages channel configurations for files
 */

import { App, TFile } from 'obsidian';
import { FrontmatterUtils } from '../../obsidian';
import type {
	KoraMcpPluginSettings,
	TelegramFolderConfig,
	TelegramChannelConfig,
} from '../../../main';

/**
 * Configuration for a Telegram channel (new format)
 */
// TODO: remove this interface
export interface ChannelConfig {
	name: string;
	channelId: string;
	messageId?: number;
}

export class ChannelConfigService {
	private app: App;
	private settings: KoraMcpPluginSettings;
	private frontmatterUtils: FrontmatterUtils;

	constructor(app: App, settings: KoraMcpPluginSettings) {
		this.app = app;
		this.settings = settings;
		this.frontmatterUtils = new FrontmatterUtils(app);
	}

	/**
	 * Get all channel configurations for a file (folder-based only)
	 */
	async getChannelConfigsForFile(file: TFile): Promise<ChannelConfig[]> {
		// Get folder-based configuration
		const folderConfig = this.getFolderConfigForFile(file);
		if (folderConfig) {
			const configs = await Promise.all(
				folderConfig.channels.map(channelConfig =>
					this.createChannelConfigFromFolder(channelConfig, file)
				)
			);
			return configs;
		}
		return [];
	}

	/**
	 * Get folder configuration for a file based on its path
	 */
	getFolderConfigForFile(file: TFile): TelegramFolderConfig | null {
		const filePath = file.path;

		// Find the folder config that matches this file's path
		for (const config of this.settings.telegram.folderConfigs) {
			if (config.folder && filePath.startsWith(config.folder)) {
				return config;
			}
		}

		return null;
	}

	/**
	 * Create a ChannelConfig from folder and channel configurations
	 */
	async createChannelConfigFromFolder(
		channelConfig: TelegramChannelConfig,
		file?: TFile
	): Promise<ChannelConfig> {
		const targetFile = file || (this.app.workspace.getActiveFile() as TFile);
		const postIds = await this.getPostIds(targetFile);
		const messageId = postIds?.[channelConfig.channelId] || undefined;

		return {
			name: channelConfig.name,
			channelId: channelConfig.channelId,
			messageId,
		};
	}

	/**
	 * Get post IDs from frontmatter (new simplified format)
	 */
	async getPostIds(file: TFile): Promise<Record<string, number> | null> {
		const frontmatter = await this.frontmatterUtils.getFrontmatter(file);
		return frontmatter.post_ids || null;
	}

	/**
	 * Update post IDs in frontmatter
	 */
	async updatePostIds(
		file: TFile,
		channelId: string,
		messageId: number
	): Promise<void> {
		const frontmatter = await this.frontmatterUtils.getFrontmatter(file);
		const postIds = frontmatter.post_ids || {};

		postIds[channelId] = messageId;
		await this.frontmatterUtils.updateFrontmatterForFiles([file.path], {
			post_ids: postIds,
		});
	}
}
