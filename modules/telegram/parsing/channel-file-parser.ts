/**
 * Channel File Parser - extracts channel configuration and links from files
 */

import { App, TFile } from 'obsidian';
import { FileParser, BaseFileData, ValidationResult } from './base-file-parser';
import { type ParsedObsidianLink } from '../formatting/link-parser';
import {
	parseChannelFileData,
	validateChannelFileData,
	type ChannelFileData as CoreChannelFileData,
} from '../../../packages/kora-core/src/telegram/parsing/index.js';

export type ChannelFileData = CoreChannelFileData<TFile, ParsedObsidianLink>;

export class ChannelFileParser extends FileParser<ChannelFileData> {
	static channelMap: Record<string, ChannelFileData> = {};

	constructor(app: App, file: TFile) {
		super(app, file);
	}

	protected async parseSpecific(
		baseData: BaseFileData
	): Promise<ChannelFileData> {
		const data = parseChannelFileData(baseData);

		ChannelFileParser.channelMap[data.channelId] = data;

		return data;
	}

	protected validateSpecific(baseData: BaseFileData): ValidationResult {
		return validateChannelFileData(baseData);
	}

	protected getFileType(): string {
		return 'channel';
	}
}
