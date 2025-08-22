/**
 * Universal Suggester System - Unified suggestion components for different use cases
 */

import { App, TFolder, FuzzySuggestModal, TFile, Notice } from 'obsidian';
import { ChannelConfigService, ChannelConfig } from '../telegram/channel-config-service';
import type { KoraMcpPluginSettings, TelegramFolderConfig } from '../../main';

// ============================================================================
// BASE CLASSES
// ============================================================================

/**
 * Base class for input-based suggestion functionality
 */
abstract class TextInputSuggest<T> {
	protected inputEl: HTMLInputElement;
	protected suggestEl: HTMLElement;
	protected app: App;
	protected suggestions: T[] = [];
	protected selectedItem = -1;

	constructor(inputEl: HTMLInputElement, app: App) {
		this.inputEl = inputEl;
		this.app = app;
		this.suggestEl = this.createSuggestContainer();

		this.inputEl.addEventListener('input', this.onInputChanged.bind(this));
		this.inputEl.addEventListener('focus', this.onInputChanged.bind(this));
		this.inputEl.addEventListener('blur', this.close.bind(this));
		this.inputEl.addEventListener('keydown', this.onInputKeyDown.bind(this));
	}

	abstract getSuggestions(inputStr: string): T[];
	abstract renderSuggestion(item: T, el: HTMLElement): void;
	abstract selectSuggestion(item: T): void;

	private createSuggestContainer(): HTMLElement {
		const container = document.createElement('div');
		container.className = 'suggestion-container';
		container.style.position = 'absolute';
		container.style.zIndex = '1000';
		container.style.backgroundColor = 'var(--background-primary)';
		container.style.border = '1px solid var(--background-modifier-border)';
		container.style.borderRadius = '8px';
		container.style.maxHeight = '200px';
		container.style.overflowY = 'auto';
		container.style.display = 'none';
		document.body.appendChild(container);
		return container;
	}

	private onInputChanged(): void {
		const inputStr = this.inputEl.value;
		this.suggestions = this.getSuggestions(inputStr);
		this.selectedItem = -1;
		this.renderSuggestions();
	}

	private renderSuggestions(): void {
		this.suggestEl.empty();
		
		if (this.suggestions.length === 0) {
			this.close();
			return;
		}

		const rect = this.inputEl.getBoundingClientRect();
		this.suggestEl.style.top = `${rect.bottom + window.scrollY}px`;
		this.suggestEl.style.left = `${rect.left + window.scrollX}px`;
		this.suggestEl.style.width = `${rect.width}px`;
		this.suggestEl.style.display = 'block';

		this.suggestions.forEach((suggestion, index) => {
			const suggestionEl = this.suggestEl.createDiv();
			suggestionEl.className = 'suggestion-item';
			suggestionEl.style.padding = '8px 12px';
			suggestionEl.style.cursor = 'pointer';
			
			this.renderSuggestion(suggestion, suggestionEl);
			
			suggestionEl.addEventListener('mousedown', (e) => {
				e.preventDefault();
				this.selectSuggestion(suggestion);
				this.close();
			});

			suggestionEl.addEventListener('mouseenter', () => {
				this.selectedItem = index;
				this.updateSelectedItem();
			});
		});

		this.updateSelectedItem();
	}

	private onInputKeyDown(event: KeyboardEvent): void {
		if (!this.suggestEl || this.suggestEl.style.display === 'none') return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				this.selectedItem = Math.min(this.selectedItem + 1, this.suggestions.length - 1);
				this.updateSelectedItem();
				break;
			case 'ArrowUp':
				event.preventDefault();
				this.selectedItem = Math.max(this.selectedItem - 1, -1);
				this.updateSelectedItem();
				break;
			case 'Enter':
				event.preventDefault();
				if (this.selectedItem >= 0) {
					this.selectSuggestion(this.suggestions[this.selectedItem]);
				}
				this.close();
				break;
			case 'Escape':
				event.preventDefault();
				this.close();
				break;
		}
	}

	private updateSelectedItem(): void {
		const items = this.suggestEl.querySelectorAll('.suggestion-item');
		items.forEach((item, index) => {
			const htmlItem = item as HTMLElement;
			if (index === this.selectedItem) {
				htmlItem.addClass('is-selected');
				htmlItem.style.backgroundColor = 'var(--background-modifier-hover)';
			} else {
				htmlItem.removeClass('is-selected');
				htmlItem.style.backgroundColor = '';
			}
		});
	}

	private close(): void {
		this.suggestEl.style.display = 'none';
		this.selectedItem = -1;
	}

	destroy(): void {
		this.suggestEl.remove();
	}
}

/**
 * Base class for modal-based suggestion functionality with common styling and behavior
 */
abstract class BaseFuzzySuggestModal<T> extends FuzzySuggestModal<T> {
	protected onSelectCallback: (item: T) => void;

