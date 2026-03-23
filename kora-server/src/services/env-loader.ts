/**
 * @module services/env-loader
 * @description Загружает `.env` для kora-server из корня пакета, даже когда код
 * исполняется из `dist/kora-server/src`. Это устраняет рассинхрон между dev/runtime
 * и гарантирует, что bot/userbot процессы видят один и тот же файл окружения.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as configDotenv } from 'dotenv';

/**
 * @description Ищет корень пакета kora-server по наличию `package.json`, затем
 * best-effort загружает `.env` из этой директории. Повторный вызов безопасен:
 * dotenv не затирает уже установленные переменные без override.
 * @returns {string | null} Путь к найденному `.env` или null, если файл отсутствует.
 */
export function loadKoraServerEnv(): string | null {
	const currentFile = fileURLToPath(import.meta.url);
	let currentDir = path.dirname(currentFile);

	while (true as boolean) {
		const packageJsonPath = path.join(currentDir, 'package.json');
		if (fs.existsSync(packageJsonPath)) {
			const envPath = path.join(currentDir, '.env');
			if (fs.existsSync(envPath)) {
				configDotenv({ path: envPath });
				return envPath;
			}

			return null;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			return null;
		}

		currentDir = parentDir;
	}
}
