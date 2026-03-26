import type { EmojiMapping } from './telegram/formatting';
import type { VectorSettingsInterface } from './vector';
import type { UIPluginSettings } from './ui-plugins';
import { defaultVectorSettings } from './vector';
import { DEFAULT_UI_PLUGIN_SETTINGS } from './ui-plugins';

export interface TelegramChannelConfig {
	name: string;
	channelId: string;
}

export interface TelegramFolderConfig {
	folder: string;
	channels: TelegramChannelConfig[];
}

export interface TelegramSettings {
	customEmojis?: EmojiMapping[];
	useCustomEmojis?: boolean;
	disableWebPagePreview?: boolean;
	folderConfigs: TelegramFolderConfig[];
}

/**
 * @description Настройки MVP архива Telegram в плагине: включение UI, путь БД на сервере,
 * адрес userbot-сервера, peer и лимиты по умолчанию.
 */
export interface ArchiveSettings {
	enableArchive: boolean;
	serverHost: string;
	serverPort: number;
	databasePath: string;
	defaultDesktopExportPath: string;
	defaultSyncLimit: number;
	recentMessagesLimit: number;
}

export interface KoraMcpPluginSettings {
	port: number;
	telegram: TelegramSettings;
	gramjs?: {
		mode?: 'bot' | 'userbot';
		apiId?: number;
		apiHash?: string;
		stringSession?: string;
		botToken?: string;
		chatId?: string;
	};
	archiveSettings: ArchiveSettings;
	vectorSettings: VectorSettingsInterface;
	eternalAiSettings: {
		enableEternalAi: boolean;
		apiKey: string;
		baseUrl: string;
		model: string;
		databasePath: string;
		defaultSystemPrompt: string;
	};
	uiPlugins: UIPluginSettings;
}

export const DEFAULT_SETTINGS: KoraMcpPluginSettings = {
	port: 8123,
	telegram: {
		customEmojis: [
			{
				standard: '🗿',
				customId: '5346283626868812660',
				description: 'Moai',
			},
			{
				standard: '🧠',
				customId: '5346180109567028520',
				description: 'Brain',
			},
			{
				standard: '✅',
				customId: '5345939909226034997',
				description: 'Check',
			},
			{
				standard: '❓',
				customId: '5346065137587482787',
				description: 'Question',
			},
			{
				standard: '🛑',
				customId: '5345787871678723001',
				description: 'Stop',
			},
			{
				standard: '➕',
				customId: '5345922583327962454',
				description: 'Plus',
			},
			{
				standard: '❤️',
				customId: '5345784989755668154',
				description: 'Heart',
			},
			{
				standard: '📂',
				customId: '5346104226084844010',
				description: 'Folder',
			},
			{
				standard: '💾',
				customId: '5346103010609101716',
				description: 'Floppy',
			},
			{
				standard: '🫂',
				customId: '5346048443049607054',
				description: 'Hug',
			},
			{
				standard: '🗺️',
				customId: '5346278150785497951',
				description: 'Map',
			},
		],
		useCustomEmojis: false,
		disableWebPagePreview: true,
		folderConfigs: [],
	},
	gramjs: {
		apiId: 0,
		apiHash: '',
		stringSession: '',
		chatId: '',
	},
	archiveSettings: {
		enableArchive: true,
		serverHost: '127.0.0.1',
		serverPort: 8125,
		databasePath: 'data/telegram-archive.sqlite',
		defaultDesktopExportPath: '',
		defaultSyncLimit: 200,
		recentMessagesLimit: 50,
	},
	vectorSettings: defaultVectorSettings,
	eternalAiSettings: {
		enableEternalAi: true,
		apiKey: '',
		baseUrl: 'https://open.eternalai.org/v1',
		model: 'uncensored-eternal-ai-1.0',
		databasePath: 'data/eternal-ai-chat.sqlite',
		defaultSystemPrompt: '',
	},
	uiPlugins: DEFAULT_UI_PLUGIN_SETTINGS,
};
