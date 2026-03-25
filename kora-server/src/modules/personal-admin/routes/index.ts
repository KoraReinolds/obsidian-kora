import type { Express } from 'express';
import { registerArchiveBackfillRoutes } from './archive-backfill.js';
import { registerArchiveChatRoutes } from './archive-chats.js';
import { registerArchiveImportDesktopRoutes } from './archive-import-desktop.js';
import { registerArchiveSingleMessageRoutes } from './archive-message.js';
import { registerArchiveMessageRoutes } from './archive-messages.js';
import { registerArchiveSyncStateRoutes } from './archive-sync-state.js';
import { registerArchiveSyncRoutes } from './archive-sync.js';

/**
 * @description Регистрирует HTTP-маршруты personal-admin модуля.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerPersonalAdminRoutes(app: Express): void {
	registerArchiveSyncRoutes(app);
	registerArchiveBackfillRoutes(app);
	registerArchiveImportDesktopRoutes(app);
	registerArchiveChatRoutes(app);
	registerArchiveMessageRoutes(app);
	registerArchiveSyncStateRoutes(app);
	registerArchiveSingleMessageRoutes(app);
}
