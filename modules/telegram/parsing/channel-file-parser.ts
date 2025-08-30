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
}
