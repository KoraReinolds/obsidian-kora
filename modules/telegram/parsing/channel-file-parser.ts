/**
 * Channel File Parser - extracts channel configuration and links from files
 */

import { App, TFile } from 'obsidian';
import { VaultOperations, FrontmatterUtils } from '../../obsidian';
import { LinkParser, ParsedObsidianLink } from '../formatting/link-parser';

export interface ChannelFileData {
	channelId: string | null;
	postIds: number[];
	links: ParsedObsidianLink[];
}

export class ChannelFileParser {
	private app: App;
	private vaultOps: VaultOperations;
	private frontmatterUtils: FrontmatterUtils;
	private linkParser: LinkParser;

	constructor(app: App) {
		this.app = app;
		this.vaultOps = new VaultOperations(app);
		this.frontmatterUtils = new FrontmatterUtils(app);
		this.linkParser = new LinkParser(app);
	}

	/**
	 * Parse a channel file and return all channel data at once
	 */
	async parseChannelFile(file: TFile): Promise<ChannelFileData> {
		// Get frontmatter data
		const frontmatter = await this.frontmatterUtils.getFrontmatter(file);

		// Extract channel configuration
		const channelId = frontmatter.channel_id || null;
		const postIds = frontmatter.post_ids || [];

		// Get file content and parse links
		const content = await this.vaultOps.getFileContent(file);
		const links = this.linkParser.parseObsidianLinks(content);

		return {
			channelId,
			postIds,
			links,
		};
	}

	/**
	 * Check if a file is a channel file (has channel_id in frontmatter)
	 */
	async isChannelFile(file: TFile): Promise<boolean> {
		try {
			const frontmatter = await this.frontmatterUtils.getFrontmatter(file);
			return Boolean(frontmatter.channel_id);
		} catch {
			return false;
		}
	}
}
