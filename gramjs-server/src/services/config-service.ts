/**
 * ConfigService: Holds runtime configuration for the GramJS server.
 * Provides getters/setters and a simple shape to validate completeness.
 */

// Load environment variables from .env (based on process.cwd()) before reading process.env
import 'dotenv/config';

export type TelegramMode = 'bot' | 'userbot';

export interface ServerConfig {
  apiId: number | undefined;
  apiHash: string | undefined;
  stringSession: string | undefined;
  botToken: string | undefined;
  mode: TelegramMode;
}

let configState: ServerConfig = {
  apiId: process.env.TELEGRAM_API_ID ? Number(process.env.TELEGRAM_API_ID) : undefined,
  apiHash: process.env.TELEGRAM_API_HASH,
  stringSession: process.env.TELEGRAM_SESSION,
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  mode: (process.env.TELEGRAM_MODE as TelegramMode) || 'bot',
};

/**
 * JSDoc: Returns the current config snapshot.
 */
export function getConfig(): ServerConfig {
  return { ...configState };
}

/**
 * JSDoc: Mutates current config with partial fields.
 */
export function updateConfig(partial: Partial<ServerConfig>): ServerConfig {
  configState = { ...configState, ...partial };
  return getConfig();
}

/**
 * JSDoc: Returns minimal validation info for UI and logs.
 */
export function getConfigValidation(mode: TelegramMode): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (mode === 'bot') {
    if (!configState.botToken) missing.push('botToken');
  } else {
    if (!configState.apiId) missing.push('apiId');
    if (!configState.apiHash) missing.push('apiHash');
    if (!configState.stringSession) missing.push('stringSession');
  }
  return { ok: missing.length === 0, missing };
}
