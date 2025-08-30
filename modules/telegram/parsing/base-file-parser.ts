/**
 * Base File Parser - common functionality for parsing different file types
 */

import { App, TFile } from 'obsidian';
import { VaultOperations, FrontmatterUtils } from '../../obsidian';
import { LinkParser, ParsedObsidianLink } from '../formatting/link-parser';

export interface BaseFileData {
	file: TFile;
	content: string;
	frontmatter: Record<string, any>;
	links: ParsedObsidianLink[];
}

export interface ValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
}

export abstract class FileParser<T extends BaseFileData = BaseFileData> {
	protected app: App;
	protected vaultOps: VaultOperations;
	protected frontmatterUtils: FrontmatterUtils;
	protected linkParser: LinkParser;

	constructor(app: App) {
		this.app = app;
		this.vaultOps = new VaultOperations(app);
		this.frontmatterUtils = new FrontmatterUtils(app);
		this.linkParser = new LinkParser(app);
	}

	/**
	 * Parse file and return structured data
	 */
	async parse(file: TFile): Promise<T> {
		// Get base data
		const baseData = await this.getBaseFileData(file);

		// Let subclass extend with specific data
		return this.parseSpecific(baseData);
	}

	/**
	 * Validate if file matches the parser's expected format
	 */
	async isValid(file: TFile): Promise<ValidationResult> {
		try {
			const baseData = await this.getBaseFileData(file);
			return this.validateSpecific(baseData);
		} catch (error) {
			return {
				isValid: false,
				errors: [`Failed to read file: ${error.message}`],
				warnings: [],
			};
		}
	}

	/**
	 * Quick check if file is valid (boolean only)
	 */
	async isValidFile(file: TFile): Promise<boolean> {
		const result = await this.isValid(file);
		return result.isValid;
	}

	/**
	 * Get common file data that all parsers need
	 */
	protected async getBaseFileData(file: TFile): Promise<BaseFileData> {
		const content = await this.vaultOps.getFileContent(file);
		const frontmatter = await this.frontmatterUtils.getFrontmatter(file);
		const links = this.linkParser.parseObsidianLinks(content);

		return {
			file,
			content,
			frontmatter,
			links,
		};
	}

	/**
	 * Common validation helpers
	 */
	protected validateFrontmatterField(
		frontmatter: Record<string, any>,
		field: string,
		required = false,
		expectedType?: string
	): { isValid: boolean; error?: string } {
		if (!(field in frontmatter)) {
			if (required) {
				return { isValid: false, error: `Missing required field: ${field}` };
			}
			return { isValid: true };
		}

		const value = frontmatter[field];
		if (expectedType) {
			const actualType = Array.isArray(value) ? 'array' : typeof value;
			if (actualType !== expectedType) {
				return {
					isValid: false,
					error: `Field ${field} should be ${expectedType}, got ${actualType}`,
				};
			}
		}

		return { isValid: true };
	}

	protected validateFrontmatterFields(
		frontmatter: Record<string, any>,
		fieldValidations: {
			field: string;
			required?: boolean;
			expectedType?: string;
		}[]
	): { errors: string[]; warnings: string[] } {
		const errors: string[] = [];
		const warnings: string[] = [];

		for (const validation of fieldValidations) {
			const result = this.validateFrontmatterField(
				frontmatter,
				validation.field,
				validation.required,
				validation.expectedType
			);

			if (!result.isValid && result.error) {
				errors.push(result.error);
			}
		}

		return { errors, warnings };
	}

	/**
	 * Extract typed value from frontmatter with default
	 */
	protected extractFrontmatterValue<V>(
		frontmatter: Record<string, any>,
		key: string,
		defaultValue: V
	): V {
		return frontmatter[key] !== undefined ? frontmatter[key] : defaultValue;
	}

	/**
	 * Abstract methods that subclasses must implement
	 */
	protected abstract parseSpecific(baseData: BaseFileData): Promise<T>;
	protected abstract validateSpecific(baseData: BaseFileData): ValidationResult;

	/**
	 * Helper method to get file type identifier for logging/debugging
	 */
	protected abstract getFileType(): string;
}