	constructor(app: App, onSelect: (item: T) => void) {
		super(app);
		this.onSelectCallback = onSelect;
	}

	/**
	 * Enhanced suggestion rendering with consistent styling
	 */
	protected renderSuggestionWithStyling(
		container: HTMLElement,
		title: string,
		subtitle?: string,
		statusInfo?: { text: string; className: string }
	): void {
		// Main title
		const nameEl = container.createDiv({ cls: 'suggestion-title' });
		nameEl.setText(title);
		
		// Subtitle with additional info
		if (subtitle || statusInfo) {
			const infoEl = container.createDiv({ cls: 'suggestion-info' });
			
			if (subtitle) {
				infoEl.createSpan({ cls: 'suggestion-subtitle', text: subtitle });
			}
			
			if (statusInfo) {
				infoEl.createSpan({ 
					cls: `suggestion-status ${statusInfo.className}`, 
					text: statusInfo.text 
				});
			}
		}

		// Apply consistent styling
		this.applySuggestionStyling(container, Boolean(subtitle || statusInfo));
	}

	private applySuggestionStyling(container: HTMLElement, hasSubtitle: boolean): void {
		container.style.padding = '8px 0';
		
		const titleEl = container.querySelector('.suggestion-title') as HTMLElement;
		if (titleEl) {
			titleEl.style.fontWeight = 'bold';
			if (hasSubtitle) {
				titleEl.style.marginBottom = '4px';
			}
		}
		
		const infoEl = container.querySelector('.suggestion-info') as HTMLElement;
		if (infoEl) {
			infoEl.style.fontSize = '0.85em';
			infoEl.style.color = 'var(--text-muted)';
		}
		
		// Status-specific styling
		const publishedEl = container.querySelector('.published') as HTMLElement;
		if (publishedEl) {
			publishedEl.style.color = 'var(--text-success)';
		}
		
		const newEl = container.querySelector('.new') as HTMLElement;
		if (newEl) {
			newEl.style.color = 'var(--text-accent)';
		}

		const configuredEl = container.querySelector('.configured') as HTMLElement;
		if (configuredEl) {
			configuredEl.style.color = 'var(--text-success)';
		}
	}

	onChooseItem(item: T): void {
		this.onSelectCallback(item);
	}
}

// ============================================================================
// SPECIALIZED IMPLEMENTATIONS
// ============================================================================

/**
 * Folder suggestion for text input fields
 */
export class FolderSuggest extends TextInputSuggest<TFolder> {
	getSuggestions(inputStr: string): TFolder[] {
		const allFiles = this.app.vault.getAllLoadedFiles();
		const folders: TFolder[] = [];
		const lowerInputStr = inputStr.toLowerCase();

		allFiles.forEach((file) => {
			if (file instanceof TFolder && file.path.toLowerCase().includes(lowerInputStr)) {
				folders.push(file);
			}
		});

		return folders.sort((a, b) => a.path.localeCompare(b.path));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.inputEl.value = folder.path;
		this.inputEl.trigger('input');
	}
}

/**
 * Folder config suggester modal for selecting configured folders
 */
export class FolderConfigSuggester extends BaseFuzzySuggestModal<TelegramFolderConfig> {
	private settings: KoraMcpPluginSettings;
	private availableConfigs: TelegramFolderConfig[];

	constructor(
		app: App, 
		settings: KoraMcpPluginSettings,
		onSelect: (folderConfig: TelegramFolderConfig) => void
	) {
		super(app, onSelect);
		this.settings = settings;
		this.availableConfigs = [];

		// Set modal title
		this.setPlaceholder('Выберите папку для отправки заметок...');
	}

	/**
	 * Open the suggester and check if folder configs are available
	 */
	public openSuggester(): void {
		// Get available folder configs
		this.availableConfigs = this.settings.telegram.folderConfigs.filter(config => 
			config.folder && config.channels && config.channels.length > 0
		);
		
		if (this.availableConfigs.length === 0) {
			new Notice('Нет настроенных конфигов папок с каналами');
			return;
		}

		// Open the modal
		this.open();
	}

	/**
	 * Get all available folder config items for the fuzzy search
	 */
	getItems(): TelegramFolderConfig[] {
		return this.availableConfigs;
	}

	/**
	 * Get the text to display for each item in the suggester
	 */
	getItemText(folderConfig: TelegramFolderConfig): string {
		return folderConfig.folder;
	}

