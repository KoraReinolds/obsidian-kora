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

export interface CacheEntry<T> {
	data: T;
	timestamp: number;
	mtime: number; // File modification time
}

export interface CacheOptions {
	ttl?: number; // Time to live in milliseconds (default: 5 minutes)
	maxSize?: number; // Maximum cache size (default: 1000)
}

export abstract class FileParser<T extends BaseFileData = BaseFileData> {
	protected app: App;
	protected vaultOps: VaultOperations;
	protected frontmatterUtils: FrontmatterUtils;
	protected linkParser: LinkParser;

	// Cache system
	private parseCache = new Map<string, CacheEntry<T>>();
	private validationCache = new Map<string, CacheEntry<ValidationResult>>();
	private cacheOptions: Required<CacheOptions>;

	constructor(app: App, cacheOptions: CacheOptions = {}) {
		this.app = app;
		this.vaultOps = new VaultOperations(app);
		this.frontmatterUtils = new FrontmatterUtils(app);
		this.linkParser = new LinkParser(app);

		this.cacheOptions = {
			ttl: cacheOptions.ttl || 5 * 60 * 1000, // 5 minutes
			maxSize: cacheOptions.maxSize || 1000,
		};

		// Set up file change listeners for cache invalidation
		this.setupCacheInvalidation();
	}

	/**
	 * Parse file and return structured data (with caching)
	 */
	async parse(file: TFile): Promise<T> {
		const cacheKey = this.getCacheKey(file);

		// Check cache first
		const cached = this.getFromCache(this.parseCache, cacheKey, file);
		if (cached) {
			return cached;
		}

		// Get base data
		const baseData = await this.getBaseFileData(file);

		// Let subclass extend with specific data
		const result = await this.parseSpecific(baseData);

		// Cache the result
		this.setCache(this.parseCache, cacheKey, result, file);

		return result;
	}

	/**
	 * Validate if file matches the parser's expected format (with caching)
	 */
	async isValid(file: TFile): Promise<ValidationResult> {
		const cacheKey = this.getCacheKey(file);

		// Check cache first
		const cached = this.getFromCache(this.validationCache, cacheKey, file);
		if (cached) {
			return cached;
		}

		try {
			const baseData = await this.getBaseFileData(file);
			const result = this.validateSpecific(baseData);

			// Cache the result
			this.setCache(this.validationCache, cacheKey, result, file);

			return result;
		} catch (error) {
			const result = {
				isValid: false,
				errors: [`Failed to read file: ${error.message}`],
				warnings: [],
			};

			// Cache error result too (with shorter TTL)
			this.setCache(this.validationCache, cacheKey, result, file, 30000); // 30 seconds

			return result;
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

	// Cache management methods

	/**
	 * Generate cache key for file
	 */
	private getCacheKey(file: TFile): string {
		return `${this.getFileType()}:${file.path}`;
	}

	/**
	 * Get entry from cache if valid
	 */
	private getFromCache<K>(
		cache: Map<string, CacheEntry<K>>,
		key: string,
		file: TFile
	): K | null {
		const entry = cache.get(key);
		if (!entry) {
			return null;
		}

		const now = Date.now();
		const isExpired = now - entry.timestamp > this.cacheOptions.ttl;
		const isOutdated = file.stat.mtime > entry.mtime;

		if (isExpired || isOutdated) {
			cache.delete(key);
			return null;
		}

		return entry.data;
	}

	/**
	 * Set entry in cache
	 */
	private setCache<K>(
		cache: Map<string, CacheEntry<K>>,
		key: string,
		data: K,
		file: TFile,
		customTTL?: number
	): void {
		// Clean cache if it's getting too large
		if (cache.size >= this.cacheOptions.maxSize) {
			this.cleanOldEntries(cache);
		}

		cache.set(key, {
			data,
			timestamp: Date.now(),
			mtime: file.stat.mtime,
		});
	}

	/**
	 * Clean old entries from cache
	 */
	private cleanOldEntries<K>(cache: Map<string, CacheEntry<K>>): void {
		const now = Date.now();
		const entriesToDelete: string[] = [];

		for (const [key, entry] of cache.entries()) {
			if (now - entry.timestamp > this.cacheOptions.ttl) {
				entriesToDelete.push(key);
			}
		}

		// If still too large after cleaning expired, remove oldest entries
		if (
			entriesToDelete.length === 0 &&
			cache.size >= this.cacheOptions.maxSize
		) {
			const entries = Array.from(cache.entries());
			entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
			const toRemove = Math.floor(cache.size * 0.2); // Remove 20% of oldest entries
			entriesToDelete.push(...entries.slice(0, toRemove).map(([key]) => key));
		}

		entriesToDelete.forEach(key => cache.delete(key));
	}

	/**
	 * Clear all caches for this parser
	 */
	public clearCache(): void {
		this.parseCache.clear();
		this.validationCache.clear();
	}

	/**
	 * Clear cache for specific file
	 */
	public clearFileCache(file: TFile): void {
		const key = this.getCacheKey(file);
		this.parseCache.delete(key);
		this.validationCache.delete(key);
	}

	/**
	 * Get cache statistics
	 */
	public getCacheStats(): {
		parseCache: { size: number; maxSize: number };
		validationCache: { size: number; maxSize: number };
		ttl: number;
	} {
		return {
			parseCache: {
				size: this.parseCache.size,
				maxSize: this.cacheOptions.maxSize,
			},
			validationCache: {
				size: this.validationCache.size,
				maxSize: this.cacheOptions.maxSize,
			},
			ttl: this.cacheOptions.ttl,
		};
	}

	/**
	 * Set up cache invalidation on file changes
	 */
	private setupCacheInvalidation(): void {
		// Listen for file modifications
		this.app.vault.on('modify', (file: TFile) => {
			this.clearFileCache(file);
		});

		// Listen for file deletions
		this.app.vault.on('delete', (file: TFile) => {
			this.clearFileCache(file);
		});

		// Listen for file renames
		this.app.vault.on('rename', (file: TFile, oldPath: string) => {
			// Clear cache for both old and new paths
			const oldKey = `${this.getFileType()}:${oldPath}`;
			this.parseCache.delete(oldKey);
			this.validationCache.delete(oldKey);
			this.clearFileCache(file);
		});
	}

	/**
	 * Destroy parser and clean up listeners
	 */
	public destroy(): void {
		this.app.vault.off('modify', this.clearFileCache);
		this.app.vault.off('delete', this.clearFileCache);
		this.app.vault.off('rename', this.clearFileCache);
		this.clearCache();
	}
}
