/**
 * @module modules/eternal-ai/services/eternal-ai-service-singleton
 * @description Лениво создаёт Eternal AI сервис и пересобирает его, когда
 * меняются путь к SQLite или конфигурация провайдера.
 */

import { getConfig } from '../../../services/config-service.js';
import { EternalAiDatabase } from '../eternal-ai-db.js';
import { EternalAiRepository } from '../eternal-ai-repository.js';
import { EternalAiService } from '../eternal-ai-service.js';

let database: EternalAiDatabase | null = null;
let repository: EternalAiRepository | null = null;
let service: EternalAiService | null = null;
let currentDatabasePath: string | null = null;
let currentBaseUrl: string | null = null;
let currentApiKey: string | null = null;
let currentModel: string | null = null;

export function getEternalAiService(): EternalAiService {
	ensureEternalAiService();
	return service as EternalAiService;
}

export function getEternalAiDatabasePath(): string | null {
	ensureEternalAiService();
	return database?.getDatabasePath() || null;
}

export function resetEternalAiServices(): void {
	database?.close();
	database = null;
	repository = null;
	service = null;
	currentDatabasePath = null;
	currentBaseUrl = null;
	currentApiKey = null;
	currentModel = null;
}

function ensureEternalAiService(): void {
	const config = getConfig();
	const nextDatabasePath = config.eternalAiDatabasePath || null;
	const nextBaseUrl = config.eternalAiBaseUrl || null;
	const nextApiKey = config.eternalAiApiKey || null;
	const nextModel = config.eternalAiModel || null;

	if (
		service &&
		currentDatabasePath === nextDatabasePath &&
		currentBaseUrl === nextBaseUrl &&
		currentApiKey === nextApiKey &&
		currentModel === nextModel
	) {
		return;
	}

	resetEternalAiServices();
	database = new EternalAiDatabase({
		databasePath: nextDatabasePath || undefined,
	});
	repository = new EternalAiRepository(database.getConnection());
	service = new EternalAiService(
		repository,
		getConfig,
		() => database?.getDatabasePath() || ''
	);
	currentDatabasePath = nextDatabasePath;
	currentBaseUrl = nextBaseUrl;
	currentApiKey = nextApiKey;
	currentModel = nextModel;
}
