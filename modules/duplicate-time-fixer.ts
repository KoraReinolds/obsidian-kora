import { App, TFile, Notice } from 'obsidian';

export interface DuplicateTimeResult {
	duplicateGroups: { [dateCreated: string]: TFile[] };
	totalDuplicates: number;
	fixed: number;
	errors: Array<{ file: string; error: string }>;
}

export class DuplicateTimeFixer {
	constructor(private app: App) {}

	/**
	 * Находит все заметки с одинаковым временем создания из поля date created в frontmatter
	 */
	async findDuplicateCreationTimes(): Promise<{ [dateCreated: string]: TFile[] }> {
		const files = this.app.vault.getMarkdownFiles();
		const timeMap: { [dateCreated: string]: TFile[] } = {};

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const dateCreated = cache?.frontmatter?.['date created'];

			if (dateCreated) {
				// Нормализуем дату для сравнения
				const normalizedDate = this.normalizeDateString(dateCreated);
				if (normalizedDate) {
					if (!timeMap[normalizedDate]) {
						timeMap[normalizedDate] = [];
					}
					timeMap[normalizedDate].push(file);
				}
			}
		}

		// Возвращаем только группы с дубликатами (больше 1 файла)
		const duplicates: { [dateCreated: string]: TFile[] } = {};
		for (const [dateCreated, fileList] of Object.entries(timeMap)) {
			if (fileList.length > 1) {
				duplicates[dateCreated] = fileList;
			}
		}

		return duplicates;
	}

	/**
	 * Исправляет дубликаты времени создания, добавляя случайные секунды
	 */
	async fixDuplicateCreationTimes(dryRun: boolean = false): Promise<DuplicateTimeResult> {
		const duplicateGroups = await this.findDuplicateCreationTimes();
		const result: DuplicateTimeResult = {
			duplicateGroups,
			totalDuplicates: 0,
			fixed: 0,
			errors: []
		};

		// Подсчитываем общее количество дубликатов
		for (const fileList of Object.values(duplicateGroups)) {
			result.totalDuplicates += fileList.length;
		}

		if (result.totalDuplicates === 0) {
			return result;
		}

		// Исправляем дубликаты
		for (const [originalDateCreated, files] of Object.entries(duplicateGroups)) {
			const originalDate = new Date(originalDateCreated);
			
			// Оставляем первый файл с оригинальным временем, остальные изменяем
			for (let i = 1; i < files.length; i++) {
				const file = files[i];
				try {
					if (!dryRun) {
						// Генерируем новое время: оригинальное + случайное количество секунд (1-300)
						const randomSeconds = Math.floor(Math.random() * 300) + 1;
						const newDate = new Date(originalDate.getTime() + (randomSeconds * 1000));
						
						await this.updateFileCreationTime(file, newDate);
					}
					result.fixed++;
				} catch (error) {
					result.errors.push({
						file: file.path,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
		}

		return result;
	}

	/**
	 * Обновляет время создания файла через поле date created в frontmatter
	 */
	private async updateFileCreationTime(file: TFile, newDate: Date): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			// Получаем исходный формат даты из frontmatter
			const originalDateCreated = frontmatter['date created'];
			
			// Определяем формат для записи на основе исходного значения
			let newDateString: string;
			if (typeof originalDateCreated === 'string' && originalDateCreated.includes('.000Z')) {
				// Если исходный формат с миллисекундами, сохраняем его
				newDateString = newDate.toISOString();
			} else {
				// Иначе используем формат без миллисекунд
				newDateString = newDate.toISOString().replace('.000Z', 'Z');
			}
			
			// Обновляем поле date created в frontmatter
			frontmatter['date created'] = newDateString;
		});
	}

	/**
	 * Нормализует строку даты для сравнения
	 */
	private normalizeDateString(dateValue: any): string | null {
		if (!dateValue) return null;
		
		try {
			const date = new Date(dateValue);
			if (isNaN(date.getTime())) return null;
			
			// Возвращаем ISO строку для консистентного сравнения
			return date.toISOString();
		} catch (e) {
			return null;
		}
	}

	/**
	 * Создает отчет о найденных дубликатах
	 */
	generateReport(result: DuplicateTimeResult): string {
		const lines: string[] = [];
		
		lines.push(`# Отчет о дубликатах времени создания`);
		lines.push(`Найдено групп дубликатов: ${Object.keys(result.duplicateGroups).length}`);
		lines.push(`Общее количество файлов с дубликатами: ${result.totalDuplicates}`);
		lines.push(`Исправлено: ${result.fixed}`);
		lines.push(`Ошибки: ${result.errors.length}`);
		lines.push('');

		if (Object.keys(result.duplicateGroups).length > 0) {
			lines.push('## Найденные дубликаты:');
			lines.push('');

			for (const [dateCreated, files] of Object.entries(result.duplicateGroups)) {
				const date = new Date(dateCreated);
				lines.push(`### ${date.toLocaleString()} (${dateCreated})`);
				for (const file of files) {
					lines.push(`- ${file.path}`);
				}
				lines.push('');
			}
		}

		if (result.errors.length > 0) {
			lines.push('## Ошибки:');
			for (const error of result.errors) {
				lines.push(`- ${error.file}: ${error.error}`);
			}
		}

		return lines.join('\n');
	}
}