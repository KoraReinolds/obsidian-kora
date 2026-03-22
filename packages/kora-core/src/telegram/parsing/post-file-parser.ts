import {
	extractFrontmatterValue,
	validateFrontmatterFields,
	type BaseFileData,
	type FileValidationResult,
} from './base-file-parser.js';

export interface PostFileFields {
	channels: Record<string, number>;
}

export type PostFileData<TFile = unknown, TLink = unknown> = BaseFileData<
	TFile,
	TLink
> &
	PostFileFields;

export function parsePostFileData<TFile, TLink>(
	baseData: BaseFileData<TFile, TLink>
): PostFileData<TFile, TLink> {
	const channels = JSON.parse(
		extractFrontmatterValue(baseData.frontmatter, 'channels', '{}')
	) as Record<string, number>;

	return {
		...baseData,
		channels,
	};
}

export function validatePostFileData<TFile, TLink>(
	baseData: BaseFileData<TFile, TLink>
): FileValidationResult {
	const { errors, warnings } = validateFrontmatterFields(baseData.frontmatter, [
		{ field: 'channels', required: false, expectedType: 'string' },
	]);

	return {
		isValid: errors.length === 0,
		errors,
		warnings,
	};
}
