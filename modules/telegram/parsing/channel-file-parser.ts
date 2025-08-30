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

	// /**
	//  * Get comprehensive channel information in one call
	//  */
	// getChannelInfo(): {
	// 	isValid: boolean;
	// 	channelId: string;
	// 	postIds: number[];
	// 	files: TFile[];
	// 	linkCount: number;
	// } {
	// 	const channelData = this.getData();
	// 	const files = channelData.links
	// 		.map(link => link.file)
	// 		.filter(Boolean) as TFile[];

	// 	return {
	// 		isValid: true,
	// 		channelId: channelData.channelId,
	// 		postIds: channelData.postIds,
	// 		files,
	// 		linkCount: channelData.links.length,
	// 	};
	// }

	// /**
	//  * Check if channel has a specific file
	//  */
	// hasFile(targetFile: TFile): boolean {
	// 	const info = this.getChannelInfo();
	// 	return info.files.some(file => file.name === targetFile.name);
	// }

	/**
	 * Get position of file in channel (for position-based sync)
	 */
	getFilePosition(targetFile: TFile): number | null {
		if (!this.isValid()) return null;

		const channelData = this.getData();
		const position = channelData.links.findIndex(
			link => link.file?.name === targetFile.name
		);
		return position >= 0 ? position : null;
	}

	// /**
	//  * Get message ID for file at specific position
	//  */
	// getMessageIdAtPosition(position: number): number | null {
	// 	const info = this.getChannelInfo();
	// 	return position < info.postIds.length ? info.postIds[position] : null;
	// }
}