	/**
	 * Render additional information for each suggestion
	 */
	renderSuggestion(value: { item: TelegramFolderConfig }, el: HTMLElement): void {
		const folderConfig = value.item as TelegramFolderConfig;
		
		// Create main container
		const container = el.createDiv({ cls: 'folder-config-suggestion' });
		
		// Channel count info
		const channelCount = folderConfig.channels.length;
		const channelsText = channelCount === 1 
			? '1 канал' 
			: `${channelCount} каналов`;
		
		// Channel names for display
		const channelNames = folderConfig.channels
			.map(ch => ch.name)
			.slice(0, 3) // Show max 3 channel names
			.join(', ');
		const displayChannels = folderConfig.channels.length > 3 
			? `${channelNames}...` 
			: channelNames;

		// Use the enhanced rendering method
		this.renderSuggestionWithStyling(
			container,
			folderConfig.folder,
			`${channelsText}: ${displayChannels}`,
			{ text: ' • Настроено', className: 'configured' }
		);
	}
}

/**
 * Channel suggester modal for selecting channels to send notes to
 */
export class ChannelSuggester extends BaseFuzzySuggestModal<ChannelConfig> {
	private file: TFile;
	private channelConfigService: ChannelConfigService;
	private availableChannels: ChannelConfig[];

	constructor(
		app: App, 
		file: TFile, 
		settings: KoraMcpPluginSettings,
		onSelect: (channel: ChannelConfig) => void
	) {
		super(app, onSelect);
		this.file = file;
		this.channelConfigService = new ChannelConfigService(app, settings);
		this.availableChannels = [];

		// Set modal title
		this.setPlaceholder('Выберите канал для отправки заметки...');
	}

	/**
	 * Open the suggester and check if channels are available
	 */
	public openSuggester(): void {
		// Check if file is in a configured folder
		const folderConfig = this.channelConfigService.getFolderConfigForFile(this.file);
		if (!folderConfig) {
			new Notice('Файл не находится в папке с настроенным конфигом каналов');
			return;
		}

		// Get available channels for this file
		this.availableChannels = this.channelConfigService.getChannelConfigsForFile(this.file);
		
		if (this.availableChannels.length === 0) {
			new Notice('Нет доступных каналов для этой папки');
			return;
		}

		// Open the modal
		this.open();
	}

	/**
	 * Get all available channel items for the fuzzy search
	 */
	getItems(): ChannelConfig[] {
		return this.availableChannels;
	}

	/**
	 * Get the text to display for each item in the suggester
	 */
	getItemText(channel: ChannelConfig): string {
		return channel.name;
	}

	/**
	 * Render additional information for each suggestion
	 */
	renderSuggestion(value: { item: ChannelConfig }, el: HTMLElement): void {
		const channel = value.item as ChannelConfig;
		
		// Create main container
		const container = el.createDiv({ cls: 'channel-suggestion' });
		
		// Channel ID (shortened for display)
		const channelIdShort = channel.channelId.length > 20 
			? `${channel.channelId.slice(0, 10)}...${channel.channelId.slice(-7)}`
			: channel.channelId;
		
		// Status information
		const statusInfo = channel.messageId 
			? { text: ' • Опубликовано', className: 'published' }
			: { text: ' • Новое сообщение', className: 'new' };

		// Use the enhanced rendering method
		this.renderSuggestionWithStyling(
			container,
			channel.name,
			`ID: ${channelIdShort}`,
			statusInfo
		);
	}
}

// ============================================================================
// FACTORY AND UTILITY FUNCTIONS
// ============================================================================

/**
 * Factory for creating different types of suggesters
 */
export class SuggesterFactory {
	/**
	 * Create a folder suggester for input fields
	 */
	static createFolderSuggest(inputEl: HTMLInputElement, app: App): FolderSuggest {
		return new FolderSuggest(inputEl, app);
	}

	/**
	 * Create a folder config suggester modal
	 */
	static createFolderConfigSuggester(
		app: App,
		settings: KoraMcpPluginSettings,
		onSelect: (folderConfig: TelegramFolderConfig) => void
	): FolderConfigSuggester {
		return new FolderConfigSuggester(app, settings, onSelect);
	}

	/**
	 * Create a channel suggester modal
	 */
	static createChannelSuggester(
		app: App,
		file: TFile,
		settings: KoraMcpPluginSettings,
		onSelect: (channel: ChannelConfig) => void
	): ChannelSuggester {
		return new ChannelSuggester(app, file, settings, onSelect);
	}
}

/**
 * Utility functions for suggester operations
 */
export class SuggesterUtils {
	/**
	 * Format text for display in suggestions with length limits
	 */
	static formatTextForDisplay(text: string, maxLength = 50): string {
		if (text.length <= maxLength) return text;
		return `${text.slice(0, maxLength - 3)}...`;
	}

	/**
	 * Create shortened ID display
	 */
	static formatIdForDisplay(id: string, startLength = 10, endLength = 7): string {
		if (id.length <= startLength + endLength + 3) return id;
		return `${id.slice(0, startLength)}...${id.slice(-endLength)}`;
	}
}

// Re-export commonly used types
export type { ChannelConfig, TelegramFolderConfig };
export { TextInputSuggest, BaseFuzzySuggestModal };