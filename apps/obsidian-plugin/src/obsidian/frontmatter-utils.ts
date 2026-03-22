/**
 * @module obsidian-plugin/obsidian/frontmatter-utils
 * @description Утилиты для работы с frontmatter метаданными заметок.
 *
 * Возможности:
 * - базовые операции с frontmatter: чтение и обновление;
 * - управление полями-массивами с контролем уникальности;
 * - пакетные операции для нескольких файлов;
 * - все операции опираются на {@link updateFrontmatterForFiles} как на базовый механизм.
 */

import { App, TFile, TFolder } from 'obsidian';

export class FrontmatterUtils {
	constructor(private app: App) {}

	/**
	 * @description Читает frontmatter файла.
	 * @param {TFile} file - Файл заметки.
	 * @returns {Promise<any>}
	 */
	async getFrontmatter(file: TFile): Promise<any> {
		const results = await this.getFrontmatterForFiles([file.path]);
		return results[0]?.frontmatter || {};
	}

	/**
	 * @description Читает конкретное поле frontmatter.
	 * @param {TFile} file - Файл заметки.
	 * @param {string} field - Имя поля.
	 * @returns {Promise<any>}
	 */
	async getFrontmatterField(file: TFile, field: string): Promise<any> {
		const frontmatter = await this.getFrontmatter(file);
		return frontmatter[field];
	}

	/**
	 * @description Добавляет значение в поле-массив frontmatter с контролем уникальности.
	 */
	async addToArrayField(file: TFile, field: string, value: any): Promise<void> {
		const frontmatter = await this.getFrontmatter(file);
		const currentArray = frontmatter[field] || [];

		if (!Array.isArray(currentArray)) {
			const existingValue = currentArray;
			await this.updateFrontmatterForFiles([file.path], {
				[field]: [existingValue, value],
			});
			return;
		}

		if (!currentArray.includes(value)) {
			const newArray = [...currentArray, value];
			await this.updateFrontmatterForFiles([file.path], {
				[field]: newArray,
			});
		}
	}

	/**
	 * @description Удаляет значение из поля-массива frontmatter.
	 */
	async removeFromArrayField(
		file: TFile,
		field: string,
		value: any
	): Promise<void> {
		const frontmatter = await this.getFrontmatter(file);
		const currentArray = frontmatter[field];

		if (Array.isArray(currentArray)) {
			const newArray = currentArray.filter(item => item !== value);
			await this.updateFrontmatterForFiles([file.path], {
				[field]: newArray,
			});
		}
	}

	/**
	 * @description Обновляет frontmatter для списка файлов.
	 * @param {string[]} filePaths - Пути файлов для обновления.
	 * @param {Record<string, any>} frontmatter - Объект frontmatter для слияния/записи.
	 * @returns {Promise<{ results: { file: string; status: 'success' | 'error'; message?: string }[] }>}
	 */
	async updateFrontmatterForFiles(
		filePaths: string[],
		frontmatter: Record<string, any>
	) {
		const results: {
			file: string;
			status: 'success' | 'error';
			message?: string;
		}[] = [];
		for (const filePath of filePaths) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				try {
					await this.app.fileManager.processFrontMatter(file, fm => {
						Object.assign(fm, frontmatter);
					});
					results.push({
						file: filePath,
						status: 'success',
					});
				} catch (e: any) {
					results.push({
						file: filePath,
						status: 'error',
						message: e.message,
					});
				}
			} else {
				results.push({
					file: filePath,
					status: 'error',
					message: 'File not found or is not a markdown file.',
				});
			}
		}
		return { results };
	}

	/**
	 * @description Читает frontmatter для списка файлов.
	 * @param {string[]} filePaths - Пути файлов.
	 * @returns {Promise<any[]>} Массив объектов с путём и frontmatter.
	 */
	async getFrontmatterForFiles(filePaths: string[]): Promise<any[]> {
		const results: {
			file: string;
			frontmatter: Record<string, any> | null;
			error?: string;
		}[] = [];
		for (const filePath of filePaths) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				const cache = this.app.metadataCache.getFileCache(file);
				results.push({
					file: filePath,
					frontmatter: cache?.frontmatter || {},
				});
			} else {
				results.push({
					file: filePath,
					frontmatter: null,
					error: 'File not found or not a markdown file.',
				});
			}
		}
		return results;
	}

	/**
	 * @description Читает frontmatter всех markdown-файлов в каталоге `/Area`.
	 * @returns {Promise<any[]>}
	 */
	async getAreaFrontmatters(): Promise<any[]> {
		const areaFolder = this.app.vault.getAbstractFileByPath('Area');
		if (!(areaFolder instanceof TFolder)) {
			console.error('Area folder not found');
			return [];
		}

		const filePaths = areaFolder.children
			.filter(
				(child): child is TFile =>
					child instanceof TFile && child.extension === 'md'
			)
			.map(file => file.path);

		return this.getFrontmatterForFiles(filePaths);
	}
}
