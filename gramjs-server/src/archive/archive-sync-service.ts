/**
 * @module archive/archive-sync-service
 *
 * @description Координирует загрузку истории Telegram в SQLite. Сервис держит синк
 * идемпотентным и инкрементальным, чтобы последующие AI-слои могли считать SQLite
 * стабильным источником правды, а не «кэшем на скорую руку».
 *
 * @see {@link ArchiveRepository} детали персистенции
 * @see {@link ArchiveNormalizer} нормализация Telegram → архив
 */

import type { ArchiveSyncResult } from '../../../telegram-types.js';
import { initClient } from '../services/strategy-service.js';
import { ArchiveNormalizer } from './archive-normalizer.js';
import { ArchiveRepository } from './archive-repository.js';
import type {
	ArchiveSyncCounters,
	ArchiveSyncOptions,
} from './archive-types.js';

/**
 * @description Высокоуровневый оркестратор синхронизации архива.
 */
export class ArchiveSyncService {
	private readonly normalizer = new ArchiveNormalizer();

	constructor(private readonly repository: ArchiveRepository) {}

	/**
	 * @async
	 * @description Выполняет одну синхронизацию архива для указанного peer Telegram.
	 * Первый запуск забирает последние `limit` сообщений как прагматичный bootstrap.
	 * Последующие запуски используют сохранённый id сообщения как курсор, чтобы
	 * повторные синки были дешёвыми и безопасными.
	 * @param {ArchiveSyncOptions} options - Peer и лимиты этого прогона.
	 * @returns {Promise<ArchiveSyncResult>} Метрики синка и итоговый курсор.
	 * @throws {Error} При ошибке доступа к Telegram или записи в БД.
	 */
	async syncPeer(options: ArchiveSyncOptions): Promise<ArchiveSyncResult> {
		const { peer, limit, forceFull = false } = options;
		const startedAt = new Date().toISOString();
		const strategy = await initClient();
		const dialog = await this.findDialogForPeer(peer, limit);
		const chatId = this.normalizer.resolveChatId(peer, dialog);
		const previousLastMessageId = forceFull
			? null
			: this.repository.getLastMessageId(chatId);

		this.repository.upsertChat(this.normalizer.normalizeChat(peer, dialog));
		this.repository.upsertSyncState({
			chatId,
			lastMessageId: previousLastMessageId,
			lastSyncStartedAt: startedAt,
			lastSyncFinishedAt: null,
			status: 'running',
			errorText: null,
		});

		try {
			const rawMessages = await strategy.getMessages(peer, {
				limit,
				minId: previousLastMessageId ?? 0,
				maxId: 0,
			});

			const sortedMessages = [...rawMessages].sort(
				(a, b) => Number(a.id) - Number(b.id)
			);
			const counters: ArchiveSyncCounters = {
				inserted: 0,
				updated: 0,
				skipped: 0,
			};

			this.repository.transaction(() => {
				for (const message of sortedMessages) {
					const participant = this.normalizer.normalizeParticipant(message);
					this.repository.upsertParticipant(participant);

					const result = this.repository.upsertMessage(
						this.normalizer.normalizeMessage(chatId, message)
					);

					counters[result] += 1;
				}
			});

			const lastMessageId =
				sortedMessages.length > 0
					? Number(sortedMessages[sortedMessages.length - 1].id)
					: previousLastMessageId;
			const finishedAt = new Date().toISOString();

			this.repository.upsertChat({
				...this.normalizer.normalizeChat(peer, dialog),
				lastSyncedAt: finishedAt,
			});
			this.repository.upsertSyncState({
				chatId,
				lastMessageId,
				lastSyncStartedAt: startedAt,
				lastSyncFinishedAt: finishedAt,
				status: 'success',
				errorText: null,
			});
			this.repository.insertSyncRun({
				chatId,
				peer,
				startedAt,
				finishedAt,
				status: 'success',
				inserted: counters.inserted,
				updated: counters.updated,
				skipped: counters.skipped,
				totalProcessed: sortedMessages.length,
				firstMessageId:
					sortedMessages.length > 0 ? Number(sortedMessages[0].id) : null,
				lastMessageId,
				errorText: null,
			});

			return {
				chatId,
				peer,
				inserted: counters.inserted,
				updated: counters.updated,
				skipped: counters.skipped,
				totalProcessed: sortedMessages.length,
				lastMessageId,
				mode: strategy.getMode(),
			};
		} catch (error) {
			const finishedAt = new Date().toISOString();
			const errorMessage = (error as Error).message;

			this.repository.upsertSyncState({
				chatId,
				lastMessageId: previousLastMessageId,
				lastSyncStartedAt: startedAt,
				lastSyncFinishedAt: finishedAt,
				status: 'error',
				errorText: errorMessage,
			});
			this.repository.insertSyncRun({
				chatId,
				peer,
				startedAt,
				finishedAt,
				status: 'error',
				inserted: 0,
				updated: 0,
				skipped: 0,
				totalProcessed: 0,
				firstMessageId: null,
				lastMessageId: previousLastMessageId,
				errorText: errorMessage,
			});
			throw error;
		}
	}

	/**
	 * @async
	 * @description Поиск диалога best-effort, чтобы в архиве сохранялись понятные
	 * названия и username, а не только сырой peer.
	 * @param {string} peer - Peer, использованный в синке.
	 * @param {number} limit - Повторно использует лимит синка, чтобы ограничить обход диалогов.
	 * @returns {Promise<any | undefined>} Подходящий диалог или undefined.
	 */
	private async findDialogForPeer(
		peer: string,
		limit: number
	): Promise<any | undefined> {
		try {
			const strategy = await initClient();
			const dialogs = await strategy.getDialogs({
				limit: Math.max(limit, 200),
			});

			return dialogs.find((dialog: any) => {
				const candidates = [
					dialog?.id?.toString?.(),
					dialog?.entity?.id?.toString?.(),
					dialog?.username,
					dialog?.entity?.username,
					dialog?.title,
				].filter(Boolean);

				return candidates.includes(peer);
			});
		} catch (error) {
			console.warn(
				'[ArchiveSyncService] Unable to resolve dialog metadata:',
				error
			);
			return undefined;
		}
	}
}
