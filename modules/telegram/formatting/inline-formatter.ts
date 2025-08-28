/**
 * Inline formatting processor for Telegram markdown
 * Extracts and centralizes duplicate inline formatting logic
 */

import { TELEGRAM_CONSTANTS, type FormattingPattern } from '../core/constants';
import type { TelegramMessageEntity } from './markdown-to-telegram-converter';

export interface FormattingMatch {
	type: string;
	content: string;
	start: number;
	end: number;
	removedChars: number;
	match: string;
}

export interface ProcessedFormatting {
	text: string;
	entities: TelegramMessageEntity[];
}

export class InlineFormatter {
	private readonly patterns: FormattingPattern[] = [
		...TELEGRAM_CONSTANTS.FORMATTING_PATTERNS,
	];

	/**
	 * Process all inline formatting patterns in text
	 */
	processInlineFormatting(
		text: string,
		excludedAreas: Array<{ start: number; end: number }> = []
	): ProcessedFormatting {
		const matches = this.findAllMatches(text, excludedAreas);
		const processedText = this.applyReplacements(text, matches);
		const entities = this.createEntities(matches);

		return {
			text: processedText,
			entities,
		};
	}

	/**
	 * Find all formatting matches in text
	 */
	private findAllMatches(
		text: string,
		excludedAreas: Array<{ start: number; end: number }>
	): FormattingMatch[] {
		const matches: FormattingMatch[] = [];

		for (const pattern of this.patterns) {
			const regex = new RegExp(pattern.regex);
			let match: RegExpExecArray | null;

			while ((match = regex.exec(text)) !== null) {
				const matchStart = match.index;
				const matchEnd = match.index + match[0].length;

				// Check if this match is within an excluded area
				const isInExcludedArea = excludedAreas.some(
					area => matchStart >= area.start && matchEnd <= area.end
				);

				if (isInExcludedArea) {
					continue;
				}

				matches.push({
					type: pattern.type,
					content: match[1],
					start: matchStart,
					end: matchEnd,
					removedChars: pattern.removedChars,
					match: match[0],
				});
			}
		}

		// Sort matches by start position
		return matches.sort((a, b) => a.start - b.start);
	}

	/**
	 * Apply all replacements to text (from end to start to avoid offset issues)
	 */
	private applyReplacements(text: string, matches: FormattingMatch[]): string {
		const sortedMatches = [...matches].sort((a, b) => b.start - a.start);
		let processedText = text;

		for (const match of sortedMatches) {
			processedText =
				processedText.slice(0, match.start) +
				match.content +
				processedText.slice(match.end);
		}

		return processedText;
	}

	/**
	 * Create Telegram entities from matches
	 */
	private createEntities(matches: FormattingMatch[]): TelegramMessageEntity[] {
		const entities: TelegramMessageEntity[] = [];
		let offsetDelta = 0;

		for (const match of matches) {
			const adjustedOffset = match.start - offsetDelta;

			entities.push({
				type: match.type,
				offset: adjustedOffset,
				length: match.content.length,
			});

			offsetDelta += match.removedChars;
		}

		// Sort entities by offset
		return entities.sort((a, b) => a.offset - b.offset);
	}

	/**
	 * Add custom formatting pattern
	 */
	addPattern(pattern: FormattingPattern): void {
		this.patterns.push(pattern);
	}

	/**
	 * Remove formatting pattern by type
	 */
	removePattern(type: string): void {
		const index = this.patterns.findIndex(p => p.type === type);
		if (index !== -1) {
			this.patterns.splice(index, 1);
		}
	}

	/**
	 * Get all active patterns
	 */
	getPatterns(): FormattingPattern[] {
		return [...this.patterns];
	}

	/**
	 * Reset patterns to default
	 */
	resetPatterns(): void {
		this.patterns.length = 0;
		this.patterns.push(...TELEGRAM_CONSTANTS.FORMATTING_PATTERNS);
	}
}
