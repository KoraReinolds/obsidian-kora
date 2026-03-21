/**
 * @module modules/obsidian/file-operations
 * @description Операции с файлами и утилиты для контента.
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
 * @param {string} pattern - Шаблон glob-подобный (* и ** поддерживаются).
 * @returns {boolean} Совпадение пути с шаблоном.
 */
function matchesPattern(path: string, pattern: string): boolean {
	// Convert glob-like pattern to regex
	// Support for * (any characters) and ** (any directories)
	// First escape dots, then handle globs with placeholders to avoid conflicts
	const regexPattern = pattern
		.replace(/\./g, '\\.') // Escape dots first
		.replace(/\*\*/g, '__DOUBLE_STAR__') // Temporary placeholder for **
		.replace(/\*/g, '[^/]*') // * matches any characters except /
		.replace(/__DOUBLE_STAR__/g, '.*'); // ** matches any directories

	const regex = new RegExp(`^${regexPattern}$`);
	return regex.test(path);
}

/**
 * @description Проверка include: при шаблоне с `*` — glob; иначе подстрока.
 */
function matchesInclude(path: string, pattern: string): boolean {
	const hasWildcard = pattern.includes('*');
	if (hasWildcard) {
		return matchesPattern(path, pattern);
	}
	return path.includes(pattern);
}

/**
 * @description Возвращает markdown-файлы из хранилища с фильтрами.
 * @param {App} app - Экземпляр приложения Obsidian.
 * @param {GetMarkdownFilesOptions} [options] - Опциональные include/exclude.
 * @returns {TFile[]} Массив файлов.
 *
 * Примечание: для папок используйте `include` с glob, а не отдельный folderPath.
 * Пример: `include: ['Notes/**', 'Projects/*.md']`.
 */
export function getMarkdownFiles(
	app: App,
	options?: GetMarkdownFilesOptions
): TFile[] {
	const files = app.vault.getMarkdownFiles();

	// Start with all files
	let filteredFiles = files;

	// Apply include filter if provided
	if (options?.include && options.include.length > 0) {
		filteredFiles = filteredFiles.filter(file =>
			options.include?.some(pattern => matchesInclude(file.path, pattern))
		);
	}

	// Apply exclude filter if provided
	if (options?.exclude && options.exclude.length > 0) {
		filteredFiles = filteredFiles.filter(
			file =>
				!options.exclude?.some(pattern => matchesInclude(file.path, pattern))
		);
	}

	return filteredFiles;
}
