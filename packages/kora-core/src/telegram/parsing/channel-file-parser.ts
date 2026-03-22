import {
	extractFrontmatterValue,
	validateFrontmatterFields,
	type BaseFileData,
	type FileValidationResult,
} from './base-file-parser.js';

export interface LinkWithPostId {
	postId?: number;
}

export interface ChannelFileFields {
	channelId: string;
	postIds: number[];
}

export type ChannelFileData<
	TFile = unknown,
	TLink extends LinkWithPostId = LinkWithPostId,
> = BaseFileData<TFile, TLink> & ChannelFileFields;

export function parseChannelFileData<TFile, TLink extends LinkWithPostId>(
	baseData: BaseFileData<TFile, TLink>
): ChannelFileData<TFile, TLink> {
	const channelId = extractFrontmatterValue<string>(
		baseData.frontmatter,
		'channel_id',
		''
	);
	const postIds = extractFrontmatterValue<number[]>(
		baseData.frontmatter,
		'post_ids',
		[]
	);

	const links = baseData.links.map((link, index) => ({
		...link,
		postId: postIds[index],
	})) as TLink[];

	return {
		...baseData,
		links,
		channelId,
		postIds,
	};
}

export function validateChannelFileData<TFile, TLink>(
	baseData: BaseFileData<TFile, TLink>
): FileValidationResult {
	const { errors, warnings } = validateFrontmatterFields(baseData.frontmatter, [
		{ field: 'channel_id', required: true, expectedType: 'string' },
		{ field: 'post_ids', required: false, expectedType: 'array' },
	]);

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
