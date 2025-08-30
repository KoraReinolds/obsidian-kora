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

	// File and parsed data stored after successful initialization
	private file: TFile;
	private data: T | null = null;
	private _isValid = false;

	constructor(app: App, file: TFile) {
		this.app = app;
		this.vaultOps = new VaultOperations(app);
		this.frontmatterUtils = new FrontmatterUtils(app);
		this.linkParser = new LinkParser(app);
		this.file = file;
	}

	async parse(): Promise<T | null> {
		try {
			// Constructor calls parse immediately
			await this.parseFile();
			this._isValid = true;
			return this.data;
		} catch (error) {
			this._isValid = false;
			return null;
		}
	}

	private async parseFile(): Promise<void> {
		// Get base data
		const baseData = await this.getBaseFileData();

		// Validate first
		const validation = this.validateSpecific(baseData);
		if (!validation.isValid) {
			throw new Error(
				`File validation failed: ${validation.errors.join(', ')}`
			);
		}

		// Parse and store
		this.data = await this.parseSpecific(baseData);
	}

	/**
	 * Get parsed data (already validated and parsed in constructor)
	 */
	getData(): T {
		if (!this._isValid || !this.data) {
			throw new Error(
				'Parser instance is not valid - file failed validation or parsing'
			);
		}
		return this.data;
	}

	/**
	 * Check if this parser instance is valid (validation done in constructor)
	 */
	isValid(): boolean {
		return this._isValid;
	}

	/**
	 * Get common file data that all parsers need
	 */
	protected async getBaseFileData(): Promise<BaseFileData> {
		const content = await this.vaultOps.getFileContent(this.file);
		const frontmatter = await this.frontmatterUtils.getFrontmatter(this.file);
		const links = this.linkParser.parseObsidianLinks(content);

		return {
			file: this.file,
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

	/**
	 * Get the file this parser instance was created for
	 */
	getFile(): TFile {
		return this.file;
	}
}
