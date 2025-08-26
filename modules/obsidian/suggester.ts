import { App, TFolder } from 'obsidian';

/**
 * Base class for input-based suggestion functionality
 */
export abstract class TextInputSuggest<T> {
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

			suggestionEl.addEventListener('mousedown', e => {
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
				this.selectedItem = Math.min(
					this.selectedItem + 1,
					this.suggestions.length - 1
				);
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
 * Folder suggestion for text input fields
 */
export class FolderSuggest extends TextInputSuggest<TFolder> {
	getSuggestions(inputStr: string): TFolder[] {
		const allFiles = this.app.vault.getAllLoadedFiles();
		const folders: TFolder[] = [];
		const lowerInputStr = inputStr.toLowerCase();

		allFiles.forEach(file => {
			if (
				file instanceof TFolder &&
				file.path.toLowerCase().includes(lowerInputStr)
			) {
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
