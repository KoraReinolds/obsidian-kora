/**
 * Post File Parser - extracts post-specific configuration and metadata from files
 * Simplified to match actual usage patterns in codebase
 */

import { App, TFile } from 'obsidian';
import { FileParser, BaseFileData, ValidationResult } from './base-file-parser';
import { type ParsedObsidianLink } from '../formatting/link-parser';
import {
	parsePostFileData,
	validatePostFileData,
	type PostFileData as CorePostFileData,
} from '../../../packages/kora-core/src/telegram/parsing/index.js';

export type PostFileData = CorePostFileData<TFile, ParsedObsidianLink>;

export class PostFileParser extends FileParser<PostFileData> {
	constructor(app: App, file?: TFile) {
		super(app, file);
	}

	protected async parseSpecific(baseData: BaseFileData): Promise<PostFileData> {
		return parsePostFileData(baseData);
	}

	protected validateSpecific(baseData: BaseFileData): ValidationResult {
		return validatePostFileData(baseData);
	}

	protected getFileType(): string {
		return 'post';
	}

	async getTelegramMessageId(file?: TFile): Promise<number | null> {
		const postData = await this.parse(file);
		if (!postData) {
			return null;
		}

		const directMessageId = postData.frontmatter.telegram_message_id;
		if (typeof directMessageId === 'number') {
			return directMessageId;
		}

		const postIds = postData.frontmatter.post_ids;
		if (postIds && typeof postIds === 'object' && !Array.isArray(postIds)) {
			const firstMessageId = Object.values(postIds).find(
				value => typeof value === 'number'
			);

			if (typeof firstMessageId === 'number') {
				return firstMessageId;
			}
		}

		return null;
	}
}
