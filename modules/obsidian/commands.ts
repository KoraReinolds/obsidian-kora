/**
 * Command definitions for the Kora MCP plugin
 */

import { App, Notice, Command } from 'obsidian';
import {
	GramJSBridge,
	ChannelConfigService,
	ObsidianTelegramFormatter,
	PositionBasedSync,
} from '../telegram';
import { FrontmatterUtils, VaultOperations } from '.';
import { DuplicateTimeFixer } from '../utils';
import { RELATED_CHUNKS_VIEW_TYPE } from '../chunking/ui/related-chunks-view';
import type { KoraMcpPluginSettings as KoraPluginSettings } from '../../main';

export class PluginCommands {
	private app: App;
	private settings: KoraPluginSettings;
	private gramjsBridge: GramJSBridge;
	private messageFormatter: ObsidianTelegramFormatter;
	private duplicateTimeFixer: DuplicateTimeFixer;
	private frontmatterUtils: FrontmatterUtils;
	private channelConfigService: ChannelConfigService;
	private vaultOps: VaultOperations;
	private positionBasedSync: PositionBasedSync;

	constructor(
		app: App,
		settings: KoraPluginSettings,
		gramjsBridge: GramJSBridge
	) {
		this.app = app;
		this.settings = settings;
		this.gramjsBridge = gramjsBridge;
		this.duplicateTimeFixer = new DuplicateTimeFixer(app);
		this.frontmatterUtils = new FrontmatterUtils(app);
		this.channelConfigService = new ChannelConfigService(app, settings);
		this.vaultOps = new VaultOperations(app);
		this.messageFormatter = new ObsidianTelegramFormatter(
			app,
			settings.telegram.customEmojis,
			settings.telegram.useCustomEmojis,
			this.channelConfigService
		);
		this.positionBasedSync = new PositionBasedSync(app, settings, gramjsBridge);
	}

	/**
	 * Get all commands
	 */
	getCommands(): Command[] {
		return [
			{
				id: 'test-gramjs-connection',
				name: 'Test GramJS connection',
				callback: (args?: Record<string, string>) =>
					this.testGramJSConnection(args),
			},
			{
				id: 'move-to-notes',
				name: 'Move to Notes',
				callback: (args?: Record<string, string>) => this.moveToNotes(args),
			},
			{
				id: 'find-duplicate-creation-times',
				name: 'Find duplicate creation times',
				callback: (args?: Record<string, string>) =>
					this.findDuplicateCreationTimes(args),
			},
			{
				id: 'fix-duplicate-creation-times',
				name: 'Fix duplicate creation times',
				callback: (args?: Record<string, string>) =>
					this.fixDuplicateCreationTimes(args),
			},
			{
				id: 'open-related-chunks',
				name: 'Open Related Chunks',
				callback: (args?: Record<string, string>) =>
					this.openRelatedChunks(args),
			},
			{
				id: 'sync-note-list-to-telegram',
				name: 'Sync note list to Telegram (position-based)',
				callback: (args?: Record<string, string>) =>
					this.syncNoteListToTelegram(args),
			},
		];
	}

	/**
	 * Test GramJS connection
	 */
	private async testGramJSConnection(
		args?: Record<string, string>
	): Promise<void> {
		await this.gramjsBridge.testConnection();
	}

	/**
	 * Move file to Notes folder
	 */
	private async moveToNotes(args?: Record<string, string>): Promise<void> {
		const file = this.vaultOps.getActiveFile();
		if (!file) {
			new Notice('Нет активного файла');
			return;
		}

		// Use passed argument or default value
		const targetFolder = args?.targetFolder || 'Organize/Notes';

		await this.vaultOps.moveFileToFolder(file, targetFolder);
	}

	/**
	 * Find notes with duplicate creation times
	 */
	private async findDuplicateCreationTimes(
		args?: Record<string, string>
	): Promise<void> {
		new Notice('Поиск дубликатов времени создания...');

		try {
			const duplicates =
				await this.duplicateTimeFixer.findDuplicateCreationTimes();
			const duplicateCount = Object.keys(duplicates).length;

			if (duplicateCount === 0) {
				new Notice('Дубликаты времени создания не найдены!');
				return;
			}

			const result =
				await this.duplicateTimeFixer.fixDuplicateCreationTimes(true); // dry run
			const report = this.duplicateTimeFixer.generateReport(result);

			// Создаем временный файл с отчетом
			const reportFile = await this.app.vault.create(
				`Duplicate_Creation_Times_Report_${Date.now()}.md`,
				report
			);

			// Открываем отчет
			const leaf = this.app.workspace.getUnpinnedLeaf();
			await leaf?.openFile(reportFile);

			new Notice(`Найдено ${duplicateCount} групп дубликатов. Отчет открыт.`);
		} catch (error) {
			new Notice(`Ошибка поиска дубликатов: ${error}`);
		}
	}

	/**
	 * Fix notes with duplicate creation times
	 */
	private async fixDuplicateCreationTimes(
		args?: Record<string, string>
	): Promise<void> {
		new Notice('Исправление дубликатов времени создания...');

		try {
			const result =
				await this.duplicateTimeFixer.fixDuplicateCreationTimes(false);

			if (result.totalDuplicates === 0) {
				new Notice('Дубликаты времени создания не найдены!');
				return;
			}

			const report = this.duplicateTimeFixer.generateReport(result);

			// Создаем файл с отчетом об исправлении
			const reportFile = await this.app.vault.create(
				`Fixed_Creation_Times_Report_${Date.now()}.md`,
				report
			);

			// Открываем отчет
			const leaf = this.app.workspace.getUnpinnedLeaf();
			await leaf?.openFile(reportFile);

			new Notice(
				`Исправлено ${result.fixed} из ${result.totalDuplicates} файлов. Отчет открыт.`
			);
		} catch (error) {
			new Notice(`Ошибка исправления дубликатов: ${error}`);
		}
	}

	/**
	 * Open Related Chunks view
	 */
	private async openRelatedChunks(
		args?: Record<string, string>
	): Promise<void> {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice('Unable to create right panel view');
			return;
		}

		try {
			await leaf.setViewState({ type: RELATED_CHUNKS_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
			new Notice('Related Chunks view opened');
		} catch (error) {
			new Notice(`Error opening Related Chunks view: ${error}`);
		}
	}

	/**
	 * Sync note list to Telegram using position-based logic
	 */
	private async syncNoteListToTelegram(
		args?: Record<string, string>
	): Promise<void> {
		const file = this.vaultOps.getActiveFile();

		if (!file) {
			new Notice('Нет активного файла');
			return;
		}

		new Notice('Начинаю синхронизацию списка заметок...');

		try {
			const result =
				await this.positionBasedSync.syncNoteListWithTelegram(file);

			if (result.success) {
				const message = `Синхронизация завершена! Обновлено: ${result.updated}, Создано: ${result.created}`;
				new Notice(message);

				if (result.errors.length > 0) {
					console.warn('Sync errors:', result.errors);
					new Notice(`Есть ошибки: ${result.errors.length} (см. консоль)`);
				}
			} else {
				new Notice(`Ошибка синхронизации: ${result.errors.join(', ')}`);
			}
		} catch (error) {
			new Notice(`Ошибка синхронизации: ${error}`);
		}
	}
}
