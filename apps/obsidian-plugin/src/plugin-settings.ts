import type { EmojiMapping } from '../../../modules/telegram';
import type { VectorSettingsInterface } from '../../../modules/vector';
import type { UIPluginSettings } from '../../../modules/ui-plugins';
import { defaultVectorSettings } from '../../../modules/vector';
import { DEFAULT_UI_PLUGIN_SETTINGS } from '../../../modules/ui-plugins';

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
	defaultPeer: string;
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
	uiPlugins: UIPluginSettings;
}

export const DEFAULT_SETTINGS: KoraMcpPluginSettings = {
	port: 8123,
	telegram: {
		customEmojis: [
			{
				standard: 'СЂСџвЂ”С—',
				customId: '5346283626868812660',
				description: 'Moai',
			},
			{
				standard: 'СЂСџВ§В ',
				customId: '5346180109567028520',
				description: 'Brain',
			},
			{
				standard: 'РІСљвЂ¦',
				customId: '5345939909226034997',
				description: 'Check',
			},
			{
				standard: 'РІСњвЂњ',
				customId: '5346065137587482787',
				description: 'Question',
			},
			{
				standard: 'СЂСџвЂєвЂ',
				customId: '5345787871678723001',
				description: 'Stop',
			},
			{
				standard: 'РІС›вЂў',
				customId: '5345922583327962454',
				description: 'Plus',
			},
			{
				standard: 'РІСњВ¤РїС‘РЏ',
				customId: '5345784989755668154',
				description: 'Heart',
			},
			{
				standard: 'СЂСџвЂњвЂљ',
				customId: '5346104226084844010',
				description: 'Folder',
			},
			{
				standard: 'СЂСџвЂ™С•',
				customId: '5346103010609101716',
				description: 'Floppy',
			},
			{
				standard: 'СЂСџВ«вЂљ',
				customId: '5346048443049607054',
				description: 'Hug',
			},
			{
				standard: 'СЂСџвЂ”С”',
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
		defaultPeer: '',
		defaultSyncLimit: 200,
		recentMessagesLimit: 50,
	},
	vectorSettings: defaultVectorSettings,
	uiPlugins: DEFAULT_UI_PLUGIN_SETTINGS,
};
