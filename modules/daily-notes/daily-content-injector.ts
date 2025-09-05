import { App, TFile, WorkspaceLeaf } from 'obsidian';

export class DailyContentInjector {
	private app: App;
	private injectedElements = new WeakMap<HTMLElement, boolean>();

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Проверяет, является ли файл дневной заметкой
	 */
	private isDailyNote(file: TFile): boolean {
		// Паттерн для дневных заметок: YYYY-MM-DD.md
		const dailyNotePattern = /^\d{4}-\d{2}-\d{2}\.md$/;
		return dailyNotePattern.test(file.name) || file.path.includes('Daily/');
	}

	/**
	 * Получает данные PKM для отображения в дневной заметке
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
			// Получаем плагин PKM
			const pkm = (this.app as any).plugins?.plugins[
				'obsidian-daily-first-pkm'
			];
			if (!pkm) {
				container.innerHTML =
					'<p style="color: var(--text-error);">PKM plugin не найден</p>';
				return container;
			}

			// Создаем mock объект dv для имитации dataview
			const mockDv = {
				container: container,
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

			// Вызываем метод notes.daily с нашим mock объектом
			await pkm.notes.daily(this.app, mockDv);
		} catch (error) {
			console.error('Ошибка получения PKM данных:', error);
			container.innerHTML = `<p style="color: var(--text-error);">Ошибка загрузки данных: ${error.message}</p>`;
		}

		return container;
	}

	/**
	 * Вставляет контент в активную дневную заметку
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

		// Проверяем, не был ли уже вставлен контент
		if (this.injectedElements.has(contentEl as HTMLElement)) return;

		// Создаем контейнер для вставки
		const injectionPoint = this.findInjectionPoint(contentEl as HTMLElement);
		if (!injectionPoint) return;

		// Получаем и вставляем данные PKM
		const pkmContent = await this.getPkmData();

		// Добавляем заголовок
		const header = document.createElement('h3');
		header.textContent = 'Daily PKM Data';
		header.style.cssText =
			'margin-top: 24px; color: var(--interactive-accent);';

		// Вставляем контент
		injectionPoint.appendChild(header);
		injectionPoint.appendChild(pkmContent);

		// Отмечаем, что контент уже был вставлен
		this.injectedElements.set(contentEl as HTMLElement, true);
	}

	/**
	 * Находит точку для вставки контента
	 */
	private findInjectionPoint(contentEl: HTMLElement): HTMLElement | null {
		// Ищем место после первого параграфа или в конце контента
		const firstParagraph = contentEl.querySelector('p, .cm-line');

		if (firstParagraph && firstParagraph.parentElement) {
			return firstParagraph.parentElement;
		}

		// Если не найдено, вставляем в начало контента
		return contentEl;
	}

	/**
	 * Очищает вставленный контент при переходе на другую заметку
	 */
	cleanup(): void {
		document.querySelectorAll('.pkm-daily-content').forEach(el => el.remove());
		this.injectedElements = new WeakMap();
	}

	/**
	 * Принудительно обновляет контент в текущей заметке
	 */
	async refreshCurrentNote(): Promise<void> {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf) {
			this.cleanup();
			await this.injectDailyContent(activeLeaf);
		}
	}
}
