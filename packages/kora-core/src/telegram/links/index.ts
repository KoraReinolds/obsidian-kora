/**
 * @description Публичный API shared helper-функций для ссылок Telegram и Obsidian.
 */
export {
	countLinks,
	generateTelegramPostUrl,
	parseButtonLineMatches,
	parseButtonsFromFrontmatter,
	parseLinks,
	parseMarkdownLinks,
	parseObsidianLinkMatches,
	replaceObsidianLinksWithMarkdown,
	type BaseParsedLink,
	type LinkCounts,
	type ParsedButtonLink,
	type ParsedLinkMatch,
	type ParsedMarkdownLink,
	type ParsedObsidianLinkMatch,
	type ProcessedLink,
} from './link-parser.js';
