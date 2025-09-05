/**
 * Post File Parser - extracts post-specific configuration and metadata from files
 * Simplified to match actual usage patterns in codebase
 */

import { App, TFile } from 'obsidian';
import { FileParser, BaseFileData, ValidationResult } from './base-file-parser';

export interface PostFileData extends BaseFileData {
	// key to channel_id
	channels: Record<string, number>;
}

export class PostFileParser extends FileParser<PostFileData> {
	constructor(app: App, file: TFile) {
		super(app, file);
	}

	protected async parseSpecific(baseData: BaseFileData): Promise<PostFileData> {
		const { frontmatter } = baseData;

		const channels = JSON.parse(
			this.extractFrontmatterValue(frontmatter, 'channels', '{}')
		);

		return {
			...baseData,
			channels,
		};
	}

	protected validateSpecific(baseData: BaseFileData): ValidationResult {
		const { frontmatter } = baseData;
		const errors: string[] = [];
		const warnings: string[] = [];

		// Validate basic structure - only validate fields that exist
		const validationResult = this.validateFrontmatterFields(frontmatter, [
			{ field: 'channels', required: false, expectedType: 'string' },
		]);

		errors.push(...validationResult.errors);
		warnings.push(...validationResult.warnings);

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		};
	}

	protected getFileType(): string {
		return 'post';
	}
}
