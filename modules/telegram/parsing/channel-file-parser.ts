/**
 * Channel File Parser - extracts channel configuration and links from files
 */

import { App, TFile } from 'obsidian';
import { FileParser, BaseFileData, ValidationResult } from './base-file-parser';

export interface ChannelFileData extends BaseFileData {
	channelId: string;
	postIds: number[];
}

export class ChannelFileParser extends FileParser<ChannelFileData> {
	static channelMap: Record<string, ChannelFileData> = {};

	constructor(app: App, file: TFile) {
		super(app, file);
	}

	protected async parseSpecific(
		baseData: BaseFileData
	): Promise<ChannelFileData> {
		// Extract channel-specific data from frontmatter
		const channelId = this.extractFrontmatterValue(
			baseData.frontmatter,
			'channel_id',
			''
		);
		const postIds = this.extractFrontmatterValue(
			baseData.frontmatter,
			'post_ids',
			[]
		);

		baseData.links.forEach((link, index) => {
			link.postId = postIds[index];
		});

		const data = {
			...baseData,
			channelId,
			postIds,
		};

		ChannelFileParser.channelMap[channelId] = data;

		return data;
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
