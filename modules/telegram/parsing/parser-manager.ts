/**
 * Parser Manager - manages singleton instances of parsers with shared cache configuration
 */

import { App } from 'obsidian';
import { ChannelFileParser } from './channel-file-parser';
import { PostFileParser } from './post-file-parser';
import type { CacheOptions } from './base-file-parser';

/**
 * Global parser manager for telegram module
 * Ensures single instances of parsers with consistent cache settings
 */
export class ParserManager {
	private static instance: ParserManager | null = null;
	private app: App;
	private cacheOptions: CacheOptions;

	private channelParser: ChannelFileParser | null = null;
	private postParser: PostFileParser | null = null;

	private constructor(app: App, cacheOptions: CacheOptions = {}) {
		this.app = app;
		this.cacheOptions = {
			ttl: cacheOptions.ttl || 5 * 60 * 1000, // 5 minutes default
			maxSize: cacheOptions.maxSize || 1000, // 1000 files default
		};
	}

	/**
	 * Get or create parser manager instance
	 */
	public static getInstance(
		app: App,
		cacheOptions?: CacheOptions
	): ParserManager {
		if (!ParserManager.instance) {
			ParserManager.instance = new ParserManager(app, cacheOptions);
		}
		return ParserManager.instance;
	}

	/**
	 * Get channel file parser (singleton)
	 */
	public getChannelParser(): ChannelFileParser {
		if (!this.channelParser) {
			this.channelParser = new ChannelFileParser(this.app, this.cacheOptions);
		}
		return this.channelParser;
	}

	/**
	 * Get post file parser (singleton)
	 */
	public getPostParser(): PostFileParser {
		if (!this.postParser) {
			this.postParser = new PostFileParser(this.app, this.cacheOptions);
		}
		return this.postParser;
	}

	/**
	 * Update cache configuration for all parsers
	 */
	public updateCacheOptions(newOptions: CacheOptions): void {
		this.cacheOptions = { ...this.cacheOptions, ...newOptions };

		// Clear and recreate parsers with new cache options
		if (this.channelParser) {
			this.channelParser.destroy();
			this.channelParser = new ChannelFileParser(this.app, this.cacheOptions);
		}

		if (this.postParser) {
			this.postParser.destroy();
			this.postParser = new PostFileParser(this.app, this.cacheOptions);
		}
	}

	/**
	 * Clear all caches
	 */
	public clearAllCaches(): void {
		this.channelParser?.clearCache();
		this.postParser?.clearCache();
	}

	/**
	 * Get comprehensive cache statistics
	 */
	public getCacheStats(): {
		channelParser?: ReturnType<ChannelFileParser['getCacheStats']>;
		postParser?: ReturnType<PostFileParser['getCacheStats']>;
		totalMemoryUsage: number;
	} {
		const stats: any = {
			totalMemoryUsage: 0,
		};

		if (this.channelParser) {
			stats.channelParser = this.channelParser.getCacheStats();
			stats.totalMemoryUsage +=
				stats.channelParser.parseCache.size +
				stats.channelParser.validationCache.size;
		}

		if (this.postParser) {
			stats.postParser = this.postParser.getCacheStats();
			stats.totalMemoryUsage +=
				stats.postParser.parseCache.size +
				stats.postParser.validationCache.size;
		}

		return stats;
	}

	/**
	 * Destroy all parsers and clean up
	 */
	public destroy(): void {
		this.channelParser?.destroy();
		this.postParser?.destroy();
		this.channelParser = null;
		this.postParser = null;
		ParserManager.instance = null;
	}

	/**
	 * Reset singleton instance (for testing)
	 */
	public static reset(): void {
		ParserManager.instance?.destroy();
		ParserManager.instance = null;
	}
}

// Convenience functions for getting parsers
export function getChannelParser(
	app: App,
	cacheOptions?: CacheOptions
): ChannelFileParser {
	return ParserManager.getInstance(app, cacheOptions).getChannelParser();
}

export function getPostParser(
	app: App,
	cacheOptions?: CacheOptions
): PostFileParser {
	return ParserManager.getInstance(app, cacheOptions).getPostParser();
}

export function getParserManager(
	app: App,
	cacheOptions?: CacheOptions
): ParserManager {
	return ParserManager.getInstance(app, cacheOptions);
}
