/**
 * @module obsidian-plugin/obsidian/file-operations
 * @description Операции с файлами и утилиты для фильтрации контента.
 */

import { App, TFile } from 'obsidian';

/**
 * @description Параметры функции {@link getMarkdownFiles}.
 */
export interface GetMarkdownFilesOptions {
	include?: string[];
	exclude?: string[];
}

/**
 * @description Проверяет, соответствует ли путь файла glob-подобному шаблону.
 * @param {string} path - Путь к файлу.
 * @param {string} pattern - Шаблон с поддержкой `*` и `**`.
 * @returns {boolean}
 */
function matchesPattern(path: string, pattern: string): boolean {
	const regexPattern = pattern
		.replace(/\./g, '\\.')
		.replace(/\*\*/g, '__DOUBLE_STAR__')
		.replace(/\*/g, '[^/]*')
		.replace(/__DOUBLE_STAR__/g, '.*');

	const regex = new RegExp(`^${regexPattern}$`);
	return regex.test(path);
}

/**
 * @description Проверка include: при шаблоне с `*` используется glob, иначе подстрока.
 */
function matchesInclude(path: string, pattern: string): boolean {
	const hasWildcard = pattern.includes('*');
	if (hasWildcard) {
		return matchesPattern(path, pattern);
	}
	return path.includes(pattern);
}

/**
 * @description Возвращает markdown-файлы из хранилища с include/exclude фильтрами.
 * @param {App} app - Экземпляр приложения Obsidian.
 * @param {GetMarkdownFilesOptions} [options] - Опциональные include/exclude.
 * @returns {TFile[]}
 */
export function getMarkdownFiles(
	app: App,
	options?: GetMarkdownFilesOptions
): TFile[] {
	const files = app.vault.getMarkdownFiles();
	let filteredFiles = files;

	if (options?.include && options.include.length > 0) {
		filteredFiles = filteredFiles.filter(file =>
			options.include?.some(pattern => matchesInclude(file.path, pattern))
		);
	}

	if (options?.exclude && options.exclude.length > 0) {
		filteredFiles = filteredFiles.filter(
			file =>
				!options.exclude?.some(pattern => matchesInclude(file.path, pattern))
		);
	}

	return filteredFiles;
}
