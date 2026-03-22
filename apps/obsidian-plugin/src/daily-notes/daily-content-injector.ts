import { App, TFile, WorkspaceLeaf } from 'obsidian';

export class DailyContentInjector {
	private app: App;
	private injectedElements = new WeakMap<HTMLElement, boolean>();

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * @description Проверяет, является ли файл дневной заметкой.
	 * @param {TFile} file - Файл заметки.
	 * @returns {boolean}
	 */
	private isDailyNote(file: TFile): boolean {
		const dailyNotePattern = /^\d{4}-\d{2}-\d{2}\.md$/;
		return dailyNotePattern.test(file.name) || file.path.includes('Daily/');
	}

	/**
	 * @description Получает данные PKM для отображения в дневной заметке.
	 * @returns {Promise<HTMLElement>}
	 */
	private async getPkmData(): Promise<HTMLElement> {
		const container = document.createElement('div');
		container.className = 'pkm-daily-content';
		container.style.cssText = `
			background: var(--background-secondary);
			border-radius: 6px;
			padding: 16px;
			margin: 16px 0;
			border-left: 3px solid var(--interactive-accent);
		`;

		try {
			const pkm = (this.app as any).plugins?.plugins[
				'obsidian-daily-first-pkm'
			];
			if (!pkm) {
				container.innerHTML =
					'<p style="color: var(--text-error);">PKM plugin не найден</p>';
				return container;
			}

			const mockDv = {
				container,
				el: (tag: string, content?: string) => {
					const el = document.createElement(tag);
					if (content) el.textContent = content;
					container.appendChild(el);
					return el;
				},
				header: (level: number, text: string) => {
					const el = document.createElement(`h${level}`);
					el.textContent = text;
					container.appendChild(el);
					return el;
				},
				paragraph: (text: string) => {
					const el = document.createElement('p');
					el.textContent = text;
					container.appendChild(el);
					return el;
				},
				list: (items: string[]) => {
					const ul = document.createElement('ul');
					items.forEach(item => {
						const li = document.createElement('li');
						li.textContent = item;
						ul.appendChild(li);
					});
					container.appendChild(ul);
					return ul;
				},
			};

			await pkm.notes.daily(this.app, mockDv);
		} catch (error) {
			console.error('Ошибка получения PKM данных:', error);
			const message =
				error instanceof Error ? error.message : 'Неизвестная ошибка';
			container.innerHTML = `<p style="color: var(--text-error);">Ошибка загрузки данных: ${message}</p>`;
		}

		return container;
	}

	/**
	 * @description Вставляет дополнительный контент в активную дневную заметку.
	 * @param {WorkspaceLeaf} leaf - Активный leaf редактора.
	 * @returns {Promise<void>}
	 */
	async injectDailyContent(leaf: WorkspaceLeaf): Promise<void> {
		if (!leaf || !leaf.view || leaf.view.getViewType() !== 'markdown') return;

		const file = (leaf.view as any).file as TFile;
		if (!file || !this.isDailyNote(file)) return;

		const viewEl = leaf.view.containerEl;
		const contentEl = viewEl.querySelector(
			'.cm-editor, .markdown-preview-view'
		);

		if (!contentEl) return;
		if (this.injectedElements.has(contentEl as HTMLElement)) return;

		const injectionPoint = this.findInjectionPoint(contentEl as HTMLElement);
		if (!injectionPoint) return;

		const pkmContent = await this.getPkmData();

		const header = document.createElement('h3');
		header.textContent = 'Daily PKM Data';
		header.style.cssText =
			'margin-top: 24px; color: var(--interactive-accent);';

		injectionPoint.appendChild(header);
		injectionPoint.appendChild(pkmContent);

		this.injectedElements.set(contentEl as HTMLElement, true);
	}

	/**
	 * @description Находит точку вставки дополнительного контента.
	 * @param {HTMLElement} contentEl - Корневой контейнер заметки.
	 * @returns {HTMLElement | null}
	 */
	private findInjectionPoint(contentEl: HTMLElement): HTMLElement | null {
		const firstParagraph = contentEl.querySelector('p, .cm-line');

		if (firstParagraph && firstParagraph.parentElement) {
			return firstParagraph.parentElement;
		}

		return contentEl;
	}

	/**
	 * @description Очищает ранее вставленный контент.
	 * @returns {void}
	 */
	cleanup(): void {
		document.querySelectorAll('.pkm-daily-content').forEach(el => el.remove());
		this.injectedElements = new WeakMap();
	}

	/**
	 * @description Принудительно обновляет контент в текущей заметке.
	 * @returns {Promise<void>}
	 */
	async refreshCurrentNote(): Promise<void> {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf) {
			this.cleanup();
			await this.injectDailyContent(activeLeaf);
		}
	}
}
