/**
 * Channel File Parser - extracts channel configuration and links from files
 */

import { App, TFile } from 'obsidian';
import { FileParser, BaseFileData, ValidationResult } from './base-file-parser';

export interface ChannelFileData extends BaseFileData {
	channelId: string | null;
	postIds: number[];
}

export class ChannelFileParser extends FileParser<ChannelFileData> {
	constructor(app: App) {
		super(app);
	}

	/**
	 * Parse a channel file and return all channel data at once
	 * @deprecated Use parse() method instead for consistent interface
	 */
	async parseChannelFile(file: TFile): Promise<ChannelFileData> {
		return this.parse(file);
	}

	/**
	 * Check if a file is a channel file (has channel_id in frontmatter)
	 * @deprecated Use isValidFile() method instead for consistent interface
	 */
	async isChannelFile(file: TFile): Promise<boolean> {
		return this.isValidFile(file);
	}

	protected async parseSpecific(
		baseData: BaseFileData
	): Promise<ChannelFileData> {
		// Extract channel-specific data from frontmatter
		const channelId = this.extractFrontmatterValue(
			baseData.frontmatter,
			'channel_id',
			null
		);
		const postIds = this.extractFrontmatterValue(
			baseData.frontmatter,
			'post_ids',
			[]
		);

		return {
			...baseData,
			channelId,
			postIds,
		};
	}

	protected validateSpecific(baseData: BaseFileData): ValidationResult {
		const { errors, warnings } = this.validateFrontmatterFields(
			baseData.frontmatter,
			[
				{ field: 'channel_id', required: true, expectedType: 'string' },
				{ field: 'post_ids', required: false, expectedType: 'array' },
			]
		);

		// Additional channel-specific validation
		if (
			baseData.frontmatter.channel_id &&
			!baseData.frontmatter.channel_id.toString().trim()
		) {
			errors.push('channel_id cannot be empty');
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		};
	}

	protected getFileType(): string {
		return 'channel';
	}

	/**
	 * Get comprehensive channel information in one call (optimized for cache)
	 */
	async getChannelInfo(file: TFile): Promise<{
		isValid: boolean;
		channelId: string | null;
		postIds: number[];
		files: TFile[];
		linkCount: number;
	}> {
		if (!(await this.isValidFile(file))) {
			return {
				isValid: false,
				channelId: null,
				postIds: [],
				files: [],
				linkCount: 0,
			};
		}

		// Single parse call - cached internally
		const channelData = await this.parse(file);
		const files = channelData.links
			.map(link => link.file)
			.filter(Boolean) as TFile[];

		return {
			isValid: true,
			channelId: channelData.channelId,
			postIds: channelData.postIds,
			files,
			linkCount: channelData.links.length,
		};
	}

	/**
	 * Get channel ID from file
	 */
	async getChannelId(file: TFile): Promise<string | null> {
		const info = await this.getChannelInfo(file);
		return info.channelId;
	}

	/**
	 * Get post IDs array from channel file
	 */
	async getPostIds(file: TFile): Promise<number[]> {
		const info = await this.getChannelInfo(file);
		return info.postIds;
	}

	/**
	 * Get all files that should be in channel (based on links in content)
	 */
	async getFilesInChannel(file: TFile): Promise<TFile[]> {
		const info = await this.getChannelInfo(file);
		return info.files;
	}

	/**
	 * Check if channel has a specific file
	 */
	async hasFile(channelFile: TFile, targetFile: TFile): Promise<boolean> {
		const info = await this.getChannelInfo(channelFile);
		return info.files.some(file => file.name === targetFile.name);
	}

	/**
	 * Get position of file in channel (for position-based sync)
	 */
	async getFilePosition(
		channelFile: TFile,
		targetFile: TFile
	): Promise<number | null> {
		// Use raw channel data to access links with position info
		const channelData = await this.parse(channelFile);
		const position = channelData.links.findIndex(
			link => link.file?.name === targetFile.name
		);
		return position >= 0 ? position : null;
	}

	/**
	 * Get message ID for file at specific position
	 */
	async getMessageIdAtPosition(
		channelFile: TFile,
		position: number
	): Promise<number | null> {
		const info = await this.getChannelInfo(channelFile);
		return position < info.postIds.length ? info.postIds[position] : null;
	}
}
