/**
 * Channel Configuration Service - manages channel configurations for files
 */

import { App, TFile } from 'obsidian';
import { FrontmatterUtils } from '../obsidian';
import type { KoraMcpPluginSettings, TelegramFolderConfig, TelegramChannelConfig } from '../../main';

/**
 * Configuration for a Telegram channel (new format)
 */
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
   * Update settings reference
   */
  updateSettings(settings: KoraMcpPluginSettings): void {
    this.settings = settings;
  }

  /**
   * Get all channel configurations for a file (folder-based only)
   */
  getChannelConfigsForFile(file: TFile): ChannelConfig[] {
    const configs: ChannelConfig[] = [];
    
    // Get folder-based configuration
    const folderConfig = this.getFolderConfigForFile(file);
    if (folderConfig) {
      folderConfig.channels.forEach(channelConfig => {
        configs.push(this.createChannelConfigFromFolder(folderConfig, channelConfig, file));
      });
    }
    
    return configs;
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
  createChannelConfigFromFolder(
    folderConfig: TelegramFolderConfig, 
    channelConfig: TelegramChannelConfig, 
    file?: TFile
  ): ChannelConfig {
    const targetFile = file || this.app.workspace.getActiveFile() as TFile;
    const postIds = this.getPostIds(targetFile);
    const messageId = postIds?.[channelConfig.channelId] || undefined;
    
    return {
      name: channelConfig.name,
      channelId: channelConfig.channelId,
      messageId
    };
  }

  /**
   * Get post IDs from frontmatter (new simplified format)
   */
  getPostIds(file: TFile): Record<string, number> | null {
    const frontmatter = this.frontmatterUtils.getFrontmatter(file);
    return frontmatter.post_ids || null;
  }

  /**
   * Update post IDs in frontmatter
   */
  async updatePostIds(file: TFile, channelId: string, messageId: number): Promise<void> {
    const frontmatter = this.frontmatterUtils.getFrontmatter(file);
    const postIds = frontmatter.post_ids || {};
    
    postIds[channelId] = messageId;
    await this.frontmatterUtils.setFrontmatterField(file, 'post_ids', postIds);
  }


}
