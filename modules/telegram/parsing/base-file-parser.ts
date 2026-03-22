/**
 * Base File Parser - common functionality for parsing different file types
 */

import { App, TFile } from 'obsidian';
import { VaultOperations, FrontmatterUtils } from '../../obsidian';
import { LinkParser, ParsedObsidianLink } from '../formatting/link-parser';
import {
	extractFrontmatterValue,
	stripFrontmatter,
	validateFrontmatterField,
	validateFrontmatterFields,
	type BaseFileData as CoreBaseFileData,
	type FileValidationResult,
} from '../../../packages/kora-core/src/telegram/parsing/index.js';

export type BaseFileData = CoreBaseFileData<TFile, ParsedObsidianLink>;
export type ValidationResult = FileValidationResult;

export abstract class FileParser<T extends BaseFileData = BaseFileData> {
	protected app: App;
	protected vaultOps: VaultOperations;
	protected frontmatterUtils: FrontmatterUtils;
	protected linkParser: LinkParser;

	// File and parsed data stored after successful initialization
	private file: TFile | null;
	private data: T | null = null;
	private _isValid = false;

	constructor(app: App, file?: TFile) {
		this.app = app;
		this.vaultOps = new VaultOperations(app);
		this.frontmatterUtils = new FrontmatterUtils(app);
		this.linkParser = new LinkParser(app);
		this.file = file ?? null;
	}

	async parse(file?: TFile): Promise<T | null> {
		const targetFile = file ?? this.file;
		if (!targetFile) {
			this._isValid = false;
			this.data = null;
			return null;
		}

		this.file = targetFile;

		try {
			await this.parseFile(targetFile);
			this._isValid = true;
			return this.data;
		} catch (error) {
			this._isValid = false;
			return null;
		}
	}

	async isValidFile(file?: TFile): Promise<boolean> {
		const parsed = await this.parse(file);
		return parsed !== null;
	}

	private async parseFile(file: TFile): Promise<void> {
		const baseData = await this.getBaseFileData(file);

		const validation = this.validateSpecific(baseData);
		if (!validation.isValid) {
			throw new Error(
				`File validation failed: ${validation.errors.join(', ')}`
			);
		}

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
	protected async getBaseFileData(file: TFile): Promise<BaseFileData> {
		const content = await this.vaultOps.getFileContent(file);
		const frontmatter = await this.frontmatterUtils.getFrontmatter(file);
		const contentWithoutFrontmatter = stripFrontmatter(content);
		const links = this.linkParser.parseObsidianLinks(contentWithoutFrontmatter);

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
		return validateFrontmatterField(frontmatter, field, required, expectedType);
	}

	protected validateFrontmatterFields(
		frontmatter: Record<string, any>,
		fieldValidations: {
			field: string;
			required?: boolean;
			expectedType?: string;
		}[]
	): { errors: string[]; warnings: string[] } {
		return validateFrontmatterFields(frontmatter, fieldValidations);
	}

	/**
	 * Extract typed value from frontmatter with default
	 */
	protected extractFrontmatterValue<V>(
		frontmatter: Record<string, any>,
		key: string,
		defaultValue: V
	): V {
		return extractFrontmatterValue(frontmatter, key, defaultValue);
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
		if (!this.file) {
			throw new Error('Parser file is not set');
		}

		return this.file;
	}
}
