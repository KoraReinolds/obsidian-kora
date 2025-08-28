/**
 * Command definitions for the Kora MCP plugin
 */

import { App, TFile, Notice, Command } from 'obsidian';
import {
	GramJSBridge,
	ChannelConfigService,
	type ChannelConfig,
	ObsidianTelegramFormatter,
	PositionBasedSync,
} from '../telegram';
import { FrontmatterUtils, VaultOperations, getMarkdownFiles } from '.';
import { DuplicateTimeFixer } from '../utils';
import { RELATED_CHUNKS_VIEW_TYPE } from '../chunking/ui/related-chunks-view';
import { SuggesterFactory } from './suggester-modal';
import type {
	KoraMcpPluginSettings as KoraPluginSettings,
	TelegramFolderConfig,
} from '../../main';

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
				id: 'send-note-gramjs',
				name: 'Send note via GramJS userbot',
				callback: (args?: Record<string, string>) =>
					this.sendNoteViaGramJS(args),
			},
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
				id: 'send-note-to-channel',
				name: 'Send note to channel',
				callback: (args?: Record<string, string>) =>
					this.sendNoteToChannel(args),
			},
			{
				id: 'send-folder-notes-to-channels',
				name: 'Send first level folder notes to channels',
				callback: (args?: Record<string, string>) =>
					this.sendFolderNotesToChannels(args),
			},
			{
				id: 'sync-note-list-to-telegram',
				name: 'Sync note list to Telegram (position-based)',
				callback: (args?: Record<string, string>) =>
					this.syncNoteListToTelegram(args),
			},
			{
				id: 'preview-note-list-sync',
				name: 'Preview note list sync changes',
				callback: (args?: Record<string, string>) =>
					this.previewNoteListSync(args),
			},
		];
	}

	/**
	 * Send note via GramJS userbot
	 */
	private async sendNoteViaGramJS(
		args?: Record<string, string>
	): Promise<void> {
		const file = this.vaultOps.getActiveFile();
		if (!file) {
			new Notice('No active file');
			return;
		}

		const content = await this.vaultOps.getFileContent(file);
		const peer = this.settings.gramjs?.chatId;

		if (!peer) {
			new Notice('Chat ID не настроен');
			return;
		}

		// Check if note is already linked to a Telegram post
		const telegramMessageId = await this.frontmatterUtils.getFrontmatterField(
			file,
			'telegram_message_id'
		);

		// Format message using new telegram formatter
		const telegramFormatter = this.messageFormatter.getTelegramFormatter();
		const { processedText } = telegramFormatter.processCustomEmojis(content);

		if (telegramMessageId) {
			// Edit existing message
			const success = await this.gramjsBridge.editMessage({
				peer,
				messageId: telegramMessageId,
				message: processedText,
				disableWebPagePreview: this.settings.telegram.disableWebPagePreview,
			});
			if (success) {
				new Notice('Сообщение в Telegram обновлено!');
			}
		} else {
			// Send new message
			const result = await this.gramjsBridge.sendMessage({
				peer,
				message: processedText,
				disableWebPagePreview: this.settings.telegram.disableWebPagePreview,
			});
			if (result.success && result.messageId) {
				// Save message ID to frontmatter
				await this.frontmatterUtils.setFrontmatterField(
					file,
					'telegram_message_id',
					result.messageId
				);
				new Notice('Заметка отправлена через GramJS и связана с постом!');
			}
		}
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
	 * Send current note to channel via suggester modal
	 */
	private async sendNoteToChannel(
		args?: Record<string, string>
	): Promise<void> {
		const file = this.vaultOps.getActiveFile();
		if (!file) {
			new Notice('Нет активного файла');
			return;
		}

		const channelSuggester = SuggesterFactory.createChannelSuggester(
			this.app,
			file,
			this.settings
		);

		const channelConfig = await channelSuggester.open();

		if (channelConfig) {
			try {
				await this.sendToSelectedChannel(file, channelConfig);
			} catch (error) {
				new Notice(`Ошибка отправки: ${error}`);
			}
		}
	}

	/**
	 * Send file to the selected channel (reusing logic from UI Manager)
	 */
	private async sendToSelectedChannel(
		file: TFile,
		config: ChannelConfig
	): Promise<void> {
		const channelConfig = Object.assign({}, config);
		const postIds = await this.frontmatterUtils.getFrontmatterField(
			file,
			'post_ids'
		);
		if (postIds && postIds[channelConfig.channelId]) {
			channelConfig.messageId = postIds[channelConfig.channelId];
		}

		const content = await this.vaultOps.getFileContent(file);
		const peer = channelConfig.channelId;

		if (!peer) {
			new Notice(`Channel ID не настроен для ${channelConfig.name}`);
			return;
		}

		// Convert markdown to Telegram format and process custom emojis
		const conversionResult = await this.messageFormatter.formatMarkdownNote(
			file.basename,
			content
		);
		const telegramFormatter = this.messageFormatter.getTelegramFormatter();
		const { processedText, entities: customEmojiEntities } =
			telegramFormatter.processCustomEmojis(conversionResult.text);

		// Combine markdown entities with custom emoji entities
		const combinedEntities = [
			...(conversionResult.entities || []),
			...customEmojiEntities,
		].sort((a, b) => a.offset - b.offset);

		// Use buttons from conversion result if available, otherwise no buttons
		const buttons = conversionResult.buttons;

		if (channelConfig.messageId) {
			// Edit existing message
			const success = await this.gramjsBridge.editMessage({
				peer: channelConfig.channelId,
				messageId: channelConfig.messageId,
				message: processedText + Math.random().toString(),
				entities: combinedEntities,
				buttons,
				disableWebPagePreview:
					this.settings.telegram.disableWebPagePreview || true,
			});
			if (success) {
				new Notice(`Сообщение в ${channelConfig.name} обновлено!`);
			}
		} else {
			// Send new message
			// buttons already defined above, no need to redefine
			const result = await this.gramjsBridge.sendMessage({
				peer: channelConfig.channelId,
				message: processedText,
				entities: combinedEntities,
				buttons,
				disableWebPagePreview:
					this.settings.telegram.disableWebPagePreview || true,
			});
			if (result.success && result.messageId) {
				// Always use new post_ids format
				await this.channelConfigService.updatePostIds(
					file,
					channelConfig.channelId,
					result.messageId
				);
				new Notice(`Заметка отправлена в ${channelConfig.name}!`);
			}
		}
	}

	/**
	 * Send all notes from a selected folder to channels (first level only)
	 */
	private async sendFolderNotesToChannels(
		args?: Record<string, string>
	): Promise<void> {
		// Create folder config suggester and open it
		const folderConfigSuggester = SuggesterFactory.createFolderConfigSuggester(
			this.app,
			this.settings
		);

		const folderConfig = await folderConfigSuggester.open();

		if (folderConfig) {
			try {
				// Create channel suggester for this folder and open it
				const channelSuggester = SuggesterFactory.createFolderChannelSuggester(
					this.app,
					folderConfig
				);

				const channelConfig = await channelSuggester.open();

				if (channelConfig) {
					await this.sendAllNotesFromFolder(folderConfig, channelConfig);
				}
			} catch (error) {
				new Notice(`Ошибка отправки файлов папки: ${error}`);
			}
		}
	}

	/**
	 * Send all notes from a folder to their configured channels (first level only)
	 */
	private async sendAllNotesFromFolder(
		folderConfig: TelegramFolderConfig,
		cannelConfig: ChannelConfig
	): Promise<void> {
		const folderPath = folderConfig.folder;

		// Get all markdown files from the folder (first level only)
		const folderFiles = getMarkdownFiles(this.app, {
			include: [folderConfig.folder],
		});

		if (folderFiles.length === 0) {
			new Notice(`В папке ${folderPath} нет markdown файлов первого уровня`);
			return;
		}

		new Notice(
			`Начинаю отправку ${folderFiles.length} файлов первого уровня из папки ${folderPath} в канал ${cannelConfig.name}...`
		);

		let successCount = 0;
		let errorCount = 0;
		const errors: string[] = [];

		// Process files sequentially to avoid overwhelming the API
		for (const file of folderFiles) {
			try {
				// Send to the selected channel
				await this.sendToSelectedChannel(file, cannelConfig);

				successCount++;
				// Small delay between sends to be respectful to the API
				await new Promise(resolve => setTimeout(resolve, 500));
			} catch (error) {
				errorCount++;
				const errorMsg = `${file.name}: ${error}`;
				errors.push(errorMsg);
				console.error(`Ошибка отправки файла ${file.name}:`, error);
			}
		}

		// Show final results
		const resultMessage = `Готово! Успешно: ${successCount}, Ошибок: ${errorCount}`;
		new Notice(resultMessage);
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

		// Get channel config from frontmatter
		const channelConfig = await this.getChannelConfigFromFrontmatter(file);
		if (!channelConfig) {
			new Notice(
				'Не найдена конфигурация канала в frontmatter. Добавьте channel_id и channel_name.'
			);
			return;
		}

		new Notice('Начинаю синхронизацию списка заметок...');

		try {
			const result = await this.positionBasedSync.syncNoteListWithTelegram(
				file,
				channelConfig
			);

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

	/**
	 * Preview note list sync changes without executing
	 */
	private async previewNoteListSync(
		args?: Record<string, string>
	): Promise<void> {
		const file = this.vaultOps.getActiveFile();
		if (!file) {
			new Notice('Нет активного файла');
			return;
		}

		try {
			const preview = await this.positionBasedSync.previewSyncChanges(file);

			if (preview.noteItems.length === 0) {
				new Notice('В файле не найдены списки заметок');
				return;
			}

			// Create preview report
			let report = `# Preview: Sync Changes for ${file.basename}\n\n`;
			report += `**Total items found:** ${preview.noteItems.length}\n\n`;
			report += `**Current post_ids:** [${preview.postIds.join(', ')}]\n\n`;
			report += `## Planned Actions:\n\n`;

			preview.noteItems.forEach((item, index) => {
				const status = item.fileExists ? '✅' : '❌';
				const action =
					item.action === 'create'
						? '🆕'
						: item.action === 'update'
							? '🔄'
							: '⏭️';

				report += `${index + 1}. ${status} ${action} **${item.fileName}** (${item.action})\n`;
				report += `   - Display: "${item.displayText}"\n`;
				report += `   - File exists: ${item.fileExists}\n`;
				report += `   - Has existing post: ${item.hasExistingPost}\n\n`;
			});

			// Create temporary file with preview
			const previewFile = await this.app.vault.create(
				`Sync_Preview_${file.basename}_${Date.now()}.md`,
				report
			);

			// Open preview
			const leaf = this.app.workspace.getUnpinnedLeaf();
			await leaf?.openFile(previewFile);

			new Notice('Preview created and opened');
		} catch (error) {
			new Notice(`Ошибка создания preview: ${error}`);
		}
	}

	/**
	 * Get channel configuration from file's frontmatter
	 */
	private async getChannelConfigFromFrontmatter(
		file: TFile
	): Promise<ChannelConfig | null> {
		try {
			const frontmatter = await this.frontmatterUtils.getFrontmatter(file);

			const channelId = frontmatter.channel_id;
			const channelName = frontmatter.channel_name || `Channel ${channelId}`;

			if (!channelId) {
				return null;
			}

			return {
				name: channelName,
				channelId: channelId,
			};
		} catch (error) {
			console.error('Error reading channel config from frontmatter:', error);
			return null;
		}
	}
}
