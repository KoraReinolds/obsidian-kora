/**
 * @module modules/personal-admin/services/archive-service-singleton
 * @description Лениво создаёт и переиспользует сервисы архива Telegram: HTTP-маршруты
 * делят один владелец SQLite на каждый настроенный путь к БД.
 */

import { getConfig } from '../../../services/config-service.js';
import { ArchiveDatabase } from '../archive/archive-db.js';
import { ArchiveRepository } from '../archive/archive-repository.js';
import { ArchiveSyncService } from '../archive/archive-sync-service.js';

let database: ArchiveDatabase | null = null;
let repository: ArchiveRepository | null = null;
let syncService: ArchiveSyncService | null = null;
let currentDatabasePath: string | null = null;

/**
 * @description Возвращает общий репозиторий архива в соответствии с текущим
 * runtime-конфигом. Пересоздаёт владельца SQLite при смене пути к БД.
 * @returns {ArchiveRepository} Общий экземпляр репозитория.
 */
export function getArchiveRepository(): ArchiveRepository {
	ensureArchiveServices();
	return repository as ArchiveRepository;
}

/**
 * @description Возвращает общий сервис синхронизации архива в соответствии с текущим конфигом.
 * @returns {ArchiveSyncService} Общий экземпляр сервиса синка.
 */
export function getArchiveSyncService(): ArchiveSyncService {
	ensureArchiveServices();
	return syncService as ArchiveSyncService;
}

/**
 * @description Сбрасывает кэш сервисов архива. Вызывается при смене пути к БД в конфиге.
 * @returns {void}
 */
export function resetArchiveServices(): void {
	database?.close();
	database = null;
	repository = null;
	syncService = null;
	currentDatabasePath = null;
}

function ensureArchiveServices(): void {
	const config = getConfig();
	const nextPath = config.archiveDatabasePath || null;

	if (database && currentDatabasePath === nextPath) {
		return;
	}

	resetArchiveServices();
	database = new ArchiveDatabase({ databasePath: nextPath || undefined });
	repository = new ArchiveRepository(database.getConnection());
	syncService = new ArchiveSyncService(repository);
	currentDatabasePath = nextPath;
}
